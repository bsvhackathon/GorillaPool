import { useState, useEffect, useCallback, type FC } from 'react';
import { useWallet } from '../context/WalletContext';
import type { Ordinal } from 'yours-wallet-provider';

interface OwnedNamesProps {
  onSell: (outpoint: string, name: string) => Promise<void>;
}

interface NameOrdinal {
  name: string;
  outpoint: string;
}

const OwnedNames: FC<OwnedNamesProps> = ({ onSell }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [ownedNames, setOwnedNames] = useState<NameOrdinal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);

  const { isConnected, getOrdinals } = useWallet();

  // Function to extract the name from an ordinal
  const extractNameFromOrdinal = useCallback((ordinal: Ordinal): string => {
    // First try to get the name from insc.file.text which is the inscription text itself
    const inscriptionText = ordinal.origin?.data?.insc?.file?.text;
    
    // If we have valid inscription text, that's our name
    if (inscriptionText && typeof inscriptionText === 'string' && inscriptionText.trim() !== '') {
      return inscriptionText.trim();
    }
    
    // Last resort
    return `Unknown Name (${ordinal.outpoint.slice(0, 8)}...)`;
  }, []);

  // Function to check if an ordinal is a 1sat.name
  const is1SatName = useCallback((ordinal: Ordinal): boolean => {
    // Check if this is a name ordinal by verifying it has the application/op-ns content type
    const contentType = ordinal.origin?.data?.insc?.file?.type;
    return typeof contentType === 'string' && contentType.includes('application/op-ns');
  }, []);

  // Function to load more names (for pagination)
  const loadMoreNames = useCallback(async () => {
    if (!isConnected || !from) return;

    setIsLoading(true);
    setError(null);

    try {
      // Get ordinals with pagination
      const response = await getOrdinals({ from, limit: 20 });

      // Extract names from ordinals (filtering for 1sat.name ordinals)
      const nameOrdinals = response.ordinals
        .filter(is1SatName)
        .map((ordinal: Ordinal) => {
          // Extract the name from the ordinal
          const domainName = extractNameFromOrdinal(ordinal);
          const name = domainName ? `${domainName}@1sat.name` : '';

          return {
            name: name || `Unknown Name (${ordinal.outpoint.slice(0, 8)}...)`,
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
  }, [isConnected, getOrdinals, from, extractNameFromOrdinal, is1SatName]);

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

        console.log("all ordinals", response.ordinals);
        
        // Log the number of ordinals vs. 1sat.names for debugging
        const totalOrdinals = response.ordinals.length;
        const names = response.ordinals.filter(is1SatName);
        console.log(`Found ${names.length} 1sat.names out of ${totalOrdinals} total ordinals`);
        
        // Extract names from ordinals (filtering for 1sat.name ordinals)
        const nameOrdinals = names.map((ordinal: Ordinal) => {
          // Extract the name from the ordinal
          const domainName = extractNameFromOrdinal(ordinal);
          const name = domainName ? `${domainName}@1sat.name` : '';

          console.log({name, domainName, type: ordinal.origin?.data?.insc?.file?.type});

          return {
            name: name || `Unknown Name (${ordinal.outpoint.slice(0, 8)}...)`,
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
  }, [isConnected, getOrdinals, extractNameFromOrdinal, is1SatName]);

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
    <div className="card bg-base-200 shadow-xl mb-8 max-w-2xl mx-auto">
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
            <p className="text-base-content">You are nameless</p>
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