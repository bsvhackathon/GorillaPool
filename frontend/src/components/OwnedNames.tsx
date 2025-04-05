import { useState, useMemo } from 'react';
import type { FC } from 'react';

// Name data interface
interface NameData {
  id: string;
  name: string;
  registrationDate: Date;
}

interface OwnedNamesProps {
  names: NameData[];
  onSell: (nameId: string) => void;
}

const OwnedNames: FC<OwnedNamesProps> = ({ names, onSell }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
  
  const totalPages = Math.ceil(names.length / itemsPerPage);
  
  const paginatedNames = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return names.slice(startIndex, startIndex + itemsPerPage);
  }, [names, currentPage]);
  
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };
  
  if (names.length === 0) {
    return (
      <div className="card bg-base-200 shadow-xl mt-8">
        <div className="card-body">
          <h2 className="card-title">
            <span className="text-2xl text-primary">Your Names</span>
          </h2>
          <p className="text-center py-6 text-base-content/50">
            You don't own any names yet. Register one above!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card bg-base-200 shadow-xl mt-8">
      <div className="card-body">
        <h2 className="card-title">
          <span className="text-2xl text-primary">Your Names</span>
        </h2>
        <div className="overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr>
                <th>Name</th>
                <th>Registered</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedNames.map((nameData) => (
                <tr key={nameData.id}>
                  <td>{nameData.name}</td>
                  <td>{nameData.registrationDate.toLocaleDateString()}</td>
                  <td>
                    <button
                      onClick={() => onSell(nameData.id)}
                      className="btn btn-sm btn-outline"
                      type="button"
                    >
                      Sell
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {totalPages > 1 && (
          <div className="flex justify-center mt-4">
            <div className="join">
              {Array.from({ length: totalPages }).map((_, index) => {
                const pageNumber = index + 1;
                return (
                  <button
                    key={`page-${pageNumber}`}
                    className={`join-item btn ${currentPage === pageNumber ? 'btn-active' : ''}`}
                    onClick={() => handlePageChange(pageNumber)}
                    type="button"
                  >
                    {pageNumber}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OwnedNames; 