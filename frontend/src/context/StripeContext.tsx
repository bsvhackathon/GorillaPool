import { createContext, useContext, type ReactNode } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { stripePublishableKey } from '../constants';

// Debug log for Stripe key (will be removed in production)
console.log(`Stripe key prefix: ${stripePublishableKey ? `${stripePublishableKey.substring(0, 7)}...` : "empty"}`);

// Initialize Stripe
const stripePromise = loadStripe(stripePublishableKey);

// Create a context for any stripe-related functions we want to access globally
type StripeContextType = Record<string, never>;
const StripeContext = createContext<StripeContextType>({});

export const useStripe = () => {
  return useContext(StripeContext);
};

interface StripeProviderProps {
  children: ReactNode;
}

export const StripeProvider = ({ children }: StripeProviderProps) => {
  // We can add stripe-specific functions and state here if needed
  const contextValue: StripeContextType = {};

  return (
    <StripeContext.Provider value={contextValue}>
      <Elements stripe={stripePromise}>
        {children}
      </Elements>
    </StripeContext.Provider>
  );
}; 