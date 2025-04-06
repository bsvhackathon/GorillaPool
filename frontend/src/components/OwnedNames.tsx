import { useState, useEffect, useCallback, type FC } from 'react';
import { useWallet } from '../context/WalletContext';

interface OwnedNamesProps {
  onSell: (outpoint: string, name: string) => Promise<void>;
}

interface NameOrdinal {
  name: string;
  outpoint: string;
}

interface OrdinalData {
  name?: string;
  handle?: string;
  [key: string]: unknown;
}

const OwnedNames: FC<OwnedNamesProps> = ({ onSell }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [ownedNames, setOwnedNames] = useState<NameOrdinal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  
  const { isConnected, getOrdinals } = useWallet();
  
  // Function to load more names (for pagination)
  const loadMoreNames = useCallback(async () => {
    if (!isConnected || !from) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Get ordinals with pagination
      const response = await getOrdinals({ from, limit: 20 });
      
      // Extract names from ordinals (filtering for 1sat.name ordinals)
      const nameOrdinals = response.ordinals.filter(ordinal => {
        // Filter for 1sat.name ordinals based on content or metadata
        return (
          // Check if this is a 1sat.name ordinal by examining content or metadata
          ordinal.typeInfo?.content?.includes('@1sat.name') ||
          typeof ordinal.data === 'string' && ordinal.data.includes('@1sat.name') ||
          (ordinal.data && typeof ordinal.data === 'object' && 
            ((ordinal.data as OrdinalData).name?.includes('@1sat.name') || 
             (ordinal.data as OrdinalData).handle?.includes('@1sat.name')))
        );
      }).map(ordinal => {
        // Extract the name from the ordinal
        let name = '';
        if (ordinal.typeInfo?.content?.includes('@1sat.name')) {
          name = ordinal.typeInfo.content;
        } else if (typeof ordinal.data === 'string' && ordinal.data.includes('@1sat.name')) {
          name = ordinal.data;
        } else if (ordinal.data && typeof ordinal.data === 'object') {
          const data = ordinal.data as OrdinalData;
          if (data.name?.includes('@1sat.name')) {
            name = data.name;
          } else if (data.handle?.includes('@1sat.name')) {
            name = `${data.handle}@1sat.name`;
          }
        }
        
        return {
          name: name || `Unknown Name (${ordinal.id.slice(0, 8)}...)`,
          outpoint: ordinal.outpoint
        };
      });
      
      // Add to the existing list of owned names
      setOwnedNames(prev => [...prev, ...nameOrdinals]);
      
      // Update pagination state
      setFrom(response.from);
      setHasMore(!!response.from);
    } catch (err) {
      console.error('Error loading more ordinals:', err);
      setError(`Failed to load more names: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, getOrdinals, from]);
  
  // Load names when connected
  useEffect(() => {
    const fetchNames = async () => {
      if (!isConnected) {
        setOwnedNames([]);
        setFrom(undefined);
        setHasMore(false);
        return;
      }
      
      // Same as loadNames(true)
      setIsLoading(true);
      setError(null);
      
      try {
        // Get ordinals with pagination
        const response = await getOrdinals({ limit: 20 });
        
        // Extract names from ordinals (filtering for 1sat.name ordinals)
        const nameOrdinals = response.ordinals.filter(ordinal => {
          // Filter for 1sat.name ordinals based on content or metadata
          return (
            // Check if this is a 1sat.name ordinal by examining content or metadata
            ordinal.typeInfo?.content?.includes('@1sat.name') ||
            typeof ordinal.data === 'string' && ordinal.data.includes('@1sat.name') ||
            (ordinal.data && typeof ordinal.data === 'object' && 
              ((ordinal.data as OrdinalData).name?.includes('@1sat.name') || 
              (ordinal.data as OrdinalData).handle?.includes('@1sat.name')))
          );
        }).map(ordinal => {
          // Extract the name from the ordinal
          let name = '';
          if (ordinal.typeInfo?.content?.includes('@1sat.name')) {
            name = ordinal.typeInfo.content;
          } else if (typeof ordinal.data === 'string' && ordinal.data.includes('@1sat.name')) {
            name = ordinal.data;
          } else if (ordinal.data && typeof ordinal.data === 'object') {
            const data = ordinal.data as OrdinalData;
            if (data.name?.includes('@1sat.name')) {
              name = data.name;
            } else if (data.handle?.includes('@1sat.name')) {
              name = `${data.handle}@1sat.name`;
            }
          }
          
          return {
            name: name || `Unknown Name (${ordinal.id.slice(0, 8)}...)`,
            outpoint: ordinal.outpoint
          };
        });
        
        // Update the list of owned names
        setOwnedNames(nameOrdinals);
        
        // Update pagination state
        setFrom(response.from);
        setHasMore(!!response.from);
      } catch (err) {
        console.error('Error loading ordinals:', err);
        setError(`Failed to load your names: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchNames();
  }, [isConnected, getOrdinals]);
  
  // Handle selling a name
  const handleSell = async (outpoint: string, name: string) => {
    try {
      await onSell(outpoint, name);
    } catch (err) {
      console.error('Error selling name:', err);
      setError(`Failed to sell name: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };
  
  if (!isConnected) {
    return (
      <div className="p-4 bg-base-200 rounded-lg text-center">
        <p className="text-base-content">Connect your wallet to view your 1sat.names</p>
      </div>
    );
  }
  
  return (
    <div className="card bg-base-200 shadow-xl mb-8">
      <div className="card-body">
        <h2 className="card-title">
          <span className="merriweather-bold text-2xl text-primary">Your 1sat Names</span>
        </h2>
        
        {isLoading && ownedNames.length === 0 ? (
          <div className="flex justify-center py-4">
            <span className="loading loading-spinner loading-lg" />
          </div>
        ) : ownedNames.length === 0 ? (
          <div className="p-4 bg-base-300 rounded-lg text-center">
            <p className="text-base-content">You don't own any 1sat.names yet</p>
          </div>
        ) : (
          <div className="space-y-4 mt-4">
            {ownedNames.map((item) => (
              <div key={item.outpoint} className="p-4 bg-base-300 rounded-lg">
                <div className="flex justify-between items-center">
                  <div className="font-mono text-base-content">
                    {item.name}
                    <div className="tooltip" data-tip={`Outpoint: ${item.outpoint}`}>
                      <span className="text-xs opacity-50 cursor-help ml-2">ⓘ</span>
                    </div>
                  </div>
                  <button 
                    className="btn btn-sm btn-outline btn-primary"
                    onClick={() => handleSell(item.outpoint, item.name)}
                    type="button"
                  >
                    Sell
                  </button>
                </div>
              </div>
            ))}
            
            {hasMore && (
              <div className="text-center mt-4">
                <button 
                  className="btn btn-outline"
                  onClick={loadMoreNames}
                  disabled={isLoading}
                  type="button"
                >
                  {isLoading ? (
                    <span className="loading loading-spinner loading-sm" />
                  ) : (
                    'Load More'
                  )}
                </button>
              </div>
            )}
          </div>
        )}
        
        {error && (
          <div className="alert alert-error mt-4">
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default OwnedNames; 