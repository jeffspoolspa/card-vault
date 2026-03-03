import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

interface Customer {
  id: number;
  display_name: string;
}

interface CustomerSearchProps {
  onSelect: (customer: Customer) => void;
  selected: Customer | null;
}

export function CustomerSearch({ onSelect, selected }: CustomerSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const search = useCallback(async (searchQuery: string) => {
    setLoading(true);
    const { data, error } = await supabase.rpc('search_customers', {
      search_query: searchQuery.trim(),
    });
    if (!error && data) setResults(data);
    setLoading(false);
  }, []);

  // Load initial results on mount
  useEffect(() => {
    search('');
  }, [search]);

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

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (selected) {
    return (
      <div className="customer-selected">
        <span>{selected.display_name}</span>
        <button
          type="button"
          onClick={() => {
            onSelect(null as any);
            setQuery('');
          }}
          className="customer-clear"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="customer-search" ref={wrapperRef}>
      <input
        type="text"
        placeholder="Search customer by name..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        className="input"
      />
      {isOpen && results.length > 0 && (
        <ul className="customer-dropdown">
          {results.map((c) => (
            <li
              key={c.id}
              onClick={() => {
                onSelect(c);
                setQuery(c.display_name);
                setIsOpen(false);
              }}
            >
              {c.display_name}
            </li>
          ))}
        </ul>
      )}
      {isOpen && loading && <div className="customer-loading">Searching...</div>}
    </div>
  );
}
