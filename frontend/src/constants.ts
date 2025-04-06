export const priceUsd = 1;

// API endpoints
export const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
export const marketApiUrl = 'https://ordinals.gorillapool.io/api';

// Stripe publishable key - You should replace this with your actual publishable key
export const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';

// Stripe product ID for name registration
export const stripeProductId = import.meta.env.VITE_STRIPE_PRODUCT_ID || '';