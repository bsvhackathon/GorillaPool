import type { FC } from 'react';

interface NavbarProps {
  isConnected: boolean;
  walletAddress?: string;
  onConnectWallet: () => void;
}

const Navbar: FC<NavbarProps> = ({ 
  isConnected, 
  walletAddress, 
  onConnectWallet 
}) => {
  return (
    <div className="navbar bg-base-100 shadow-sm">
      <div className="navbar-start">
        <div className="dropdown">
          <button type="button" className="btn btn-ghost lg:hidden">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-label="Menu">
              <title>Menu</title>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h8m-8 6h16" />
            </svg>
          </button>
          <ul className="menu menu-sm dropdown-content bg-base-100 rounded-box z-[1] mt-3 w-52 p-2 shadow">
            <li><a href="/">Home</a></li>
            <li><a href="/about">About</a></li>
          </ul>
        </div>
        <a href="/" className="btn btn-ghost text-xl text-yellow-400">1sat.names</a>
      </div>
      
      <div className="navbar-center hidden lg:flex">
        <ul className="menu menu-horizontal px-1">
          <li><a href="/">Home</a></li>
          <li><a href="/about">About</a></li>
        </ul>
      </div>
      
      <div className="navbar-end">
        {isConnected ? (
          <div className="flex items-center gap-2">
            <div className="text-sm opacity-80 hidden md:block">
              {walletAddress && walletAddress.length > 10
                ? `${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)}`
                : walletAddress
              }
            </div>
            <div className="avatar placeholder">
              <div className="bg-neutral-focus text-neutral-content rounded-full w-8">
                <span className="text-xs">
                  {walletAddress ? walletAddress.substring(0, 2) : ''}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <button type="button" onClick={onConnectWallet} className="btn btn-primary">
            Connect Wallet
          </button>
        )}
      </div>
    </div>
  );
};

export default Navbar; 