import { useState, type FC, useEffect } from 'react';
import { useWallet } from '../context/WalletContext';
import { useYoursWallet } from 'yours-wallet-provider';
import { priceUsd, apiUrl, marketApiUrl, stripeProductId } from '../constants';

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
  const [isFocused, setIsFocused] = useState(false);
  const [isCheckingName, setIsCheckingName] = useState(false);
  const [nameStatus, setNameStatus] = useState<NameStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [addresses, setAddresses] = useState<{bsvAddress?: string; ordAddress?: string}>({});
  const [checkFailed, setCheckFailed] = useState(false);
  const [lastCheckedName, setLastCheckedName] = useState('');
  
  // Get wallet from context
  const { isConnected, isProcessing, connectWallet } = useWallet();
  const wallet = useYoursWallet();
  
  // Check for return from Stripe Checkout
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    
    if (query.get("success")) {
      const purchasedName = localStorage.getItem("pendingNameRegistration");
      if (purchasedName) {
        // Registration was successful
        const formattedName = `${purchasedName}@1sat.name`;
        
        // Register the name and notify parent component
        registerNameWithApi(purchasedName)
          .then(() => onBuy(formattedName))
          .then(() => {
            // Clear storage and url parameters
            localStorage.removeItem("pendingNameRegistration");
            window.history.replaceState({}, document.title, window.location.pathname);
          })
          .catch(err => {
            setError(`Payment was successful but name registration failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            localStorage.removeItem("pendingNameRegistration");
            window.history.replaceState({}, document.title, window.location.pathname);
          });
      }
    }

    if (query.get("canceled")) {
      // User canceled the checkout
      setError("Name registration was canceled. You can try again when you're ready.");
      localStorage.removeItem("pendingNameRegistration");
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [onBuy]);
  
  // When the name input changes, check if it's available
  useEffect(() => {
    // Clear any existing error
    if (error) {
      setError(null);
    }
    
    // Clear check failed state when name input changes
    if (nameInput !== lastCheckedName) {
      setCheckFailed(false);
    }
    
    // Wait for debounce
    const delay = setTimeout(() => {
      // Only check if name length is sufficient and we haven't already failed checking this exact name
      if (nameInput && nameInput.length >= 3 && !checkFailed) {
        setLastCheckedName(nameInput);
        
        checkNameAvailability(nameInput).catch(err => {
          // On network error, mark this check as failed to prevent retries
          setIsCheckingName(false);
          setCheckFailed(true);
          setError(`Name check failed: ${err instanceof Error ? err.message : 'Network error'}`);
        });
      } else if (nameInput && nameInput.length < 3) {
        // Name is too short, don't bother checking availability
        setNameStatus(null);
      }
    }, 500);
    
    return () => clearTimeout(delay);
  }, [nameInput, error, checkFailed, lastCheckedName]);

  // Update wallet addresses when connected
  useEffect(() => {
    if (isConnected && wallet && typeof wallet.getAddresses === 'function') {
      getAddresses();
    }
  }, [isConnected, wallet]);
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.trim().toLowerCase();
    // Only allow letters and numbers
    const sanitized = value.replace(/[^a-z0-9]/g, '');
    
    // If the name is changing, reset error states
    if (sanitized !== nameInput) {
      setError(null);
      setCheckFailed(false);
    }
    
    setNameInput(sanitized);
  };
  
  const handleBuyClick = async () => {
    if (!isConnected) {
      // Connect wallet first
      try {
        await connectWallet();
      } catch (err) {
        console.error('Error connecting wallet:', err);
        setError(`Failed to connect wallet: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
      return;
    }
    
    handleBuy();
  };
  
  const checkNameAvailability = async (name: string): Promise<void> => {
    if (!name) return;
    
    setIsCheckingName(true);
    setNameStatus(null);
    setError(null);
    
    try {
      // Check if the name has been mined using the new endpoint
      const response = await fetch(`${apiUrl}/mine/${name}`);
      
      if (!response.ok) {
        throw new Error(`Failed to check name availability: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // If mined is false, it means someone already mined/registered this name
      if (!data.outpoint) {
        // Name is registered, check if it's for sale on the marketplace
        try {
        // api/inscriptions/{outpoint}
          const marketResponse = await fetch(`${marketApiUrl}/inscriptions/${data.outpoint}`);
          
          if (marketResponse.ok) {
            const marketData = await marketResponse.json();
            setNameStatus({ 
              registered: true,
              forSale: true,
              price: marketData.price || 5 // Default to $5 if price not specified
            });
          } else {
            // Name is registered but not for sale
            setNameStatus({ registered: true, forSale: false });
          }
        } catch (marketErr) {
          console.error('Error checking marketplace:', marketErr);
          // If market check fails, assume registered but not for sale
          setNameStatus({ registered: true, forSale: false });
        }
      } else {
        // Name is available (not mined)
        setNameStatus({ registered: false });
      }
    } catch (err) {
      console.error('Error checking name:', err);
      setError(`Failed to check name availability: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsCheckingName(false);
    }
  };
  
  const getAddresses = async () => {
    try {
      if (!wallet?.getAddresses) {
        throw new Error('Wallet does not support getAddresses method');
      }
      
      const walletAddresses = await wallet.getAddresses();
      
      if (walletAddresses?.bsvAddress) {
        setAddresses({
          bsvAddress: walletAddresses.bsvAddress,
          ordAddress: walletAddresses.ordAddress
        });
        return walletAddresses;
      }
      
      console.error('Ordinal address not available in wallet response');
      setError('Could not retrieve ordinal address from wallet. Please ensure your wallet supports ordinals.');
      return null;
    } catch (err) {
      console.error('Error getting addresses:', err);
      setError(`Failed to get wallet addresses: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return null;
    }
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
          address: addresses?.bsvAddress || ''
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
      // For new registrations, redirect to Stripe Checkout
      try {
        setIsLoading(true);
        
        // Save the name being registered in localStorage for retrieval after payment
        localStorage.setItem("pendingNameRegistration", nameInput);
        
        // Create Stripe checkout session
        const response = await fetch(`${apiUrl}/create-checkout-session`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            productId: stripeProductId,
            name: nameInput,
            price: priceUsd * 100, // Convert to cents
            success_url: `${window.location.origin}${window.location.pathname}?success=true`,
            cancel_url: `${window.location.origin}${window.location.pathname}?canceled=true`,
          }),
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || 'Failed to create checkout session');
        }
        
        const { url } = await response.json();
        
        // Redirect to Stripe checkout
        window.location.href = url;
      } catch (err) {
        console.error('Error creating checkout session:', err);
        setError(`Failed to create checkout session: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setIsLoading(false);
      }
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

  // Add a retry button for when checks fail
  const handleRetryCheck = () => {
    if (nameInput) {
      setCheckFailed(false);
      setError(null);
      
      // Trigger an immediate check
      checkNameAvailability(nameInput).catch(err => {
        setIsCheckingName(false);
        setCheckFailed(true);
        setError(`Name check failed: ${err instanceof Error ? err.message : 'Network error'}`);
      });
    }
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
              <div className="label flex justify-between items-center">
                <span className="label-text-alt text-error">{error}</span>
                {checkFailed && (
                  <button 
                    type="button" 
                    className="btn btn-xs btn-outline" 
                    onClick={handleRetryCheck}
                  >
                    Retry
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default NameRegistration; 