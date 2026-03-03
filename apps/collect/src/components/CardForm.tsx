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

export function CardForm({ customerId, onSuccess, token }: CardFormProps) {
  const [cardNumber, setCardNumber] = useState('');
  const [expiration, setExpiration] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [zip, setZip] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const rawNumber = stripCardNumber(cardNumber);
  const brand = detectCardBrand(rawNumber);
  const numberValid = rawNumber.length >= 13 && isValidCardLength(rawNumber) && luhnCheck(rawNumber);
  const expValid = expiration.length === 5 && isExpirationValid(expiration);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validationError = validateCard(rawNumber, expiration);
    if (validationError) {
      setError(validationError);
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
      // Fetch RSA public key
      const { data: publicKeyJwk, error: pkError } = await supabase.rpc('get_public_key');
      if (pkError || !publicKeyJwk) throw new Error('Failed to fetch encryption key');

      const rsaPublicKey = JSON.parse(publicKeyJwk);

      // Encrypt card data
      const expClean = expiration.replace(/\D/g, '');
      const encrypted = await encryptCardData(rsaPublicKey, rawNumber, expClean);

      // Insert into card_vault
      const { error: insertError } = await supabase.from('card_vault').insert({
        customer_id: customerId,
        card_number_encrypted: encrypted.card_number_encrypted,
        card_exp_encrypted: encrypted.card_exp_encrypted,
        card_last_four: getLastFour(rawNumber),
        card_brand: detectCardBrand(rawNumber),
        encrypted_envelope: encrypted.encrypted_envelope,
        aes_iv_number: encrypted.aes_iv_number,
        aes_iv_exp: encrypted.aes_iv_exp,
        billing_zip: zip.trim(),
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
      setCardholderName('');
      setZip('');

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card-form" autoComplete="off">
      {/* Card information - grouped */}
      <div className="field">
        <label>Card information</label>
        <div className="input-group">
          <div className="input-group-row">
            <input
              type="text"
              inputMode="numeric"
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
              value={zip}
              onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
              placeholder="ZIP"
              className="input-group-field input-group-split-right"
              maxLength={5}
              autoComplete="postal-code"
            />
          </div>
        </div>
      </div>

      {/* Name on card */}
      <div className="field">
        <label>Name on card</label>
        <input
          type="text"
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
        {submitting ? 'Saving...' : 'Save card'}
      </button>
    </form>
  );
}
