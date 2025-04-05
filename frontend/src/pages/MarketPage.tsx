import { useState, useEffect } from 'react';
import { useWallet } from '../context/WalletContext';

// Mock interface for market name data
interface MarketNameData {
  id: string;
  name: string;
  price: number;
  seller: string;
  listedDate: Date;
}

const MarketPage = () => {
  const { isConnected } = useWallet();
  const [marketNames, setMarketNames] = useState<MarketNameData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Mock loading of market listings
  useEffect(() => {
    // Simulate API call
    setTimeout(() => {
      const mockData: MarketNameData[] = [
        {
          id: '1',
          name: 'premium@1sat.name',
          price: 100000, // 100,000 sats
          seller: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
          listedDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        },
        {
          id: '2',
          name: 'bitcoin@1sat.name',
          price: 500000, // 500,000 sats
          seller: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
          listedDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        },
        {
          id: '3',
          name: 'satoshi@1sat.name',
          price: 1000000, // 1,000,000 sats
          seller: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
          listedDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        },
      ];
      setMarketNames(mockData);
      setIsLoading(false);
    }, 1000);
  }, []);

  const handleBuy = (nameId: string) => {
    if (!isConnected) {
      alert('Please connect your wallet first');
      return;
    }
    
    // In a real app, this would initiate a purchase transaction
    console.log(`Purchasing name with ID: ${nameId}`);
    // Remove from list after purchase
    setMarketNames(prev => prev.filter(name => name.id !== nameId));
  };

  const formatSats = (sats: number) => {
    return new Intl.NumberFormat().format(sats);
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto mt-8 flex justify-center">
        <div className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="card bg-base-200 shadow-xl mt-8">
        <div className="card-body">
          <h2 className="card-title">
            <span className="text-2xl text-primary">Name Marketplace</span>
          </h2>
          
          {marketNames.length === 0 ? (
            <p className="text-center py-6 text-base-content/50">
              No names are currently listed in the marketplace.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table w-full">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Price (sats)</th>
                    <th>Listed</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {marketNames.map((nameData) => (
                    <tr key={nameData.id}>
                      <td className="font-mono">{nameData.name}</td>
                      <td>{formatSats(nameData.price)}</td>
                      <td>{nameData.listedDate.toLocaleDateString()}</td>
                      <td>
                        <button
                          onClick={() => handleBuy(nameData.id)}
                          className="btn btn-sm btn-primary"
                          type="button"
                          disabled={!isConnected}
                        >
                          Buy
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          {!isConnected && (
            <div className="alert alert-warning mt-4">
              <p>Connect your wallet to purchase names from the marketplace.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MarketPage; 