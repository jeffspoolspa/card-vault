import { useState, useEffect, useRef, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { CardCollectionRequestRow } from '@card-vault/shared';

interface Customer {
  id: number;
  display_name: string;
}

const COLLECT_BASE_URL = import.meta.env.VITE_COLLECT_URL || window.location.origin;

export function GenerateLinkPage() {
  const { user } = useOutletContext<any>();
  const [results, setResults] = useState<Customer[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Customer | null>(null);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [pendingLinks, setPendingLinks] = useState<CardCollectionRequestRow[]>([]);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const search = useCallback(async (searchQuery: string) => {
    const { data } = await supabase.rpc('search_customers', {
      search_query: searchQuery.trim(),
    });
    if (data) setResults(data);
  }, []);

  // Debounced search on query change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      search(query);
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  // Fetch pending links for selected customer
  useEffect(() => {
    if (!selected) {
      setPendingLinks([]);
      return;
    }
    async function fetchPending() {
      const { data } = await supabase
        .from('card_collection_requests')
        .select('*')
        .eq('customer_id', selected!.id)
        .in('status', ['pending'])
        .order('created_at', { ascending: false });

      if (data) setPendingLinks(data);
    }
    fetchPending();
  }, [selected]);

  async function handleGenerate() {
    if (!selected) return;
    setGenerating(true);

    // Generate 32-char hex token
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

    const { error } = await supabase.from('card_collection_requests').insert({
      customer_id: selected.id,
      token,
      expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      created_by: user.id,
    });

    if (!error) {
      const link = `${COLLECT_BASE_URL}/collect?token=${token}`;
      setGeneratedLink(link);
      // Refresh pending links
      const { data } = await supabase
        .from('card_collection_requests')
        .select('*')
        .eq('customer_id', selected.id)
        .in('status', ['pending'])
        .order('created_at', { ascending: false });
      if (data) setPendingLinks(data);
    }

    setGenerating(false);
  }

  async function handleCopyLink() {
    if (!generatedLink) return;
    await navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <div className="page-header">
        <h1>Generate Collection Link</h1>
      </div>

      <div className="form-section">
        <div className="field">
          <label>Customer</label>
          {selected ? (
            <div className="selected-customer">
              <span>{selected.display_name}</span>
              <button
                onClick={() => { setSelected(null); setQuery(''); setGeneratedLink(null); }}
                className="btn btn-sm btn-muted"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="search-wrapper">
              <input
                type="text"
                placeholder="Search customer..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setIsOpen(true);
                }}
                onFocus={() => setIsOpen(true)}
                onBlur={() => setTimeout(() => setIsOpen(false), 200)}
                className="input"
                autoFocus
              />
              {isOpen && results.length > 0 && (
                <ul className="dropdown">
                  {results.map((c) => (
                    <li key={c.id} onClick={() => { setSelected(c); setQuery(''); setIsOpen(false); }}>
                      {c.display_name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {selected && (
          <button onClick={handleGenerate} disabled={generating} className="btn btn-primary">
            {generating ? 'Generating...' : 'Generate Link'}
          </button>
        )}

        {generatedLink && (
          <div className="generated-link-box">
            <label>Collection Link</label>
            <div className="link-row">
              <input type="text" value={generatedLink} readOnly className="input" />
              <button onClick={handleCopyLink} className="btn btn-primary">
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
            </div>
          </div>
        )}

        {pendingLinks.length > 0 && (
          <div className="pending-links">
            <h3>Pending Links for {selected?.display_name}</h3>
            <ul>
              {pendingLinks.map((link) => (
                <li key={link.id}>
                  Token: {link.token.slice(0, 8)}... — Expires: {new Date(link.expires_at).toLocaleString()}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
