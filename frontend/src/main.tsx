import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { WalletProvider } from './context/WalletContext'
import { YoursProvider } from 'yours-wallet-provider'

// Initialize theme from localStorage or default to user preference or 'light'
const initializeTheme = () => {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
  } else if (window?.matchMedia?.('(prefers-color-scheme: dark)')?.matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
  }
};

// Apply theme on app initialization
initializeTheme();

// Get root element
const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <YoursProvider>
      <WalletProvider>
        <App />
      </WalletProvider>
    </YoursProvider>
  </React.StrictMode>,
)
