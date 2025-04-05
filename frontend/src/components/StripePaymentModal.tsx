import { useState, type FC } from 'react';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { apiUrl, priceUsd, stripeProductId } from '../constants';

interface StripePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  name: string;
  onSuccess: (name: string) => Promise<void>;
}

const StripePaymentModal: FC<StripePaymentModalProps> = ({ 
  isOpen, 
  onClose, 
  name,
  onSuccess 
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Format display name for payment
  const displayName = name.includes('@') ? name : `${name}@1sat.name`;
  
  if (!isOpen) return null;
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!stripe || !elements) {
      setError('Stripe has not loaded yet. Please try again.');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Create payment intent on the server
      const intentResponse = await fetch(`${apiUrl}/payments/create-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: priceUsd * 100, // Stripe uses cents
          productId: stripeProductId,
          name: name, // Just the name part without the domain
          type: 'name_registration'
        }),
      });
      
      if (!intentResponse.ok) {
        const errorData = await intentResponse.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(errorData.message || 'Failed to create payment intent');
      }
      
      const { clientSecret } = await intentResponse.json();
      
      // Use client secret to complete payment
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        throw new Error('Card element not found');
      }
      
      const paymentResult = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            name: 'Name Registration',
          },
        },
      });
      
      if (paymentResult.error) {
        throw new Error(paymentResult.error.message || 'Payment failed');
      }
      
      if (paymentResult.paymentIntent?.status === 'succeeded') {
        // Call onSuccess callback to update UI and state
        await onSuccess(displayName);
        
        // Close modal
        onClose();
      }
    } catch (err) {
      console.error('Payment error:', err);
      setError(`Payment failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="modal-box bg-base-200 max-w-md w-full p-6 rounded-lg shadow-xl">
        <h3 className="font-bold text-lg mb-4">Purchase Name</h3>
        <p className="mb-4">
          Registering <span className="font-mono font-semibold">{displayName}</span>
        </p>
        <p className="mb-6">
          Price: <span className="font-bold">${priceUsd.toFixed(2)}</span>
        </p>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="card-element" className="label">
              <span className="label-text">Card details</span>
            </label>
            <div id="card-element" className="bg-base-100 p-3 rounded border border-base-300">
              <CardElement
                options={{
                  style: {
                    base: {
                      fontSize: '16px',
                      color: '#424770',
                      '::placeholder': {
                        color: '#aab7c4',
                      },
                    },
                    invalid: {
                      color: '#9e2146',
                    },
                  },
                }}
              />
            </div>
          </div>
          
          {error && (
            <div className="alert alert-error mb-4 text-sm">
              {error}
            </div>
          )}
          
          <div className="modal-action flex justify-end">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!stripe || isLoading}
            >
              {isLoading ? (
                <span className="loading loading-spinner loading-sm" />
              ) : (
                `Pay $${priceUsd.toFixed(2)}`
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StripePaymentModal; 