import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { CardTable } from '../components/CardTable';
import type { CardVaultRow } from '@card-vault/shared';

interface CardWithCustomer extends CardVaultRow {
  customer_name?: string;
}

type StatusFilter = 'active' | 'used' | 'archived' | 'all';

export function CardListPage() {
  const { vault, user } = useOutletContext<any>();
  const [cards, setCards] = useState<CardWithCustomer[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [loading, setLoading] = useState(true);

  const fetchCards = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from('card_vault')
      .select('*, Customers(first_name, last_name)')
      .order('created_at', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;

    if (!error && data) {
      const enriched: CardWithCustomer[] = data.map((row: any) => ({
        ...row,
        customer_name: row.Customers
          ? `${row.Customers.first_name} ${row.Customers.last_name}`
          : undefined,
        Customers: undefined,
      }));
      setCards(enriched);
    }

    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  const filtered = search.trim()
    ? cards.filter(
        (c) =>
          c.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
          c.card_last_four.includes(search),
      )
    : cards;

  return (
    <div>
      <div className="page-header">
        <h1>Cards on File</h1>
      </div>

      <div className="toolbar">
        <input
          type="text"
          placeholder="Search by customer or last four..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input search-input"
        />

        <div className="status-filters">
          {(['active', 'used', 'archived', 'all'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`filter-btn ${statusFilter === s ? 'active' : ''}`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="loading-text">Loading cards...</p>
      ) : (
        <CardTable
          cards={filtered}
          privateKey={vault.privateKey}
          masterPassword={vault.masterPassword}
          userEmail={user.email}
          onRefresh={fetchCards}
        />
      )}
    </div>
  );
}
