import { useState, type FC } from 'react';

interface NameRegistrationProps {
  onBuy: (name: string) => void;
}

const NameRegistration: FC<NameRegistrationProps> = ({ onBuy }) => {
  const [nameInput, setNameInput] = useState('');
  const [isNameTaken, setIsNameTaken] = useState(false);
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNameInput(e.target.value);
    // In a real app, this would check availability from the backend
    setIsNameTaken(false);
  };

  const handleBuy = () => {
    if (nameInput && !isNameTaken) {
      onBuy(nameInput);
    }
  };

  return (
    <div className="p-6 rounded-lg bg-base-200 mb-8 max-w-2xl mx-auto">
      <h2 className="text-4xl font-bold text-yellow-400 mb-3">Choose your 1sat name</h2>
      <p className="text-xl mb-6">1sat names available for $1 each</p>
      
      <div className="flex w-full">
        <input 
          type="text" 
          placeholder="name@1sat.name" 
          className="input input-bordered flex-grow rounded-r-none"
          value={nameInput}
          onChange={handleInputChange}
        />
        <button 
          type="button"
          className="btn btn-primary rounded-l-none px-8"
          onClick={handleBuy}
          disabled={!nameInput || isNameTaken}
        >
          Buy
        </button>
      </div>
      
      {isNameTaken && (
        <p className="text-yellow-400 mt-2">This name is already taken</p>
      )}
    </div>
  );
};

export default NameRegistration; 