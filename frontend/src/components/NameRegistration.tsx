import { useState, type FC, useEffect, useCallback } from 'react';
import { useWallet } from '../context/WalletContext';
import { useYoursWallet } from 'yours-wallet-provider';
import { priceUsd, apiUrl, marketApiUrl, marketAddress } from '../constants';
import { useSettings } from '../context/SettingsContext';

interface NameRegistrationProps {
  onBuy: (name: string) => Promise<void>;
}

interface NameStatus {
  registered: boolean;
  forSale?: boolean;
  price?: number;
  outpoint?: string;
}

const NameRegistration: FC<NameRegistrationProps> = ({ onBuy }) => {
  const [nameInput, setNameInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isCheckingName, setIsCheckingName] = useState(false);
  const [nameStatus, setNameStatus] = useState<NameStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [addresses, setAddresses] = useState<{ bsvAddress?: string; ordAddress?: string }>({});
  const [checkFailed, setCheckFailed] = useState(false);
  const [lastCheckedName, setLastCheckedName] = useState('');
  const [transaction, setTransaction] = useState<string | null>(null);

  // Get wallet from context
  const { isConnected, isProcessing, connectWallet, purchaseOrdinal } = useWallet();
  const wallet = useYoursWallet();
  const { preferredPayment } = useSettings();

  // Check for return from Stripe Checkout
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);

    if (query.get("success")) {
      const purchasedName = localStorage.getItem("pendingNameRegistration");
      if (purchasedName) {
        // Show success message - the actual registration is handled by the webhook
        const formattedName = `${purchasedName}@1sat.name`;
        
        // Notify parent component of the purchase
        onBuy(formattedName).catch(err => {
          console.error("Error notifying of purchase:", err);
        });
        
        // Show registration being processed message
        setTransaction("processing"); // Using a special value to indicate registration is being processed
        
        // Clear storage and url parameters
        localStorage.removeItem("pendingNameRegistration");
        window.history.replaceState({}, document.title, window.location.pathname);
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

  const getAddresses = useCallback(async () => {
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
  }, [wallet]);

  // Update wallet addresses when connected
  useEffect(() => {
    if (isConnected && wallet && typeof wallet.getAddresses === 'function') {
      getAddresses();
    }
  }, [isConnected, wallet, getAddresses]);

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
      // Check if the name has been registered using the API endpoint
      const response = await fetch(`${apiUrl}/mine/${name}`);

      // If we get a 404, it means the name is not found (available)
      if (response.status === 404) {
        setNameStatus({ registered: false });
        setIsCheckingName(false);
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to check name availability: ${response.statusText}`);
      }

      const data = await response.json();

      // If data.outpoint exists, it means someone already registered this name
      if (data.outpoint) {
        // Name is already registered and we have the outpoint directly
        const outpoint = data.outpoint;

        try {
          // Check if it's for sale on the marketplace
          const marketResponse = await fetch(`${marketApiUrl}/inscriptions/${outpoint}`);

          if (marketResponse.ok) {
            const marketData = (await marketResponse.json()).data;

            // Check if it has a listing (the list object with sale=true indicates it's for sale)
            if (marketData?.list && marketData.list.sale === true) {
              // Ensure the price exists in the listing
              if (!marketData.list.price) {
                throw new Error('Listing is missing a valid price');
              }
              
              setNameStatus({
                registered: true,
                forSale: true,
                price: marketData.list.price,
                outpoint // Store the outpoint for the purchase function
              });
            } else {
              // Name is registered but not listed for sale
              setNameStatus({ registered: true, forSale: false });
            }
          } else {
            // Name is registered but not found in marketplace
            setNameStatus({ registered: true, forSale: false });
          }
        } catch (marketErr) {
          console.error('Error checking marketplace:', marketErr);
          // If market check fails, assume registered but not for sale
          setNameStatus({ registered: true, forSale: false });
        }
      } else {
        // Name is available (not registered yet)
        setNameStatus({ registered: false });
      }
    } catch (err) {
      console.error('Error checking name:', err);
      setError(`Failed to check name availability: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsCheckingName(false);
    }
  };

  const createStripeCheckout = async (name: string, priceInCents: number): Promise<void> => {
    try {
      // Get wallet address if available
      let address = '';
      if (addresses?.bsvAddress) {
        address = addresses.bsvAddress;
      }
      
      // Create form data for the request
      const formData = new URLSearchParams();
      formData.append('productId', 'name-registration');
      formData.append('name', name);
      formData.append('price', priceInCents.toString());
      formData.append('success_url', `${window.location.origin}?success=true`);
      formData.append('cancel_url', `${window.location.origin}?canceled=true`);
      
      // Include wallet address if available
      if (address) {
        formData.append('address', address);
      }
      
      const response = await fetch(`${apiUrl}/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Failed to create checkout session');
      }

      const { url } = await response.json();
      
      // Save the name being registered in localStorage
      localStorage.setItem("pendingNameRegistration", name);

      // Redirect to Stripe checkout
      window.location.href = url;
    } catch (err) {
      console.error('Error creating checkout session:', err);
      setError(`Failed to create checkout session: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setIsLoading(false);
    }
  };

  const handleDirectWalletPayment = async (satoshis: number) => {
    try {
      setIsLoading(true);

      // ensure wallet is connected
      await wallet.connect();

      setError('');

      if (!wallet || !isConnected) {
        setError('Wallet is not connected');
        setIsLoading(false);
        return;
      }
      
      // Log using BSV for display only
      const bsvAmount = satoshis / 100000000;
      console.log(`Sending ${satoshis} satoshis (${bsvAmount} BSV) to ${marketAddress}`);
      
      // Send payment directly to market address using the wallet
      const walletResponse = await wallet.sendBsv([
        {
          address: marketAddress,
          satoshis: satoshis,
        }
      ]);

      if (!walletResponse || !walletResponse.txid) {
        setError('Payment failed or was cancelled');
        setIsLoading(false);
        return;
      }

      console.log("Payment successful:", walletResponse);
      const txid = walletResponse.txid;

      if (!addresses.ordAddress) {
        setError('No ordinal address available');
        setIsLoading(false);
        return;
      }

      // Mark the payment as complete by notifying the backend
      // This will register the name as paid in Redis
      const paymentCompleteResponse = await fetch(`${apiUrl}/payment-complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: nameInput,
          txid: txid,
          address: addresses.ordAddress
        }),
      });

      if (!paymentCompleteResponse.ok) {
        const paymentErrorData = await paymentCompleteResponse.json();
        console.error("Payment notification error:", paymentErrorData);
        setError(paymentErrorData.error || 'Failed to notify server of payment');
        setIsLoading(false);
        return;
      }

      const paymentData = await paymentCompleteResponse.json();
      console.log("Payment notification response:", paymentData);

      // If payment-complete endpoint already handled the registration,
      // we don't need to call register endpoint again
      if (paymentData.success) {
        // Success! Update UI
        setTransaction(txid);
        const formattedName = `${nameInput}@1sat.name`;
        onBuy(formattedName);
        setIsLoading(false);
        return;
      }

      // Fallback to register endpoint if payment-complete didn't handle registration
      const registerResponse = await fetch(`${apiUrl}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          handle: nameInput,
          address: addresses.bsvAddress || '', // Use the user's wallet address for the registration
        }).toString(),
      });

      if (!registerResponse.ok) {
        const errorData = await registerResponse.json();
        console.error("Registration error:", errorData);
        setError(errorData.error || 'Failed to register name');
        setIsLoading(false);
        return;
      }

      const registerData = await registerResponse.json();
      console.log("Registration response:", registerData);

      // Success! Update UI
      setTransaction(txid);
      const formattedName = `${nameInput}@1sat.name`;
      onBuy(formattedName);
      setIsLoading(false);
    } catch (error) {
      console.error("Error during wallet payment:", error);
      setError(`Payment failed: ${error instanceof Error ? error.message : String(error)}`);
      setIsLoading(false);
    }
  };

  const handleBuy = async () => {
    if (!isConnected) {
      try {
        await connectWallet();
      } catch (err) {
        console.error('Error connecting wallet:', err);
        setError(`Failed to connect wallet: ${err instanceof Error ? err.message : 'Unknown error'}`);
        return;
      }
    }

    if (!nameStatus) {
      setError('Please check name availability first');
      return;
    }

    if (nameStatus.registered && !nameStatus.forSale) {
      setError('This name is already registered and not for sale');
      return;
    }

    if (nameStatus.registered && nameStatus.forSale) {
      // Name is for sale on marketplace, use purchaseOrdinal
      handleBuyFromMarketplace();
    } else {
      // Name is available for registration
      if (preferredPayment === 'wallet') {
        // Get exchange rate - fail if we can't get a valid rate
        try {
          let exchangeRate: number | null = null;
          
          if (wallet.getExchangeRate) {
            const walletRate = await wallet.getExchangeRate();
            if (walletRate && typeof walletRate === 'number' && !Number.isNaN(walletRate) && walletRate > 0) {
              exchangeRate = walletRate;
              console.log('Using wallet exchange rate:', exchangeRate);
            }
          }
          
          // Try to get from localStorage as fallback (like MarketPage does)
          if (exchangeRate === null) {
            const cachedRate = localStorage.getItem('bsvExchangeRate');
            if (cachedRate) {
              try {
                const rateData = JSON.parse(cachedRate);
                // Only use cached rate if it's less than 1 hour old and it's a valid number
                if (rateData.timestamp && Date.now() - rateData.timestamp < 60 * 60 * 1000 &&
                    typeof rateData.rate === 'number' && !Number.isNaN(rateData.rate) && rateData.rate > 0) {
                  exchangeRate = rateData.rate;
                  console.log('Using cached exchange rate:', exchangeRate);
                }
              } catch (e) {
                console.warn('Error parsing cached exchange rate:', e);
              }
            }
          }
          
          // Fail if we couldn't get a valid exchange rate
          if (exchangeRate === null) {
            throw new Error('Could not obtain a valid exchange rate. Please try again later.');
          }
          
          // Calculate satoshis from USD price
          // $1 USD / (USD per BSV) = Fraction of BSV needed
          // Then multiply by 100M to get satoshis
          const satoshis = Math.floor((priceUsd / exchangeRate) * 100000000);
          console.log(`Converting $${priceUsd} to satoshis using rate $${exchangeRate}/BSV: ${satoshis} satoshis`);
          
          handleDirectWalletPayment(satoshis);
        } catch (err) {
          console.error('Error calculating price:', err);
          setError(`Failed to calculate price in BSV: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      } else {
        // For Stripe, price is in USD cents
        handleStripePayment(priceUsd);
      }
    }
  };

  // Pay directly with Yours wallet
  const handleBuyFromMarketplace = async () => {
    if (!nameStatus?.outpoint) {
      setError('Missing outpoint for purchase');
      return;
    }
    
    setIsLoading(true);
    setError('');
    
    try {
      const txid = await purchaseOrdinal({
        outpoint: nameStatus.outpoint,
      });
      
      if (txid) {
        setTransaction(txid);
        const formattedName = `${nameInput}@1sat.name`;
        onBuy(formattedName);
      } else {
        throw new Error('No transaction ID returned');
      }
    } catch (err) {
      console.error('Error purchasing from marketplace:', err);
      setError(`Purchase failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle payment with Stripe
  const handleStripePayment = async (price: number) => {
    if (!nameInput) return;
    
    try {
      localStorage.setItem("pendingNameRegistration", nameInput);
      await createStripeCheckout(nameInput, price * 100);
    } catch (err) {
      console.error('Error creating checkout session:', err);
      setError(`Failed to create checkout session: ${err instanceof Error ? err.message : 'Unknown error'}`);
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

    return `Register $${priceUsd}`;
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
          <div className="flex items-center flex-wrap gap-x-3">
            <h2 className="card-title m-0">
              <span className="merriweather-bold text-3xl text-secondary">
                {nameInput ? 'Register ' : 'Choose your '}
                {nameInput ? '' : <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">1sat name</span>}
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

          <p className="text-lg mb-4 text-base-content">names available for ${priceUsd} each</p>

          <div className="form-control w-full">
            <label htmlFor="nameInput" className="label mb-1">
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
              <label className={`input input-bordered join-item flex-grow ${nameStatus?.registered && !nameStatus.forSale ? 'input-error' :
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

          {/* Purchase confirmation and success messaging */}
          {transaction && !error && (
            <div className="alert alert-success mt-4">
              {transaction === "processing" ? (
                <div>
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className="stroke-current shrink-0 h-6 w-6 mr-2" 
                    fill="none" 
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>
                    Payment successful! Your name is being registered on the blockchain.
                    This process may take a few minutes to complete.
                  </span>
                </div>
              ) : (
                <span>
                  Registration successful! Transaction ID: <span className="font-mono text-xs">{transaction}</span>
                </span>
              )}
            </div>
          )}


        </div>


      </div>


    </>
  );
};

export default NameRegistration; 