import type { CardVaultRow } from '@card-vault/shared';
import { RevealCard } from './RevealCard';
import { CopyButton } from './CopyButton';
import { supabase } from '../lib/supabase';

interface CardWithCustomer extends CardVaultRow {
  customer_name?: string;
}

interface CardTableProps {
  cards: CardWithCustomer[];
  privateKey: CryptoKey;
  masterPassword: string;
  userEmail: string;
  onRefresh: () => void;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function BrandIcon({ brand }: { brand: string | null }) {
  if (!brand) return <span className="brand-text">—</span>;
  const b = brand.toLowerCase();
  let color = '#697386';
  if (b === 'visa') color = '#1A1F71';
  else if (b === 'mastercard') color = '#EB001B';
  else if (b === 'amex' || b === 'american express') color = '#006FCF';
  else if (b === 'discover') color = '#FF6000';
  return <span className="brand-text" style={{ color }}>{brand}</span>;
}

export function CardTable({ cards, privateKey, masterPassword, userEmail, onRefresh }: CardTableProps) {
  async function handleArchive(cardId: string) {
    await supabase.from('card_vault').update({ status: 'archived' }).eq('id', cardId);
    await supabase.from('card_vault_access_log').insert({
      card_vault_id: cardId,
      action: 'archived',
      performed_by_email: userEmail,
    });
    onRefresh();
  }

  async function handleDelete(cardId: string) {
    if (!window.confirm('Delete this card permanently?')) return;
    await supabase.from('card_vault_access_log').insert({
      card_vault_id: cardId,
      action: 'deleted',
      performed_by_email: userEmail,
    });
    await supabase.from('card_vault').delete().eq('id', cardId);
    onRefresh();
  }

  if (cards.length === 0) {
    return <p className="empty-state">No cards found.</p>;
  }

  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Card</th>
            <th>Status</th>
            <th>Added</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {cards.map((card) => (
            <tr key={card.id}>
              <td className="cell-customer">{card.customer_name || '—'}</td>
              <td>
                <div className="card-info-cell">
                  <BrandIcon brand={card.card_brand} />
                  <span className="card-last-four">•••• {card.card_last_four}</span>
                </div>
              </td>
              <td>
                <span className={`status-dot status-dot-${card.status}`} />
                <span className="status-label">{card.status}</span>
              </td>
              <td className="cell-date">{formatDate(card.created_at)}</td>
              <td className="actions-cell">
                <RevealCard
                  card={card}
                  privateKey={privateKey}
                  masterPassword={masterPassword}
                  userEmail={userEmail}
                  onReEncrypted={onRefresh}
                />
                <CopyButton
                  card={card}
                  privateKey={privateKey}
                  masterPassword={masterPassword}
                  userEmail={userEmail}
                />
                {card.status === 'active' && (
                  <button onClick={() => handleArchive(card.id)} className="action-link">
                    Archive
                  </button>
                )}
                <button onClick={() => handleDelete(card.id)} className="action-link action-link-danger">
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
