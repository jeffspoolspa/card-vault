import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { CardForm } from '../components/CardForm';
import type { CardCollectionRequestRow } from '@card-vault/shared';

interface RequestWithCustomer extends CardCollectionRequestRow {
  customerName?: string;
}

export function CollectPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState<RequestWithCustomer | null>(null);

  useEffect(() => {
    if (!token) {
      navigate('/expired');
      return;
    }

    async function validateToken() {
      const { data, error } = await supabase
        .from('card_collection_requests')
        .select('*, Customers(first_name, last_name)')
        .eq('token', token!)
        .single();

      if (error || !data || data.status !== 'pending' || new Date(data.expires_at) < new Date()) {
        navigate('/expired');
        return;
      }

      const customerName = (data as any).Customers
        ? `${(data as any).Customers.first_name} ${(data as any).Customers.last_name}`
        : undefined;

      setRequest({ ...data, customerName });
      setLoading(false);
    }

    validateToken();
  }, [token, navigate]);

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading">Validating link...</div>
      </div>
    );
  }

  if (!request) return null;

  return (
    <div className="page-container">
      <div className="card-wrapper">
        <div className="header">
          <div className="shield-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0071e3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <h1>Secure Card Collection</h1>
          {request.customerName ? (
            <p className="subtitle">Hi {request.customerName} — please enter your card details below. Your information is encrypted before it leaves your device.</p>
          ) : (
            <p className="subtitle">Your card information is encrypted before it leaves your device.</p>
          )}
        </div>

        <CardForm
          customerId={request.customer_id}
          onSuccess={() => navigate('/success')}
          token={token!}
        />
      </div>
    </div>
  );
}
