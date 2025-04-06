import type React from 'react';
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

type PaymentMethod = 'stripe' | 'wallet';

interface SettingsContextType {
  preferredPayment: PaymentMethod;
  setPreferredPayment: (method: PaymentMethod) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

interface SettingsProviderProps {
  children: ReactNode;
}

export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const [preferredPayment, setPreferredPayment] = useState<PaymentMethod>(() => {
    // Try to load from localStorage
    const saved = localStorage.getItem('preferredPayment');
    return (saved as PaymentMethod) || 'stripe'; // Default to stripe
  });

  // Save to localStorage when changed
  useEffect(() => {
    localStorage.setItem('preferredPayment', preferredPayment);
  }, [preferredPayment]);

  const value = {
    preferredPayment,
    setPreferredPayment,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}; 