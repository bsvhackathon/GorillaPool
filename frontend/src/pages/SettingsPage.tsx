import { useState, type FC } from 'react';
import { useSettings } from '../context/SettingsContext';
import Settings from '../components/Settings';

const SettingsPage: FC = () => {
  const { preferredPayment, setPreferredPayment } = useSettings();
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const handlePaymentMethodChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const method = event.target.value as 'stripe' | 'wallet';
    setPreferredPayment(method);
    setSavedMessage('Settings saved!');
    setTimeout(() => setSavedMessage(null), 3000);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold merriweather-bold mb-8">
        <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          Settings
        </span>
      </h1>

      {/* Theme Settings Component */}
      <Settings />

      {/* Payment Preferences */}
      <div className="card bg-base-200 shadow-xl mt-8">
        <div className="card-body">
          <h2 className="card-title">Payment Preferences</h2>
          
          <div className="form-control w-full max-w-xs">
            <label htmlFor="paymentMethod" className="label">
              <span className="label-text">Preferred Payment Method</span>
            </label>
            <select 
              id="paymentMethod"
              className="select select-bordered" 
              value={preferredPayment}
              onChange={handlePaymentMethodChange}
            >
              <option value="stripe">Credit Card (Stripe)</option>
              <option value="wallet">Yours Wallet (Direct BSV)</option>
            </select>
            <div className="label">
              <span className="label-text-alt">
                Select how you prefer to pay for name registrations
              </span>
            </div>
          </div>

          {savedMessage && (
            <div className="alert alert-success mt-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{savedMessage}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage; 