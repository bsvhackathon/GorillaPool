import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '../context/WalletContext';

interface MarketListing {
  name: string;
  price: number;
  outpoint: string;
  seller: string;
}

const MarketPage = () => {
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [purchaseSuccess, setPurchaseSuccess] = useState<string | null>(null);
  
  const { isConnected, connectWallet, isProcessing, purchaseOrdinal } = useWallet();
  
  // Fetch market listings
  const fetchListings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // In a real implementation, fetch from the market API
      // const response = await fetch(`${marketApiUrl}/listings`);
      // const data = await response.json();
      
      // For demo, use mock data
      const mockListings: MarketListing[] = [
        {
          name: 'cool@1sat.name',
          price: 25,
          outpoint: '9b5c4e89fb2d813c69b6f9991b769ecdddaf8e78c9f69e40be1009e79ac10b30_0',
          seller: '17dyCLLqGoJNgzDKkVd8c9NkXhjzxius62'
        },
        {
          name: 'developer@1sat.name',
          price: 50,
          outpoint: '6e2f5a9b0d12c8a743ce9fe8d1e479bfa9b851d76e0f4e9a6bc2a5f31c6a2d83_0',
          seller: '17dyCLLqGoJNgzDKkVd8c9NkXhjzxius62'
        },
        {
          name: 'bitcoin@1sat.name',
          price: 100,
          outpoint: '3f2a8c1b5e97d0fa6b4e9c8d7f321a54eb09c7d6a52f1c8b4e7d3a6f90b12c5e_0',
          seller: '17dyCLLqGoJNgzDKkVd8c9NkXhjzxius62'
        }
      ];
      
      setListings(mockListings);
    } catch (err) {
      console.error('Error fetching market listings:', err);
      setError(`Failed to load market listings: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  useEffect(() => {
    fetchListings();
  }, [fetchListings]);
  
  // Buy a name from the marketplace
  const handleBuy = async (listing: MarketListing) => {
    if (!isConnected) {
      try {
        await connectWallet();
      } catch (err) {
        console.error('Error connecting wallet:', err);
        setError(`Failed to connect wallet: ${err instanceof Error ? err.message : 'Unknown error'}`);
        return;
      }
    }
    
    setError(null);
    
    try {
      // Use wallet's purchaseOrdinal method to buy the name
      const txid = await purchaseOrdinal({
        outpoint: listing.outpoint,
        // Optional: Set marketplace fee (e.g., 5% = 0.05)
        marketplaceRate: 0.05,
        // Optional: Set marketplace address to collect fee
        marketplaceAddress: '17dyCLLqGoJNgzDKkVd8c9NkXhjzxius62'
      });
      
      console.log(`Successfully purchased ${listing.name}, txid: ${txid}`);
      
      // Show success message
      setPurchaseSuccess(listing.name);
      
      // Remove purchased listing from the display
      setListings(prev => prev.filter(item => item.outpoint !== listing.outpoint));
      
      // Refresh the listings after a delay
      setTimeout(() => {
        fetchListings();
      }, 5000);
      
      // Clear success message after 5 seconds
      setTimeout(() => {
        setPurchaseSuccess(null);
      }, 5000);
    } catch (err) {
      console.error('Error purchasing name:', err);
      setError(`Failed to purchase ${listing.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };
  
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-primary">Name Marketplace</h1>
        <button 
          className="btn btn-outline btn-sm"
          onClick={fetchListings}
          disabled={isLoading}
          type="button"
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-5 w-5 mr-1" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
            aria-hidden="true"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth="2" 
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
            />
          </svg>
          Refresh
        </button>
      </div>
      
      {purchaseSuccess && (
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
          <span>Congratulations! <strong>{purchaseSuccess}</strong> is now yours!</span>
        </div>
      )}
      
      {error && (
        <div className="alert alert-error mb-6 shadow-lg">
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
              d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" 
            />
          </svg>
          <span>{error}</span>
        </div>
      )}
      
      {isLoading ? (
        <div className="flex justify-center py-12">
          <span className="loading loading-spinner loading-lg" />
        </div>
      ) : listings.length === 0 ? (
        <div className="card bg-base-200 shadow-xl p-6 text-center">
          <p className="text-xl text-base-content">No listings available at the moment.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <div key={listing.outpoint} className="card bg-base-200 shadow-xl">
              <div className="card-body">
                <h2 className="card-title text-xl font-mono">{listing.name}</h2>
                <p className="text-lg font-bold text-primary">${listing.price}</p>
                <p className="text-sm text-base-content/70 truncate">
                  Seller: {listing.seller}
                </p>
                <div className="card-actions justify-end mt-4">
                  <button 
                    className="btn btn-primary"
                    onClick={() => handleBuy(listing)}
                    disabled={isProcessing}
                    type="button"
                  >
                    {isProcessing ? (
                      <span className="loading loading-spinner loading-sm" />
                    ) : (
                      'Buy Now'
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MarketPage; 