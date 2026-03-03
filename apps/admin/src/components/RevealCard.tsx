import { useState, useEffect, useRef } from 'react';
import {
  decryptCardDataWithEnvelope,
  decryptCardDataWithPassword,
  reEncryptForStorage,
  REVEAL_DISPLAY_SECONDS,
} from '@card-vault/shared';
import type { CardVaultRow } from '@card-vault/shared';
import { supabase } from '../lib/supabase';

interface RevealCardProps {
  card: CardVaultRow;
  privateKey: CryptoKey;
  masterPassword: string;
  userEmail: string;
  onReEncrypted?: () => void;
}

export function RevealCard({ card, privateKey, masterPassword, userEmail, onReEncrypted }: RevealCardProps) {
  const [revealed, setRevealed] = useState<{ cardNumber: string; cardExp: string } | null>(null);
  const [decrypting, setDecrypting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [countdown, setCountdown] = useState(REVEAL_DISPLAY_SECONDS);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Countdown display
  useEffect(() => {
    if (!revealed) return;

    setCountdown(REVEAL_DISPLAY_SECONDS);
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          setRevealed(null);
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [revealed]);

  async function handleReveal() {
    setDecrypting(true);
    setError(null);

    try {
      let result: { cardNumber: string; cardExp: string };

      if (card.encrypted_envelope) {
        // Decrypt via RSA envelope
        result = await decryptCardDataWithEnvelope(
          privateKey,
          card.encrypted_envelope,
          card.card_number_encrypted,
          card.card_exp_encrypted,
          card.aes_iv_number,
          card.aes_iv_exp,
        );

        // Re-encrypt for simpler future decryptions
        const reEncrypted = await reEncryptForStorage(masterPassword, result.cardNumber, result.cardExp);
        await supabase
          .from('card_vault')
          .update({
            card_number_encrypted: reEncrypted.card_number_encrypted,
            card_exp_encrypted: reEncrypted.card_exp_encrypted,
            aes_iv_number: reEncrypted.aes_iv_number,
            aes_iv_exp: reEncrypted.aes_iv_exp,
            aes_salt: reEncrypted.aes_salt,
            encrypted_envelope: null,
          })
          .eq('id', card.id);

        onReEncrypted?.();
      } else if (card.aes_salt) {
        // Decrypt via PBKDF2 (already re-encrypted)
        result = await decryptCardDataWithPassword(
          masterPassword,
          card.aes_salt,
          card.card_number_encrypted,
          card.card_exp_encrypted,
          card.aes_iv_number,
          card.aes_iv_exp,
        );
      } else {
        throw new Error('Card has no encryption envelope or salt');
      }

      setRevealed(result);

      // Log access
      await supabase.from('card_vault_access_log').insert({
        card_vault_id: card.id,
        action: 'viewed',
        performed_by_email: userEmail,
      });

      // Auto-hide timer
      timerRef.current = setTimeout(() => setRevealed(null), REVEAL_DISPLAY_SECONDS * 1000);
    } catch {
      setError('Failed to decrypt card');
    } finally {
      setDecrypting(false);
    }
  }

  if (revealed) {
    const formatted = revealed.cardNumber.replace(/(.{4})/g, '$1 ').trim();
    const expFormatted = `${revealed.cardExp.slice(0, 2)}/${revealed.cardExp.slice(2)}`;

    return (
      <>
        <div className="reveal-backdrop" onClick={() => setRevealed(null)} />
        <div className="reveal-modal">
          <div className="reveal-card-visual">
            <div className="reveal-card-top">
              <div className="reveal-chip" />
              {card.card_brand && <span className="reveal-brand">{card.card_brand}</span>}
            </div>
            <div className="reveal-card-number">{formatted}</div>
            <div className="reveal-card-bottom">
              <div className="reveal-card-exp">{expFormatted}</div>
              <div className="reveal-timer">{countdown}s</div>
            </div>
          </div>
          <button className="btn btn-sm reveal-close" onClick={() => setRevealed(null)}>
            Dismiss
          </button>
        </div>
      </>
    );
  }

  return (
    <span>
      <button onClick={handleReveal} disabled={decrypting} className="action-link action-link-primary">
        {decrypting ? '...' : 'Reveal'}
      </button>
      {error && <span className="inline-error">{error}</span>}
    </span>
  );
}
