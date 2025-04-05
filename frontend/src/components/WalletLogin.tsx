import { type FC, useState } from 'react';
import { useWallet } from '../context/WalletContext';

interface WalletLoginProps {
  onLogin: () => Promise<void>;
}

const WalletLogin: FC<WalletLoginProps> = ({ onLogin }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isProcessing } = useWallet();

  const handleLogin = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      await onLogin();
    } catch (err) {
      console.error('Login error:', err);
      setError('Failed to connect wallet. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 rounded-lg bg-base-200 mb-8 max-w-2xl mx-auto">
      <button
        type="button"
        className={`btn btn-neutral w-full py-8 text-xl h-auto ${isLoading || isProcessing ? 'loading' : ''}`}
        onClick={handleLogin}
        disabled={isLoading || isProcessing}
      >
        {isLoading || isProcessing ? 'Connecting...' : 'Log in with your wallet'}
      </button>
      
      {error && (
        <div className="mt-4 text-error text-center">
          {error}
        </div>
      )}
      
      <div className="mt-4 text-sm opacity-70 text-center">
        Connect with Yours or HandCash wallet to manage your 1sat names
      </div>
    </div>
  );
};

export default WalletLogin; 