import { useState } from 'react';
import NameRegistration from '../components/NameRegistration';
import OwnedNames from '../components/OwnedNames';
import { useWallet } from '../context/WalletContext';
import About from '../components/About';

const HomePage = () => {
  const [lastRegistered, setLastRegistered] = useState<string | null>(null);
  const { isConnected } = useWallet();

  // Handle successful name registration or purchase
  const handleNameAcquired = async (name: string) => {
    console.log('Name acquired:', name);
    setLastRegistered(name);

    // Show a success message temporarily
    setTimeout(() => {
      setLastRegistered(null);
    }, 5000);
  };

  // Handle selling a name
  const handleSellName = async (outpoint: string, name: string) => {
    // This would typically open a modal or navigate to a page to set price
    console.log(`Listing ${name} for sale. Outpoint: ${outpoint}`);

    // For demo purposes, we'll just alert
    alert(`To sell "${name}", you would be redirected to the marketplace listing page.`);

    // In reality, you would:
    // 1. Navigate to a listing page or open a modal
    // 2. Let user set price and terms
    // 3. Call API to list the name for sale
    // 4. Update local state
  };

  return (
    <div>
      {lastRegistered && (
        <div className="alert alert-success mb-6 shadow-lg">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="stroke-current flex-shrink-0 h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>Congratulations! <strong>{lastRegistered}</strong> is now yours!</span>
        </div>
      )}

      <NameRegistration onBuy={handleNameAcquired} />

      {isConnected && (
        <OwnedNames onSell={handleSellName} />
      )}

      {!isConnected && (
        <About />
      )}
    </div>
  );
};

export default HomePage; 