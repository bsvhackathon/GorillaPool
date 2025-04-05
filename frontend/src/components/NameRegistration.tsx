import { useState, type FC, useEffect } from 'react';
import { useWallet } from '../context/WalletContext';
import { useYoursWallet } from 'yours-wallet-provider';
import { priceUsd, apiUrl, marketApiUrl } from '../constants';
import StripePaymentModal from './StripePaymentModal';

interface NameRegistrationProps {
  onBuy: (name: string) => Promise<void>;
}

interface NameStatus {
  registered: boolean;
  forSale?: boolean;
  price?: number;
}

const NameRegistration: FC<NameRegistrationProps> = ({ onBuy }) => {
  const [nameInput, setNameInput] = useState('');
  const [nameStatus, setNameStatus] = useState<NameStatus | null>(null);
  const [isCheckingName, setIsCheckingName] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [directOrdAddress, setDirectOrdAddress] = useState<string | null>(null);
  
  // New state for Stripe payment modal
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  
  // Get both the context and direct wallet provider
  const { 
    isConnected, 
    isProcessing, 
    addresses, 
    connectWallet, 
    fetchAddresses 
  } = useWallet();
  const wallet = useYoursWallet();
  
  // Clear error when component mounts
  useEffect(() => {
    setError(null);
  }, []);

  // Check name availability with API
  const checkNameAvailability = async (name: string): Promise<NameStatus> => {
    if (!name) return { registered: false };
    
    setIsCheckingName(true);
    
    try {
      // Check if the name is registered
      const nameResponse = await fetch(`${apiUrl}/check-name`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ handle: name })
      });
      
      if (!nameResponse.ok) {
        throw new Error('Name check failed');
      }
      
      const nameData = await nameResponse.json();
      
      // If registered, check if it's for sale in the market
      if (nameData.registered) {
        try {
          const marketResponse = await fetch(`${marketApiUrl}/check-name`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ handle: name })
          });
          
          if (marketResponse.ok) {
            const marketData = await marketResponse.json();
            return {
              registered: true,
              forSale: marketData.forSale || false,
              price: marketData.price || 0
            };
          }
        } catch (marketError) {
          console.error('Error checking market:', marketError);
        }
        
        // Default to registered but not for sale if market check fails
        return { registered: true, forSale: false };
      }
      
      // Name is available
      return { registered: false };
    } catch (error) {
      console.error('Error checking name availability:', error);
      // For demo, return a mock response
      return { registered: name.includes('taken') };
    } finally {
      setIsCheckingName(false);
    }
  };
  
  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    // Sanitize input: convert to lowercase, remove spaces and special characters
    const sanitizedValue = rawValue.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Only update if the sanitized value is different from raw value
    if (sanitizedValue !== rawValue) {
      e.target.value = sanitizedValue;
    }
    
    // Store only the name part without the suffix
    setNameInput(sanitizedValue);
    setNameStatus(null);
    setError(null);
    
    if (sanitizedValue) {
      const status = await checkNameAvailability(sanitizedValue);
      setNameStatus(status);
    }
  };

  const handleBuyClick = async () => {
    // If not connected, trigger wallet connection first
    if (!isConnected) {
      try {
        console.log('Wallet provider status before connect:',
          'isReady:', wallet.isReady,
          'isConnected:', wallet.isConnected
        );
        
        await connectWallet();
        console.log('Wallet connected successfully');
        
        // Verify connection after connect
        console.log('Wallet provider status after connect:',
          'isReady:', wallet.isReady,
          'isConnected:', wallet.isConnected
        );
        
        // After connection, the component will re-render
        // and the button state will update appropriately
        return;
      } catch (err) {
        console.error('Connection error:', err);
        setError(`Failed to connect wallet: ${err instanceof Error ? err.message : 'Unknown error'}`);
        return;
      }
    }
    
    // If connected, proceed with the buy flow
    await handleBuy();
  };

  const registerNameWithApi = async (handle: string): Promise<boolean> => {
    try {
      const response = await fetch(`${apiUrl}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          handle,
          // Include wallet information if needed by the API
          address: addresses.bsvAddress || ''
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Registration failed');
      }
      
      const data = await response.json();
      return data.success || false;
    } catch (error) {
      console.error('API registration error:', error);
      throw error;
    }
  };

  const handleBuy = async () => {
    if (!nameInput) return;
    if (nameStatus?.registered && !nameStatus.forSale) {
      setError('This name is already registered and not for sale.');
      return;
    }
    
    // Handle marketplace purchase directly
    if (nameStatus?.registered && nameStatus.forSale) {
      setIsLoading(true);
      setError(null);
      
      try {
        // Create the formatted name with the suffix
        const formattedName = `${nameInput}@1sat.name`;
        
        // Handle marketplace purchase
        console.log(`Purchasing ${formattedName} from marketplace for $${nameStatus.price}`);
        // Implement marketplace purchase logic here
        
        // For now, just simulate success
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // If we got here, transaction was successful
        await onBuy(formattedName);
        
        // Clear the input
        setNameInput('');
        setNameStatus(null);
      } catch (err) {
        console.error('Error buying name from marketplace:', err);
        setError(`Failed to purchase name: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setIsLoading(false);
      }
    } else {
      // For new registrations, open the Stripe payment modal
      setIsPaymentModalOpen(true);
    }
  };

  // Handle successful payment and name registration
  const handlePaymentSuccess = async (name: string) => {
    try {
      // Register the name with the API after payment
      console.log(`Registering name after payment: ${name}`);
      await registerNameWithApi(nameInput);
      
      // Call the onBuy callback
      await onBuy(name);
      
      // Clear the input
      setNameInput('');
      setNameStatus(null);
    } catch (err) {
      console.error('Error registering name after payment:', err);
      setError(`Payment was successful but name registration failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Determine button text based on name status
  const getButtonText = () => {
    if (isLoading || isProcessing) {
      return <span className="loading loading-spinner loading-sm" />;
    }
    
    if (!isConnected) {
      return 'Connect';
    }
    
    if (nameStatus?.registered) {
      if (nameStatus.forSale) {
        return `Buy ($${nameStatus.price})`;
      }
      return 'Unavailable';
    }
    
    return 'Register ($1)';
  };

  // Determine button disabled state
  const isButtonDisabled = () => {
    if (isLoading || isProcessing || isCheckingName) return true;
    if (!nameInput) return true;
    if (nameStatus?.registered && !nameStatus.forSale) return true;
    return false;
  };

  return (
    <>
      <div className="card bg-base-200 shadow-xl mb-8 max-w-2xl mx-auto">
        <div className="card-body">
          <div className="flex items-center flex-wrap gap-x-3 mb-2">
            <h2 className="card-title m-0">
              <span className="merriweather-bold text-3xl text-primary">
                {nameInput ? 'Register' : 'Choose your 1sat name'}
              </span> 
            </h2>
            
            <div className="relative min-h-8 overflow-hidden flex-1">
              {nameInput ? (
                <div className={`font-mono text-2xl transition-all duration-300 whitespace-nowrap overflow-x-auto ${isFocused ? 'text-primary' : 'text-base-content'}`} style={{ 
                  transformOrigin: 'left center',
                  transform: isFocused ? 'scale(1.03)' : 'scale(1)'
                }}>
                  <span className="font-bold">
                    {nameInput}
                  </span>
                  <span className="opacity-70">@1sat.name</span>
                </div>
              ) : (
                <div className="opacity-0 font-mono text-2xl">&nbsp;</div>
              )}
            </div>
          </div>
          
          <p className="text-lg mb-4 text-base-content">1sat names available for ${priceUsd} each</p>
          
          <div className="form-control w-full">
            <label htmlFor="nameInput" className="label">
              <span className="label-text">Enter your name (letters and numbers only)</span>
              {isCheckingName && (
                <span className="label-text-alt">
                  <span className="loading loading-spinner loading-xs mr-1" />
                  Checking...
                </span>
              )}
              {nameStatus?.registered && !nameStatus.forSale && (
                <span className="label-text-alt text-error">Already taken</span>
              )}
              {nameStatus?.registered && nameStatus.forSale && (
                <span className="label-text-alt text-warning">For sale (${nameStatus.price})</span>
              )}
              {nameStatus && !nameStatus.registered && !isCheckingName && (
                <span className="label-text-alt text-success">Available!</span>
              )}
            </label>
            
            <div className="join w-full">
              <label className={`input input-bordered join-item flex-grow ${
                nameStatus?.registered && !nameStatus.forSale ? 'input-error' : 
                nameStatus?.registered && nameStatus.forSale ? 'input-warning' : 
                nameStatus && !nameStatus.registered ? 'input-success' : ''
              } ${isFocused ? 'ring ring-primary ring-opacity-50' : ''}`}>
                <input 
                  id="nameInput"
                  type="text" 
                  placeholder="enter name here" 
                  className="grow"
                  value={nameInput}
                  onChange={handleInputChange}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  disabled={isLoading || isProcessing}
                />
                <span className="opacity-70">@1sat.name</span>
              </label>
              <button 
                type="button"
                className="btn btn-primary join-item"
                onClick={handleBuyClick}
                disabled={isButtonDisabled()}
              >
                {getButtonText()}
              </button>
            </div>
            
            {error && (
              <div className="label">
                <span className="label-text-alt text-error">{error}</span>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Stripe Payment Modal */}
      <StripePaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        name={nameInput}
        onSuccess={handlePaymentSuccess}
      />
    </>
  );
};

export default NameRegistration; 