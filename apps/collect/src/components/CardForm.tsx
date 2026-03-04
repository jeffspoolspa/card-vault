import { useState } from 'react';
import {
  encryptCardData,
  validateCard,
  stripCardNumber,
  formatCardNumber,
  formatExpiration,
  getLastFour,
  detectCardBrand,
  luhnCheck,
  isValidCardLength,
  isExpirationValid,
} from '@card-vault/shared';
import { supabase } from '../lib/supabase';

interface CardFormProps {
  customerId: number;
  onSuccess: () => void;
  token?: string;
  preAuthAmount?: number; // cents
}

function CardBrandIcons({ detected }: { detected: string | null }) {
  return (
    <div className="brand-icons">
      <svg width="24" height="16" viewBox="0 0 24 16" className={detected && detected !== 'Visa' ? 'brand-dim' : ''}>
        <rect width="24" height="16" rx="2" fill="#1A1F71"/>
        <text x="12" y="11" textAnchor="middle" fill="#fff" fontSize="7" fontWeight="700" fontStyle="italic">VISA</text>
      </svg>
      <svg width="24" height="16" viewBox="0 0 24 16" className={detected && detected !== 'Mastercard' ? 'brand-dim' : ''}>
        <rect width="24" height="16" rx="2" fill="#f5f5f5"/>
        <circle cx="9" cy="8" r="5" fill="#EB001B" opacity="0.9"/>
        <circle cx="15" cy="8" r="5" fill="#F79E1B" opacity="0.9"/>
        <circle cx="12" cy="8" r="3.2" fill="#FF5F00" opacity="0.9"/>
      </svg>
      <svg width="24" height="16" viewBox="0 0 24 16" className={detected && detected !== 'American Express' ? 'brand-dim' : ''}>
        <rect width="24" height="16" rx="2" fill="#2E77BC"/>
        <text x="12" y="11" textAnchor="middle" fill="#fff" fontSize="5.5" fontWeight="700">AMEX</text>
      </svg>
      <svg width="24" height="16" viewBox="0 0 24 16" className={detected && detected !== 'Discover' ? 'brand-dim' : ''}>
        <rect width="24" height="16" rx="2" fill="#f5f5f5"/>
        <circle cx="14" cy="8" r="4.5" fill="#F68121"/>
        <text x="8" y="11" textAnchor="middle" fill="#333" fontSize="4.5" fontWeight="700">D</text>
      </svg>
    </div>
  );
}

function friendlyCardError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('cvc is invalid') || lower.includes('cvv is invalid'))
    return 'The security code (CVV) is invalid. Please check and try again.';
  if (lower.includes('card number is invalid') || lower.includes('number is invalid'))
    return 'The card number is invalid. Please check and try again.';
  if (lower.includes('card already exists'))
    return 'This card is already on file.';
  if (lower.includes('expired'))
    return 'This card is expired. Please use a different card.';
  if (lower.includes('declined'))
    return 'The card was declined. Please check the details or try a different card.';
  if (lower.includes('insufficient funds'))
    return 'The card was declined due to insufficient funds.';
  if (lower.includes('number is required'))
    return 'The card number is missing. Please enter a valid card number.';
  if (lower.includes('token refresh failed') || lower.includes('invalid_grant'))
    return 'We are having trouble connecting to our payment processor. Please try again in a few minutes.';
  if (lower.includes('customer not found'))
    return 'Customer record not found. Please contact support.';
  if (lower.includes('non-2xx'))
    return 'Something went wrong while processing the card. Please try again.';
  if (!raw)
    return 'Something went wrong. Please check the card details and try again.';
  return 'Card could not be processed. Please check your details and try again.';
}

