import { useEffect, useRef } from 'react';
import type { FC } from 'react';

// Page types for navigation
export type PageType = 'home' | 'market' | 'domains' | 'settings';

interface NavbarProps {
  isConnected: boolean;
  walletAddress?: string;
  onConnectWallet: () => void;
  onDisconnectWallet?: () => void;
  avatar?: string;
  refreshProfile?: () => Promise<void>;
  onNavigate?: (page: PageType) => void;
  currentPage?: PageType;
  hasValidAddresses?: boolean;
}

const Navbar: FC<NavbarProps> = ({ 
  isConnected, 
  walletAddress, 
  onConnectWallet,
  onDisconnectWallet,
  avatar,
  refreshProfile,
  onNavigate,
  currentPage = 'home',
  hasValidAddresses = false
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const refreshAttemptedRef = useRef(false);
  
  // Refresh profile when connected but no avatar, only try once
  useEffect(() => {
    // Only attempt to refresh if:
    // 1. We're connected
    // 2. We have valid addresses
    // 3. No avatar is available
    // 4. We have a refresh function
    // 5. We haven't already attempted a refresh (to prevent infinite loops)
    if (isConnected && hasValidAddresses && !avatar && refreshProfile && !refreshAttemptedRef.current) {
      refreshAttemptedRef.current = true;
      
      // Try to refresh profile after a short delay
      const timer = setTimeout(() => {
        refreshProfile().catch(err => {
          console.error('Error refreshing profile:', err);
          // Error handling is now in the WalletContext
        });
      }, 2000);
      
      return () => clearTimeout(timer);
    }
    
    // Reset the refresh attempt flag if we disconnect
    if (!isConnected) {
      refreshAttemptedRef.current = false;
    }
  }, [isConnected, hasValidAddresses, avatar, refreshProfile]);

  const handleNavigate = (page: PageType) => {
    if (onNavigate) {
      onNavigate(page);
      // Close dropdown if it's open
      if (dropdownRef.current?.classList.contains('dropdown-open')) {
        dropdownRef.current.classList.remove('dropdown-open');
      }
      // Close mobile menu if it's open
      if (mobileMenuRef.current) {
        mobileMenuRef.current.setAttribute('aria-expanded', 'false');
      }
    }
  };

  const toggleMobileMenu = () => {
    if (mobileMenuRef.current) {
      const isExpanded = mobileMenuRef.current.getAttribute('aria-expanded') === 'true';
      mobileMenuRef.current.setAttribute('aria-expanded', isExpanded ? 'false' : 'true');
    }
  };
  
  // Determine if we should show the wallet UI
  const showWallet = isConnected && hasValidAddresses;
  
  return (
    <div className="navbar bg-base-100 shadow-sm">
      <div className="navbar-start">
        <div className="dropdown">
          <button 
            type="button" 
            className="btn btn-ghost lg:hidden"
            onClick={toggleMobileMenu}
            aria-label="Toggle menu"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-5 w-5" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
              aria-hidden="true"
              role="presentation"
            >
              <title>Menu</title>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h8m-8 6h16" />
            </svg>
          </button>
          <div 
            ref={mobileMenuRef}
            className="dropdown-content menu menu-sm bg-base-100 rounded-box z-[1] mt-3 w-52 p-2 shadow"
            aria-expanded="false"
          >
            <button 
              type="button" 
              className={`btn btn-ghost w-full justify-start ${currentPage === 'home' ? 'btn-active' : ''}`}
              onClick={() => handleNavigate('home')}
            >
              Home
            </button>
            <button 
              type="button" 
              className={`btn btn-ghost w-full justify-start ${currentPage === 'market' ? 'btn-active' : ''}`}
              onClick={() => handleNavigate('market')}
            >
              Market
            </button>
            <button 
              type="button" 
              className={`btn btn-ghost w-full justify-start ${currentPage === 'domains' ? 'btn-active' : ''}`}
              onClick={() => handleNavigate('domains')}
            >
              Domains
            </button>
            <button 
              type="button" 
              className={`btn btn-ghost w-full justify-start ${currentPage === 'settings' ? 'btn-active' : ''}`}
              onClick={() => handleNavigate('settings')}
            >
              Settings
            </button>
          </div>
        </div>
        <button 
          type="button" 
          onClick={() => handleNavigate('home')}
          className="btn btn-ghost text-xl"
        >
          <span className="merriweather-bold text-2xl text-primary">1SAT.NAME</span>
        </button>
      </div>
      
      <div className="navbar-center hidden lg:flex">
        <ul className="menu menu-horizontal px-1">
          <li>
            <button 
              type="button" 
              className={currentPage === 'home' ? 'active' : ''}
              onClick={() => handleNavigate('home')}
            >
              Home
            </button>
          </li>
          <li>
            <button 
              type="button" 
              className={currentPage === 'market' ? 'active' : ''}
              onClick={() => handleNavigate('market')}
            >
              Market
            </button>
          </li>
          <li>
            <button 
              type="button" 
              className={currentPage === 'settings' ? 'active' : ''}
              onClick={() => handleNavigate('settings')}
            >
              Settings
            </button>
          </li>
        </ul>
      </div>
      
      <div className="navbar-end">
        {showWallet ? (
          <div className="dropdown dropdown-end" ref={dropdownRef}>
            <button 
              type="button" 
              onClick={() => dropdownRef.current?.classList.toggle('dropdown-open')}
              className="btn btn-ghost btn-circle avatar"
            >
              {avatar ? (
                <div className="w-10 rounded-full">
                  <img src={avatar} alt="User avatar" />
                </div>
              ) : (
                <div className="avatar placeholder">
                  <div className="bg-neutral text-neutral-content rounded-full w-10">
                    <span className="text-xs">
                      {walletAddress ? walletAddress.substring(0, 2) : '??'}
                    </span>
                  </div>
                </div>
              )}
            </button>
            <ul className="dropdown-content z-[1] menu menu-sm bg-base-200 border-1 border-base-300 rounded-box shadow mt-3 p-2 w-52">
              <li className="menu-title px-4 py-2">
                <span className="font-mono text-xs overflow-hidden text-ellipsis text-base-content/70 select-all cursor-pointer" title={walletAddress}>
                  {walletAddress && walletAddress.length > 10
                    ? `${walletAddress.substring(0, 8)}...${walletAddress.substring(walletAddress.length - 8)}`
                    : walletAddress
                  }
                </span>
              </li>
              <div className="divider" />
              <li>
                <button 
                  type="button"
                  onClick={() => handleNavigate('settings')}
                >
                  Settings
                </button>
              </li>
              <li>
                <button 
                  type="button" 
                  onClick={onDisconnectWallet}
                  className="text-error"
                >
                  Disconnect Wallet
                </button>
              </li>
            </ul>
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