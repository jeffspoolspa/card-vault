import { useState } from 'react';
import { CustomerSearch } from '../components/CustomerSearch';
import { CardForm } from '../components/CardForm';

interface Customer {
  id: number;
  display_name: string;
}

export function AddCardPage() {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function handleSuccess() {
    setSuccess(`Card saved for ${customer?.display_name}`);
    setCustomer(null);
  }

  return (
    <div className="page-container">
      <div className="card-wrapper">
        <div className="header">
          <h1>Add Card</h1>
          <p className="subtitle">Enter card information received over the phone.</p>
        </div>

        {success && (
          <div className="success-banner">
            <span className="success-check">&#10003;</span>
            {success}
            <button onClick={() => setSuccess(null)} className="dismiss-btn">
              Add Another
            </button>
          </div>
        )}

        {!success && (
          <div className="form-stack">
            <div className="field">
              <label>Customer</label>
              <CustomerSearch onSelect={setCustomer} selected={customer} />
            </div>

            {customer && (
              <CardForm
                customerId={customer.id}
                onSuccess={handleSuccess}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
