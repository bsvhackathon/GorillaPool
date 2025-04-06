import { useState, useEffect, useCallback, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import { useWallet } from '../context/WalletContext';
import { marketApiUrl, marketAddress, marketFeeRate } from '../constants';

// Define interfaces for GorillaPool API response structure
interface GorillaPoolListingItem {
  outpoint: string;
  owner: string;
  origin: {
    data?: {
      opns?: {
        domain?: string;
      };
    };
  };
  data: {
    list?: {
      price: number;
      payout?: string;
    };
  };
}

interface MarketListing {
  name: string;
  priceBsv: number;
  priceUsd: number | null;
  outpoint: string;
  seller: string;
  origin?: {
    data?: {
      opns?: {
        domain?: string;
      };
    };
  };
}

interface FetchMarketsResponse {
  items: MarketListing[];
  nextCursor: number | null;
}

type SortOption = 'price-asc' | 'price-desc' | 'recent';

const ITEMS_PER_PAGE = 10;

const MarketPage = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('price-asc');
  const [error, setError] = useState<string | null>(null);
  const [purchaseSuccess, setPurchaseSuccess] = useState<string | null>(null);
  const [purchaseTxid, setPurchaseTxid] = useState<string | null>(null);
  const [exchangeRate, setExchangeRate] = useState<number | null>(() => {
    // Try to get cached exchange rate from localStorage
    const cachedRate = localStorage.getItem('bsvExchangeRate');
    if (cachedRate) {
      try {
        const rateData = JSON.parse(cachedRate);
        // Only use cached rate if it's less than 1 hour old
        if (rateData.timestamp && Date.now() - rateData.timestamp < 60 * 60 * 1000) {
          console.log('Using cached exchange rate:', rateData.rate);
          return rateData.rate;
        }
      } catch (e) {
        console.warn('Error parsing cached exchange rate:', e);
      }
    }
    return null;
  });
  
  const { ref, inView } = useInView({
    threshold: 0.5,       // Require at least half the element to be visible
    rootMargin: '400px',  // Start loading earlier (400px before visible)
    delay: 500,           // Much longer delay for visibility events
    triggerOnce: false    // Allow multiple triggers after resetting
  });
  
  const { isConnected, connectWallet, isProcessing, purchaseOrdinal } = useWallet();
  
  // Track if we're currently loading more items
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Fetch BSV to USD exchange rate from WhatsOnChain API
  const fetchExchangeRate = useCallback(async () => {
    try {
      console.log('Fetching exchange rate from WhatsOnChain...');
      
      const response = await fetch('https://api.whatsonchain.com/v1/bsv/main/exchangerate');
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      const rate = Number.parseFloat(data.rate);
      
      if (typeof rate === 'number' && !Number.isNaN(rate) && rate > 0) {
        setExchangeRate(rate);
        
        // Cache the rate in localStorage with timestamp
        localStorage.setItem('bsvExchangeRate', JSON.stringify({
          rate,
          timestamp: Date.now()
        }));
        
        console.log('Current BSV/USD exchange rate:', rate);
      } else {
        console.warn('Invalid exchange rate received:', rate);
      }
    } catch (err) {
      console.error('Error fetching exchange rate:', err);
    }
  }, []);

  // Fetch exchange rate on component mount
  useEffect(() => {
    fetchExchangeRate();
  }, [fetchExchangeRate]);
  
  // Refresh exchange rate when wallet connects
  useEffect(() => {
    if (isConnected) {
      fetchExchangeRate();
    }
  }, [isConnected, fetchExchangeRate]);
  
  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);
    
    return () => {
      clearTimeout(handler);
    };
  }, [searchQuery]);
  
  // Using TanStack Query's useInfiniteQuery for fetching data with pagination
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    status,
    refetch,
    isFetching,
  } = useInfiniteQuery({
    queryKey: ['marketListings', debouncedSearch, sortOption],
    queryFn: async ({ pageParam = 0 }) => {
      // Convert our sort options to the API's sort and dir parameters
      let sort = 'price';
      let dir = 'asc';
      
      switch (sortOption) {
        case 'price-asc':
          sort = 'price';
          dir = 'asc';
          break;
        case 'price-desc':
          sort = 'price';
          dir = 'desc';
          break;
        case 'recent':
          sort = 'recent';
          dir = 'desc';
          break;
      }
      
      // Build URL with query parameters
      const params = new URLSearchParams({
        limit: ITEMS_PER_PAGE.toString(),
        offset: pageParam.toString(),
        type: 'application/op-ns',
        sort,
        dir
      });
      
      if (debouncedSearch) {
        params.append('text', debouncedSearch);
      }
      
      const url = `${marketApiUrl}/market?${params.toString()}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      
      const marketData = await response.json() as GorillaPoolListingItem[];
      
      // Transform the data to match our MarketListing interface
      const transformedListings: MarketListing[] = marketData
        .filter((item: GorillaPoolListingItem) => {
          // Only include items that have list data with price
          return item.data?.list?.price && item.origin?.data?.opns?.domain;
        })
        .map((item: GorillaPoolListingItem) => {
          // Extract the domain name from the origin data
          const domain = item.origin?.data?.opns?.domain || 'unknown';
          
          // Get the price (already checked in filter that list.price exists)
          const priceSats = item.data.list?.price || 0;
          
          // Convert satoshis to BSV (1 BSV = 100,000,000 satoshis)
          const priceBsv = priceSats / 100000000;
          
          // Calculate USD price if exchange rate is available, otherwise null
          const priceUsd = exchangeRate !== null ? priceBsv * exchangeRate : null;
          
          // Format the data according to our MarketListing interface
          return {
            name: `${domain}@1sat.name`,
            priceBsv,
            priceUsd,
            outpoint: item.outpoint,
            seller: item.owner || 'unknown',
            origin: item.origin
          };
        });
      
      // Return the formatted response with next cursor
      return {
        items: transformedListings,
        nextCursor: marketData.length === ITEMS_PER_PAGE ? pageParam + ITEMS_PER_PAGE : null
      } as FetchMarketsResponse;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 1000 * 60 * 10, // Keep data fresh for 10 minutes
    refetchOnWindowFocus: false,
    gcTime: 1000 * 60 * 30, // Keep inactive queries in cache for 30 minutes
    refetchOnMount: false,
  });
  
  // Load next page when scrolling to the bottom, with better debouncing
  useEffect(() => {
    // Skip if already loading, no more pages, or already fetching
    if (isLoadingMore || !hasNextPage || isFetchingNextPage) {
      return;
    }
    
    // Only trigger when scrolled into view
    if (inView) {
      console.log('Loading next page...');
      setIsLoadingMore(true);
      
      // Add a longer delay to prevent multiple rapid triggers
      const timer = setTimeout(() => {
        fetchNextPage().finally(() => {
          // Wait a bit after loading completes before allowing another load
          setTimeout(() => {
            setIsLoadingMore(false);
          }, 500);
        });
      }, 300);
      
      return () => clearTimeout(timer);
    }
  }, [inView, fetchNextPage, hasNextPage, isFetchingNextPage, isLoadingMore]);
  
  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };
  
  // Handle sort option change
  const handleSortChange = (option: SortOption) => {
    setSortOption(option);
  };
  
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
    
    // If we still don't have an exchange rate, try fetching it
    if (exchangeRate === null) {
      await fetchExchangeRate();
    }
    
    setError(null);
    
    try {
      // Calculate the total price with fee for display purposes
      const totalPriceBsv = listing.priceBsv;
      const feeAmount = totalPriceBsv * marketFeeRate;
      const totalWithFee = totalPriceBsv + feeAmount;
      
      // Format prices for display
      const formattedPrice = totalPriceBsv.toFixed(8);
      const formattedFee = feeAmount.toFixed(8);
      const formattedTotal = totalWithFee.toFixed(8);
      
      console.log(`Buying ${listing.name} for ${formattedPrice} BSV + ${formattedFee} fee (${formattedTotal} total)`);
      
      // Purchase the ordinal with marketplace fee
      const txid = await purchaseOrdinal({
        outpoint: listing.outpoint,
        marketplaceRate: marketFeeRate,
        marketplaceAddress: marketAddress
      });
      
      if (txid) {
        setPurchaseSuccess(listing.name);
        setPurchaseTxid(txid);
        console.log(`Successfully purchased ${listing.name} with txid: ${txid}`);
      } else {
        throw new Error('No transaction ID returned');
      }
    } catch (err) {
      console.error('Error purchasing name:', err);
      setError(`Failed to purchase name: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };
  
  // Format price display
  const formatPrice = (listing: MarketListing) => {
    // If we don't have the exchange rate yet or price is null, show skeleton loaders
    if (exchangeRate === null || listing.priceUsd === null) {
      return (
        <div className="mt-2 mb-3">
          <div className="skeleton h-6 w-24 mb-1" />
          <div className="skeleton h-4 w-32" />
        </div>
      );
    }
    
    // Calculate fee amounts
    const feeAmountBsv = listing.priceBsv * marketFeeRate;
    const totalPriceBsv = listing.priceBsv + feeAmountBsv;
    
    // Calculate USD equivalents if exchange rate is available
    const feeAmountUsd = listing.priceUsd * marketFeeRate;
    const totalPriceUsd = listing.priceUsd + feeAmountUsd;
    
    return (
      <div className="mt-2 mb-3">
        <p className="text-xl font-bold text-primary">${totalPriceUsd.toFixed(2)}</p>
        <p className="text-sm text-base-content/60 font-mono">{totalPriceBsv.toFixed(8)} BSV</p>
        <div className="text-xs text-base-content/40 mt-1">
          <div className="flex justify-between">
            <span>Base price:</span>
            <span>{listing.priceBsv.toFixed(8)} BSV</span>
          </div>
          <div className="flex justify-between">
            <span>Marketplace fee ({(marketFeeRate * 100).toFixed(0)}%):</span>
            <span>{feeAmountBsv.toFixed(8)} BSV</span>
          </div>
        </div>
      </div>
    );
  };
  
  // Get all listings from all pages
  const allListings = useMemo(() => {
    return data?.pages?.flatMap(page => page.items) || [];
  }, [data?.pages]);
  
  // Add animation styles
  useEffect(() => {
    // Add a keyframe animation for fade-in effect
    const fadeInAnimation = `
    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .animate-fade-in {
      animation: fadeIn 0.5s ease-in-out;
    }
    `;
    
    // Add the animation styles to the document head
    const styleElement = document.createElement('style');
    styleElement.textContent = fadeInAnimation;
    document.head.appendChild(styleElement);
    
    // Cleanup function
    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);
  
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold merriweather-bold">
          <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Name Marketplace
          </span>
        </h1>
        <div className="flex gap-2">
          {!isConnected && (
            <button 
              className="btn btn-outline btn-sm"
              onClick={connectWallet}
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
                  d="M13 10V3L4 14h7v7l9-11h-7z" 
                />
              </svg>
              Connect Wallet
            </button>
          )}
          {isConnected && exchangeRate === null && (
            <button 
              className="btn btn-outline btn-sm"
              onClick={fetchExchangeRate}
              type="button"
            >
              <span className="loading loading-spinner loading-xs mr-1" />
              Loading Exchange Rate...
            </button>
          )}
          <button 
            className="btn btn-outline btn-sm"
            onClick={() => refetch()}
            disabled={isFetching}
            type="button"
          >
            {isFetching && !isFetchingNextPage ? (
              <>
                <span className="loading loading-spinner loading-xs mr-1" />
                Refreshing...
              </>
            ) : (
              <>
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
              </>
            )}
          </button>
        </div>
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
          <div className="flex flex-col">
            <span>Congratulations! <strong>{purchaseSuccess}</strong> is now yours!</span>
            {purchaseTxid && (
              <span className="text-sm mt-1">
                View transaction: <a 
                  href={`https://1sat.market/outpoint/${purchaseTxid}_0`} 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link link-hover font-mono"
                >
                  {purchaseTxid.substring(0, 12)}...{purchaseTxid.substring(purchaseTxid.length - 8)}
                </a>
              </span>
            )}
          </div>
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
      
      {/* Search and Sort Controls */}
      <div className="flex flex-col md:flex-row justify-between gap-4 mb-6">
        <div className="form-control w-full md:w-1/2">
          <label className="input input-bordered flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search for a name..."
              className="grow"
              value={searchQuery}
              onChange={handleSearchChange}
            />
            {searchQuery && (
              <button 
                className="btn btn-ghost btn-xs btn-circle"
                onClick={() => setSearchQuery('')}
                type="button"
                aria-label="Clear search"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </label>
        </div>
        
        <div className="join">
          <select 
            className="select select-bordered join-item" 
            value={sortOption}
            onChange={(e) => handleSortChange(e.target.value as SortOption)}
          >
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="name-asc">Number: Low to High</option>
            <option value="name-desc">Number: High to Low</option>
            <option value="recent">Recent</option>
          </select>
          {data?.pages && data.pages.length > 0 && (
            <span className="bg-base-200 text-xs px-4 flex items-center join-item">
              {hasNextPage ? 'Showing' : ''} <strong className="px-1">{allListings.length}</strong> 
              {hasNextPage ? '...' : 'listings'}
            </span>
          )}
        </div>
      </div>
      
      {status === 'pending' ? (
        <div className="flex justify-center py-12">
          <span className="loading loading-spinner loading-lg" />
        </div>
      ) : status === 'error' ? (
        <div className="card bg-base-200 shadow-xl p-8 text-center">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-24 w-24 mx-auto mb-4 text-base-content/30"
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
            aria-hidden="true"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth="1.5" 
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" 
            />
          </svg>
          <p className="text-xl text-base-content">
            Error loading marketplace listings
          </p>
          <p className="text-base-content/60 mt-2">
            Please try again later or contact support if the problem persists.
          </p>
          <button 
            className="btn btn-outline mt-4 mx-auto"
            onClick={() => refetch()}
            type="button"
          >
            Try Again
          </button>
        </div>
      ) : allListings.length === 0 ? (
        <div className="card bg-base-200 shadow-xl p-8 text-center">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-24 w-24 mx-auto mb-4 text-base-content/30"
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
            aria-hidden="true"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth="1.5" 
              d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 11-8 0" 
            />
          </svg>
          <p className="text-xl text-base-content">
            {searchQuery ? 'No listings match your search.' : 'No listings available at the moment.'}
          </p>
          <p className="text-base-content/60 mt-2">
            {searchQuery ? 'Try using different keywords or check back later.' : 'Check back soon for new name listings.'}
          </p>
          {searchQuery && (
            <button 
              className="btn btn-outline mt-4 mx-auto"
              onClick={() => setSearchQuery('')}
              type="button"
            >
              Clear Search
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Listings Grid */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {allListings.map((listing, index) => (
              <div 
                key={listing.outpoint} 
                className="card bg-base-200 shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 animate-fade-in"
                style={{
                  animationDelay: `${index * 0.05}s`
                }}
              >
                <div className="card-body">
                  <h2 className="card-title text-xl font-mono">
                    {listing.name.split('@')[0]}
                    <span className="opacity-25">@1sat.name</span>
                  </h2>
                  {formatPrice(listing)}
                  <p className="text-sm text-base-content/70 truncate">
                    Seller: {listing.seller}
                  </p>
                  <p className="text-xs font-mono text-base-content/60 truncate">
                    Outpoint: {listing.outpoint}
                  </p>
                  <div className="card-actions justify-end mt-4">
                    <button 
                      className="btn btn-primary btn-md w-full"
                      onClick={() => handleBuy(listing)}
                      disabled={isProcessing || exchangeRate === null || listing.priceUsd === null}
                      type="button"
                    >
                      {isProcessing ? (
                        <span className="loading loading-spinner loading-sm" />
                      ) : exchangeRate === null ? (
                        <>
                          <span className="loading loading-spinner loading-sm mr-1" />
                          Loading Price...
                        </>
                      ) : (
                        <>
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
                              d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" 
                            />
                          </svg>
                          Buy Now
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {/* Load more section */}
          {hasNextPage && (
            <div 
              ref={ref}
              className="flex justify-center py-8"
            >
              {isFetchingNextPage || isLoadingMore ? (
                <div className="flex flex-col items-center">
                  <span className="loading loading-spinner loading-md mb-2" />
                  <p className="text-sm text-base-content/60">Loading more listings...</p>
                </div>
              ) : (
                <button 
                  className="btn btn-outline btn-wide" 
                  onClick={() => {
                    if (!isLoadingMore) {
                      setIsLoadingMore(true);
                      fetchNextPage().finally(() => {
                        setTimeout(() => {
                          setIsLoadingMore(false);
                        }, 500);
                      });
                    }
                  }}
                  disabled={isLoadingMore}
                  type="button"
                >
                  Load More Names
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MarketPage; 