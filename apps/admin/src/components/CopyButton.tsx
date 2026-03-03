import { useState } from 'react';
import {
  decryptCardDataWithEnvelope,
  decryptCardDataWithPassword,
  CLIPBOARD_CLEAR_SECONDS,
} from '@card-vault/shared';
import type { CardVaultRow } from '@card-vault/shared';
import { supabase } from '../lib/supabase';

interface CopyButtonProps {
  card: CardVaultRow;
  privateKey: CryptoKey;
  masterPassword: string;
  userEmail: string;
}

export function CopyButton({ card, privateKey, masterPassword, userEmail }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);

  async function handleCopy() {
    setCopying(true);

    try {
      let cardNumber: string;

      if (card.encrypted_envelope) {
        const result = await decryptCardDataWithEnvelope(
          privateKey,
          card.encrypted_envelope,
          card.card_number_encrypted,
          card.card_exp_encrypted,
          card.aes_iv_number,
          card.aes_iv_exp,
        );
        cardNumber = result.cardNumber;
      } else if (card.aes_salt) {
        const result = await decryptCardDataWithPassword(
          masterPassword,
          card.aes_salt,
          card.card_number_encrypted,
          card.card_exp_encrypted,
          card.aes_iv_number,
          card.aes_iv_exp,
        );
        cardNumber = result.cardNumber;
      } else {
        throw new Error('No encryption data');
      }

      await navigator.clipboard.writeText(cardNumber);
      setCopied(true);

      // Log access
      await supabase.from('card_vault_access_log').insert({
        card_vault_id: card.id,
        action: 'copied',
        performed_by_email: userEmail,
      });

      // Clear clipboard after timeout
      setTimeout(async () => {
        await navigator.clipboard.writeText('');
        setCopied(false);
      }, CLIPBOARD_CLEAR_SECONDS * 1000);
    } catch {
      // silently fail
    } finally {
      setCopying(false);
    }
  }

  return (
    <button onClick={handleCopy} disabled={copying || copied} className="action-link">
      {copied ? 'Copied' : copying ? '...' : 'Copy'}
    </button>
  );
}
