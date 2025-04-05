import './App.css'
import Navbar, { type PageType } from './components/Navbar'
import { useWallet } from './context/WalletContext'
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom'
import HomePage from './pages/HomePage'
import MarketPage from './pages/MarketPage'
import SettingsPage from './pages/SettingsPage'

// Navigation wrapper to handle Navbar interactions
const NavWrapper = () => {
  const navigate = useNavigate();
  const { isConnected, addresses, disconnectWallet, connectWallet, socialProfile, loadSocialProfile, hasValidAddresses } = useWallet();

  // Determine display address
  const displayAddress = addresses.bsvAddress || addresses.ordAddress || '';

  // Handle navigation from Navbar
  const handleNavigation = (page: PageType) => {
    switch (page) {
      case 'home':
        navigate('/');
        break;
      case 'market':
        navigate('/market');
        break;
      case 'settings':
        navigate('/settings');
        break;
    }
  };

  // Get current page from URL
  const pathname = window.location.pathname;
  let currentPage: PageType = 'home';
  
  if (pathname.includes('market')) {
    currentPage = 'market';
  } else if (pathname.includes('settings')) {
    currentPage = 'settings';
  }

  return (
    <>
      <Navbar 
        isConnected={isConnected}
        walletAddress={displayAddress}
        onConnectWallet={connectWallet}
        onDisconnectWallet={disconnectWallet}
        avatar={socialProfile.avatar}
        refreshProfile={loadSocialProfile}
        onNavigate={handleNavigation}
        currentPage={currentPage}
        hasValidAddresses={hasValidAddresses}
      />
      
      <main className="container mx-auto py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/market" element={<MarketPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </div>
      </main>
      
      <footer className="container mx-auto py-8 px-4 text-center">
        <p>© 2025 <span className="merriweather-bold text-content-primary">1SAT.NAME</span> - Built on Bitcoin SV</p>
      </footer>
    </>
  );
};

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-base-100">
        <NavWrapper />
      </div>
    </Router>
  );
}

export default App
