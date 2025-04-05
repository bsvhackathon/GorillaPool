import { useState, useEffect } from 'react';
import NameRegistration from '../components/NameRegistration';
import OwnedNames from '../components/OwnedNames';
import { useWallet } from '../context/WalletContext';

// Mock interface for name data
interface NameData {
  id: string;
  name: string;
  registrationDate: Date;
}

const HomePage = () => {
  const { isConnected, addresses } = useWallet();
  const [ownedNames, setOwnedNames] = useState<NameData[]>([]);

  // Determine display address
  const displayAddress = addresses.bsvAddress || addresses.ordAddress || '';

  // Mock loading of owned names when wallet is connected
  useEffect(() => {
    if (isConnected && displayAddress) {
      // In a real implementation, this would fetch from your backend
      const mockNames = [
        {
          id: '1',
          name: 'example@1sat.name',
          registrationDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        },
      ];
      setOwnedNames(mockNames);
    } else {
      setOwnedNames([]);
    }
  }, [isConnected, displayAddress]);

  const handleBuy = async (name: string) => {
    console.log(`Purchased name: ${name}`);
    
    // Add new name to owned names
    const newName: NameData = {
      id: Date.now().toString(), // Use timestamp as a temporary ID
      name,
      registrationDate: new Date(),
    };
    
    setOwnedNames(prev => [...prev, newName]);
  };

  const handleSell = async (nameId: string) => {
    console.log(`Initiated sell for name ID: ${nameId}`);
    
    // Remove name from owned names
    setOwnedNames(prev => prev.filter(name => name.id !== nameId));
    
    // In a real implementation, this would create a transaction
    // to transfer the name to a marketplace or directly to a buyer
  };

  return (
    <>
      <NameRegistration onBuy={handleBuy} />
      <OwnedNames names={ownedNames} onSell={handleSell} />
    </>
  );
};

export default HomePage; 