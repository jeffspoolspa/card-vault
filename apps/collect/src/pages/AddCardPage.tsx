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
  const [preAuthDollars, setPreAuthDollars] = useState('');

  const preAuthCents = preAuthDollars ? Math.round(parseFloat(preAuthDollars) * 100) : 0;

  function handleSuccess() {
    setSuccess(`Card saved for ${customer?.display_name}`);
    setCustomer(null);
    setPreAuthDollars('');
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
              <>
                <div className="field">
                  <label>Pre-authorization amount</label>
                  <div className="dollar-input-wrapper">
                    <span className="dollar-prefix">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={preAuthDollars}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^\d.]/g, '');
                        // Allow only one decimal point and max 2 decimal places
                        const parts = val.split('.');
                        if (parts.length > 2) return;
                        if (parts[1] && parts[1].length > 2) return;
                        setPreAuthDollars(val);
                      }}
                      placeholder="0.00"
                      className="input dollar-input"
                    />
                  </div>
                  <span className="field-hint">Leave blank to skip card validation</span>
                </div>

                <CardForm
                  customerId={customer.id}
                  onSuccess={handleSuccess}
                  preAuthAmount={preAuthCents || undefined}
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
