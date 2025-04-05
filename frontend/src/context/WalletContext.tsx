import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import {
  type SendBsv,
  type SendBsv20Response,
  useYoursWallet,
} from 'yours-wallet-provider';

// Define wallet addresses type
interface WalletAddresses {
  bsvAddress?: string;
  ordAddress?: string;
  identityAddress?: string;
}

// Define social profile type based on the API
interface SocialProfile {
  displayName?: string;
  avatar?: string;
}

interface WalletContextType {
  isConnected: boolean;
  addresses: WalletAddresses;
  socialProfile: SocialProfile;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void; // Changed to non-async to simplify
  sendBsvTransaction: (outputs: SendBsv[]) => Promise<SendBsv20Response>;
  isProcessing: boolean;
  loadSocialProfile: () => Promise<void>;
  fetchAddresses: () => Promise<void>;
  hasValidAddresses: boolean;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const useWallet = (): WalletContextType => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};

interface WalletProviderProps {
  children: ReactNode;
}

export const WalletProvider = ({ children }: WalletProviderProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [addresses, setAddresses] = useState<WalletAddresses>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [socialProfile, setSocialProfile] = useState<SocialProfile>({});
  const [hasValidAddresses, setHasValidAddresses] = useState(false);
  
  const wallet = useYoursWallet();

  // Reset wallet state
  const resetWalletState = useCallback(() => {
    setIsConnected(false);
    setAddresses({});
    setSocialProfile({});
    setHasValidAddresses(false);
  }, []);

  // Check if the error is an Unauthorized error
  const isUnauthorizedError = useCallback((error: unknown): boolean => {
    return error instanceof Error && 
           (error.message.includes('Unauthorized') || 
            error.message.includes('Not connected'));
  }, []);

  // Check if addresses are valid
  const validateAddresses = useCallback((walletAddresses: WalletAddresses): boolean => {
    return Boolean(
      walletAddresses?.bsvAddress && 
      walletAddresses.bsvAddress.length > 0
    );
  }, []);

  // Forward declarations to resolve circular dependencies
  type AsyncFunction = () => Promise<void>;
  const loadSocialProfileRef = useRef<AsyncFunction | null>(null);
  const fetchAddressesRef = useRef<AsyncFunction | null>(null);

  // Load social profile when connected
  const loadSocialProfile = useCallback(async () => {
    if (!isConnected || !wallet.getSocialProfile) return;
    
    try {
      const profile = await wallet.getSocialProfile();
      if (profile) {
        // Only update if we have actual data
        const newProfile: SocialProfile = {};
        
        if (profile.displayName) {
          newProfile.displayName = profile.displayName;
        }
        
        if (profile.avatar) {
          newProfile.avatar = profile.avatar;
        }
        
        // Only update state if we got actual data
        if (Object.keys(newProfile).length > 0) {
          setSocialProfile(newProfile);
        }
      }
    } catch (error) {
      console.error('Error loading social profile:', error);
      // Only disconnect if it's an unauthorized error and we're connected
      if (isConnected && isUnauthorizedError(error)) {
        console.log('Unauthorized error detected when loading profile, resetting wallet state');
        resetWalletState();
      }
    }
  }, [isConnected, wallet, isUnauthorizedError, resetWalletState]);

  // Assign to ref for use in other functions
  useEffect(() => {
    loadSocialProfileRef.current = loadSocialProfile;
  }, [loadSocialProfile]);

  // Fetch wallet addresses
  const fetchAddresses = useCallback(async () => {
    if (!isConnected || !wallet.getAddresses) return;
    
    try {
      const walletAddresses = await wallet.getAddresses();
      
      // Verify we have valid addresses
      if (walletAddresses && validateAddresses(walletAddresses)) {
        setAddresses({
          bsvAddress: walletAddresses.bsvAddress,
          ordAddress: walletAddresses.ordAddress,
          identityAddress: walletAddresses.identityAddress,
        });
        setHasValidAddresses(true);
      } else {
        console.warn('Received empty or invalid addresses from wallet');
        setHasValidAddresses(false);
      }
    } catch (error) {
      console.error('Error fetching wallet addresses:', error);
      setHasValidAddresses(false);
      // Only disconnect if it's an unauthorized error and we're connected
      if (isConnected && isUnauthorizedError(error)) {
        console.log('Unauthorized error detected when fetching addresses, resetting wallet state');
        resetWalletState();
      }
    }
  }, [isConnected, wallet, isUnauthorizedError, resetWalletState, validateAddresses]);

  // Assign to ref for use in other functions
  useEffect(() => {
    fetchAddressesRef.current = fetchAddresses;
  }, [fetchAddresses]);

  // Setup wallet event listeners
  useEffect(() => {
    // Don't set up event listeners if not connected
    if (!isConnected || !wallet?.on) return;

    // Define event handlers
    const handleSwitchAccount = () => {
      console.log('Wallet account switched');
      if (fetchAddressesRef.current) {
        fetchAddressesRef.current().catch(err => console.error('Error after account switch:', err));
      }
      if (loadSocialProfileRef.current) {
        loadSocialProfileRef.current().catch(err => console.error('Error loading profile after account switch:', err));
      }
    };

    const handleSignedOut = () => {
      console.log('Wallet signed out');
      resetWalletState();
    };

    // Set up event listeners
    wallet.on('switchAccount', handleSwitchAccount);
    wallet.on('signedOut', handleSignedOut);
    
    // Clean up on unmount or if connection state changes
    return () => {
      if (wallet.removeListener) {
        wallet.removeListener('switchAccount', handleSwitchAccount);
        wallet.removeListener('signedOut', handleSignedOut);
      }
    };
  }, [isConnected, wallet, resetWalletState]);

  const connectWallet = useCallback(async () => {
    try {
      if (!wallet.isReady) {
        console.error("Wallet extension not installed");
        window.open("https://yours.org", "_blank");
        return;
      }
      
      // Reset state before connecting to ensure a clean start
      resetWalletState();
      
      // Connect to wallet
      console.log('Connecting to wallet...');
      const pubKey = await wallet.connect();
      
      if (pubKey) {
        console.log('Wallet connected with pubkey:', pubKey);
        setIsConnected(true);
        
        // Wait a moment for the wallet to update its internal state
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Fetch addresses
        try {
          await fetchAddresses();
          
          // Wait a moment for the wallet to update its internal state
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Load social profile
          try {
            await loadSocialProfile();
            
            // Try once more after a delay to get avatar if it's not available immediately
            setTimeout(async () => {
              if (loadSocialProfileRef.current) {
                try {
                  await loadSocialProfileRef.current();
                } catch (err) {
                  console.error('Error in delayed profile loading:', err);
                }
              }
            }, 2000);
          } catch (error) {
            console.error('Error loading profile after connect:', error);
            // Don't reset state here, we might still have addresses
          }
        } catch (error) {
          console.error('Error fetching addresses after connect:', error);
          if (isUnauthorizedError(error)) {
            resetWalletState();
            return;
          }
        }
      }
    } catch (error) {
      console.error('Error connecting wallet:', error);
      resetWalletState();
      
      // If it's not an unauthorized error, rethrow it
      if (!isUnauthorizedError(error)) {
        throw error;
      }
    }
  }, [wallet, fetchAddresses, loadSocialProfile, resetWalletState, isUnauthorizedError]);

  // Simplified disconnect that doesn't rely on wallet.disconnect
  const disconnectWallet = useCallback(() => {
    try {
      // Try to disconnect via the wallet API, but don't await it
      if (wallet.disconnect) {
        wallet.disconnect().catch(error => {
          console.error('Non-critical error during wallet.disconnect:', error);
        });
      }
    } catch (error) {
      console.error('Error during disconnect attempt:', error);
    } finally {
      // Always reset the wallet state
      resetWalletState();
    }
  }, [wallet, resetWalletState]);

  const sendBsvTransaction = useCallback(async (outputs: SendBsv[]): Promise<SendBsv20Response> => {
    // First verify the wallet is actually connected via the provider
    if (!wallet.isReady) {
      throw new Error('Wallet extension not installed or not ready');
    }
    
    // Check our tracked state
    if (!isConnected) {
      console.warn('Internal state shows wallet as not connected, attempting transaction anyway');
    }
    
    // Make sure the sendBsv method exists
    if (!wallet.sendBsv) {
      throw new Error('Wallet does not support sendBsv method');
    }
    
    setIsProcessing(true);
    
    try {
      console.log('Sending BSV transaction with outputs:', outputs);
      
      // Verify we have valid outputs
      if (!outputs || outputs.length === 0 || !outputs[0].address) {
        throw new Error('Invalid transaction outputs: missing address');
      }
      
      // Directly use wallet provider to send transaction
      const txid = await wallet.sendBsv(outputs);
      if (!txid) {
        throw new Error('Transaction failed without an error');
      }
      console.log('Transaction successful, txid:', txid);
      return txid;
    } catch (error) {
      console.error('Error sending BSV transaction:', error);
      
      // Reset wallet state if unauthorized
      if (isUnauthorizedError(error)) {
        resetWalletState();
      }
      
      throw error;
    } finally {
      setIsProcessing(false);
    }
  }, [isConnected, isUnauthorizedError, resetWalletState, wallet]);

  const contextValue: WalletContextType = {
    isConnected,
    addresses,
    socialProfile,
    connectWallet,
    disconnectWallet,
    sendBsvTransaction,
    isProcessing,
    loadSocialProfile,
    fetchAddresses,
    hasValidAddresses
  };

  return (
    <WalletContext.Provider value={contextValue}>
      {children}
    </WalletContext.Provider>
  );
}; 