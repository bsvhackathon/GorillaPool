import { useState } from 'react'
import './App.css'
import Navbar from './components/Navbar'
import NameRegistration from './components/NameRegistration'
import Inventory from './components/Inventory'
import WalletLogin from './components/WalletLogin'

function App() {
  const [isWalletConnected, setIsWalletConnected] = useState(false)
  const [walletAddress, setWalletAddress] = useState<string | undefined>(undefined)
  const [ownedNames, setOwnedNames] = useState<Array<{ id: string; name: string }>>([])
  const [currentPage, setCurrentPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(ownedNames.length / 5))

  // Mock data for demonstration
  const mockNames = [
    { id: '1', name: 'alice@1satnames.com' },
    { id: '2', name: 'bob@1satnames.com' },
    { id: '3', name: 'carol@1satnames.com' },
    { id: '4', name: 'dave@1satnames.com' },
    { id: '5', name: 'eve@1satnames.com' },
  ]

  const connectWallet = () => {
    // In a real app, this would use a wallet connection library
    setIsWalletConnected(true)
    setWalletAddress('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq')
    setOwnedNames(mockNames)
  }

  const handleBuy = (name: string) => {
    // In a real app, this would interact with a blockchain
    console.log(`Buying name: ${name}`)
    const newId = String(ownedNames.length + 1)
    setOwnedNames([...ownedNames, { id: newId, name }])
  }

  const handleSell = (id: string) => {
    // In a real app, this would interact with a blockchain
    console.log(`Selling name with id: ${id}`)
    setOwnedNames(ownedNames.filter(item => item.id !== id))
  }

  return (
    <div className="min-h-screen bg-base-100 text-base-content">
      <Navbar 
        isConnected={isWalletConnected}
        walletAddress={walletAddress}
        onConnectWallet={connectWallet}
      />
      
      <main className="container mx-auto px-4 py-8">
        <NameRegistration onBuy={handleBuy} />
        
        {isWalletConnected ? (
          <Inventory
            names={ownedNames}
            onSell={handleSell}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        ) : (
          <WalletLogin onLogin={connectWallet} />
        )}
      </main>
    </div>
  )
}

export default App
