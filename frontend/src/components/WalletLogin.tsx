import type { FC } from 'react';

interface WalletLoginProps {
  onLogin: () => void;
}

const WalletLogin: FC<WalletLoginProps> = ({ onLogin }) => {
  return (
    <div className="p-6 rounded-lg bg-base-200 mb-8 max-w-2xl mx-auto">
      <button
        type="button"
        className="btn btn-neutral w-full py-8 text-xl h-auto"
        onClick={onLogin}
      >
        Log in with your wallet
      </button>
    </div>
  );
};

export default WalletLogin; 