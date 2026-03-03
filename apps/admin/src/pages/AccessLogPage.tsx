import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { CardVaultAccessLogRow } from '@card-vault/shared';

interface LogEntry extends CardVaultAccessLogRow {
  card_last_four?: string;
  card_brand?: string;
}

export function AccessLogPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState<string>('all');

  useEffect(() => {
    async function fetchLogs() {
      setLoading(true);

      let query = supabase
        .from('card_vault_access_log')
        .select('*, card_vault(card_last_four, card_brand)')
        .order('accessed_at', { ascending: false })
        .limit(200);

      if (actionFilter !== 'all') {
        query = query.eq('action', actionFilter);
      }

      const { data } = await query;

      if (data) {
        const entries: LogEntry[] = data.map((row: any) => ({
          ...row,
          card_last_four: row.card_vault?.card_last_four,
          card_brand: row.card_vault?.card_brand,
          card_vault: undefined,
        }));
        setLogs(entries);
      }

      setLoading(false);
    }

    fetchLogs();
  }, [actionFilter]);

  const actions = ['all', 'viewed', 'copied', 'created', 'created_manual_entry', 'deleted', 'archived'];

  return (
    <div>
      <div className="page-header">
        <h1>Access Log</h1>
      </div>

      <div className="toolbar">
        <div className="status-filters">
          {actions.map((a) => (
            <button
              key={a}
              onClick={() => setActionFilter(a)}
              className={`filter-btn ${actionFilter === a ? 'active' : ''}`}
            >
              {a === 'all' ? 'All' : a.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="loading-text">Loading logs...</p>
      ) : logs.length === 0 ? (
        <p className="empty-state">No log entries found.</p>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>Card</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{new Date(log.accessed_at).toLocaleString()}</td>
                  <td>{log.performed_by_email || '—'}</td>
                  <td>
                    <span className="action-badge">{log.action.replace(/_/g, ' ')}</span>
                  </td>
                  <td>
                    {log.card_last_four
                      ? `${log.card_brand || ''} ••••${log.card_last_four}`
                      : '—'}
                  </td>
                  <td className="mono">{log.ip_address || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