export function CardForm({ customerId, onSuccess, token, preAuthAmount }: CardFormProps) {
  const [cardNumber, setCardNumber] = useState('');
  const [expiration, setExpiration] = useState('');
  const [cvc, setCvc] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [zip, setZip] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const rawNumber = stripCardNumber(cardNumber);
  const brand = detectCardBrand(rawNumber);
  const numberValid = rawNumber.length >= 13 && isValidCardLength(rawNumber) && luhnCheck(rawNumber);
  const expValid = expiration.length === 5 && isExpirationValid(expiration);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatusMessage(null);

    const validationError = validateCard(rawNumber, expiration);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!cvc.trim() || cvc.trim().length < 3) {
      setError('Please enter a valid CVC');
      return;
    }

    if (!cardholderName.trim()) {
      setError('Please enter the cardholder name');
      return;
    }

    if (!zip.trim() || zip.trim().length < 5) {
      setError('Please enter a valid billing ZIP code');
      return;
    }

    setSubmitting(true);

    try {
      // Save card to QBO (always) + optional pre-auth charge
      setStatusMessage('Validating card...');

      const expClean = expiration.replace(/\D/g, '');
      const expMonth = expClean.slice(0, 2);
      const expYear = '20' + expClean.slice(2, 4);

      const { data: authResult, error: authError } = await supabase.functions.invoke('qbo-card-auth', {
        body: {
          customer_id: customerId,
          card_number: rawNumber,
          exp_month: expMonth,
          exp_year: expYear,
          cvc: cvc.trim(),
          cardholder_name: cardholderName.trim(),
          zip: zip.trim(),
          pre_auth_amount: preAuthAmount || undefined,
        },
      });

      const result = authResult ?? {};

      if (authError || !result.success) {
        const raw = result.error || authError?.message || '';
        throw new Error(friendlyCardError(raw));
      }

      const qboCardId = result.qboCardId;
      const qboChargeId = result.qboChargeId;
      const preAuthStatus: 'authorized' | 'skipped' = qboChargeId ? 'authorized' : 'skipped';

      // Encrypt card data
      setStatusMessage('Encrypting card data...');

      const { data: publicKeyJwk, error: pkError } = await supabase.rpc('get_public_key');
      if (pkError || !publicKeyJwk) throw new Error('Failed to fetch encryption key');

      const rsaPublicKey = JSON.parse(publicKeyJwk);

      const encrypted = await encryptCardData(rsaPublicKey, rawNumber, expClean, cvc.trim());

      // Insert into card_vault
      setStatusMessage('Saving card...');

      const { error: insertError } = await supabase.from('card_vault').insert({
        customer_id: customerId,
        card_number_encrypted: encrypted.card_number_encrypted,
        card_exp_encrypted: encrypted.card_exp_encrypted,
        card_cvc_encrypted: encrypted.card_cvc_encrypted,
        card_last_four: getLastFour(rawNumber),
        card_brand: detectCardBrand(rawNumber),
        encrypted_envelope: encrypted.encrypted_envelope,
        aes_iv_number: encrypted.aes_iv_number,
        aes_iv_exp: encrypted.aes_iv_exp,
        aes_iv_cvc: encrypted.aes_iv_cvc,
        billing_zip: zip.trim(),
        qbo_card_id: qboCardId,
        qbo_charge_id: qboChargeId,
        pre_auth_amount: preAuthAmount || null,
        pre_auth_status: preAuthStatus,
      });

      if (insertError) throw new Error(insertError.message);

      // Mark collection request as completed (if token-based)
      if (token) {
        await supabase
          .from('card_collection_requests')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('token', token);
      }

      // Clear form from memory
      setCardNumber('');
      setExpiration('');
      setCvc('');
      setCardholderName('');
      setZip('');
      setStatusMessage(null);

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
      setStatusMessage(null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card-form">
      {/* Card information - grouped */}
      <div className="field">
        <label>Card information</label>
        <div className="input-group">
          <div className="input-group-row">
            <input
              type="text"
              inputMode="numeric"
              name="cc-number"
              value={cardNumber}
              onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
              placeholder="1234 1234 1234 1234"
              className="input-group-field"
              maxLength={23}
              autoComplete="cc-number"
            />
            <CardBrandIcons detected={rawNumber.length >= 2 ? brand : null} />
          </div>
          <div className="input-group-row input-group-bottom">
            <input
              type="text"
              inputMode="numeric"
              name="cc-exp"
              value={expiration}
              onChange={(e) => setExpiration(formatExpiration(e.target.value))}
              placeholder="MM / YY"
              className="input-group-field input-group-split-left"
              maxLength={5}
              autoComplete="cc-exp"
            />
            <input
              type="text"
              inputMode="numeric"
              name="cc-csc"
              value={cvc}
              onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="CVC"
              className="input-group-field input-group-split-middle"
              maxLength={4}
              autoComplete="cc-csc"
            />
            <input
              type="text"
              inputMode="numeric"
              name="billing-zip"
              value={zip}
              onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
              placeholder="ZIP"
              className="input-group-field input-group-split-right"
              maxLength={5}
              autoComplete="billing postal-code"
            />
          </div>
        </div>
      </div>

      {/* Name on card */}
      <div className="field">
        <label>Name on card</label>
        <input
          type="text"
          name="cc-name"
          value={cardholderName}
          onChange={(e) => setCardholderName(e.target.value)}
          className="input"
          autoComplete="cc-name"
        />
      </div>

      {error && (
        <div className="error-message">{error}</div>
      )}

      <button type="submit" disabled={submitting} className="submit-btn">
        {submitting ? (statusMessage || 'Processing...') : 'Save card'}
      </button>
    </form>
  );
}
