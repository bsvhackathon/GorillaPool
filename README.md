# 1sat.name: 1Sat Ordinal bASed paymail handles

## What is 1sat.name?

1sat.name revolutionizes digital identity by combining Paymail with Bitcoin Ordinals, creating tradable and portable digital identities on the BSV blockchain. Our platform offers user-friendly payment handles that resemble email addresses for seamless transactions.

For an in-depth look at how it all works, check out our [detailed presentation](./1satname.pdf).

## Core Concepts

- **Ordinal Names**: Each 1sat.name is inscribed as a 1sat ordinal, making it a unique digital asset that can be traded, sold, or transferred.
- **Decentralized Trading**: Names can be bought and sold on any compatible marketplace that supports 1sat ordinals and ordlock contracts.
- **Cross-Domain Functionality**: Names follow the ordinal wherever it goes, maintaining their recognition across different platforms.
- **Wallet Compatibility**: Easily supported by any wallet that handles 1sat ordinals.

## Features

- **Affordable Names**: Each name costs just $1, making it accessible to everyone
- **Multiple Payment Options**: Pay with credit card (via Stripe) or directly with BSV
- **Interactive UI**: Modern interface with theme support
- **Inventory Management**: Easily view and manage your purchased names
- **Marketplace Integration**: Buy, sell, and trade names with other users
- **Real-Time Availability**: Instantly check if a name is available

## Tech Stack

### Frontend
- React with TypeScript
- Vite for fast builds
- DaisyUI components
- TanStack Query for data fetching
- Responsive design with Tailwind CSS

### Backend
- Go (Golang) server
- Fiber web framework
- Redis for caching and state management
- Overlay services for blockchain interaction
- BSV blockchain integration

### Wallet Integration
- Yours Wallet provider
- BSV payment processing
- Ordinal management

## Project Structure

```
1sat.name/
├── frontend/           # React TypeScript frontend
│   ├── src/
│   │   ├── components/ # UI components
│   │   ├── context/    # App context providers
│   │   ├── pages/      # Main application pages
│   │   ├── constants.ts # Configuration values
│   │   └── main.tsx    # Application entry point
│   ├── public/         # Static assets
│   └── package.json    # Frontend dependencies
│
├── backend/            # Go backend
│   ├── cmd/
│   │   └── server/     # Server implementation
│   ├── opns/           # Overlay name service
│   ├── paymail/        # Paymail implementation
│   └── storage/        # Data storage layer
│
└── README.md           # Project documentation
```

## Technical Implementation

### Name Registration

Names are registered as 1sat ordinals through a custom minting process:

1. Users search for an available name
2. Payment is made (Stripe or direct BSV)
3. The backend calls the minting API 
4. A new ordinal is created with the name as its inscription
5. The ordinal is sent to the user's wallet address

### Marketplace Functionality

The marketplace allows users to:

- List their names for sale at a chosen price
- Browse available names
- Purchase names directly with their wallet

### Blockchain Integration

- Uses the 1sat ordinal protocol for name representation
- Names are linked to BSV blockchain addresses
- Redis stores pending payments and registration status

## Getting Started

### Prerequisites

- Node.js 18+ and Bun
- Go 1.19+
- Redis server
- BSV wallet (Yours Wallet recommended)

### Installation

1. Clone the repository
   ```
   git clone https://github.com/yourusername/1sat.name.git
   cd 1sat.name
   ```

2. Install frontend dependencies
   ```
   cd frontend
   bun install
   ```

3. Install backend dependencies
   ```
   cd backend
   go mod download
   ```

4. Configure environment variables
   - Create a `.env` file in the root directory using the `.env.example` template

5. Start Redis server
   ```
   redis-server
   ```

6. Run the backend
   ```
   cd backend
   go run cmd/server/server.go
   ```

7. Run the frontend development server
   ```
   cd frontend
   bun run dev
   ```

## Vision for the Future

1sat.name aims to be more than just a name service - it's building a foundation for new flavor of decentralized digital identity that:

- Works across platforms and applications
- Can be integrated into any service that supports BSV
- Provides a human-readable layer to complex blockchain addresses
- Creates a new marketplace for unique digital identities 
- Avoids the "domain shut down" problem for paymail handles