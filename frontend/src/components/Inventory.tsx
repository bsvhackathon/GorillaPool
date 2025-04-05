import type { FC } from 'react';

interface NameItem {
  id: string;
  name: string;
}

interface InventoryProps {
  names: NameItem[];
  onSell: (id: string) => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const Inventory: FC<InventoryProps> = ({
  names,
  onSell,
  currentPage,
  totalPages,
  onPageChange,
}) => {
  return (
    <div className="p-6 rounded-lg bg-base-200 mb-8 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Your Inventory</h2>
      
      <div className="divide-y divide-base-300">
        {names.length > 0 ? (
          names.map((item) => (
            <div key={item.id} className="py-4 flex justify-between items-center">
              <span className="text-xl">{item.name}</span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onSell(item.id)}
              >
                Sell
              </button>
            </div>
          ))
        ) : (
          <div className="py-4 text-center opacity-70">
            You don't own any names yet
          </div>
        )}
      </div>
      
      {totalPages > 1 && (
        <div className="flex justify-center mt-6">
          <div className="join">
            {currentPage > 1 && (
              <button
                type="button"
                className="join-item btn"
                onClick={() => onPageChange(currentPage - 1)}
              >
                «
              </button>
            )}
            
            <button type="button" className="join-item btn btn-active">{currentPage}</button>
            
            {currentPage < totalPages && (
              <button
                type="button"
                className="join-item btn"
                onClick={() => onPageChange(currentPage + 1)}
              >
                »
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory; 