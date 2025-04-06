# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config({
  extends: [
    // Remove ...tseslint.configs.recommended and replace with this
    ...tseslint.configs.recommendedTypeChecked,
    // Alternatively, use this for stricter rules
    ...tseslint.configs.strictTypeChecked,
    // Optionally, add this for stylistic rules
    ...tseslint.configs.stylisticTypeChecked,
  ],
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config({
  plugins: {
    // Add the react-x and react-dom plugins
    'react-x': reactX,
    'react-dom': reactDom,
  },
  rules: {
    // other rules...
    // Enable its recommended typescript rules
    ...reactX.configs['recommended-typescript'].rules,
    ...reactDom.configs.recommended.rules,
  },
})
```

## Stripe Integration

The application uses Stripe Checkout for processing payments when registering new names. The Stripe integration requires the following backend API endpoint:

### Required Backend Endpoint

1. `POST /create-checkout-session`

   This endpoint should create a Stripe Checkout session and return a URL that the user will be redirected to.

   **Request Body:**
   ```json
   {
     "productId": "prod_S4paZiF5jYieyS",
     "name": "username",
     "price": 100, // in cents
     "success_url": "https://example.com/success",
     "cancel_url": "https://example.com/canceled"
   }
   ```

   **Response:**
   ```json
   {
     "url": "https://checkout.stripe.com/..."
   }
   ```

   **Implementation Details:**
   - The backend should use the Stripe API to create a checkout session
   - The `productId` should be used to identify the product in Stripe
   - The `name` should be stored with the checkout session as metadata
   - After successful payment, the backend should handle the webhook from Stripe to complete the name registration
   - The success_url will include a query parameter `?success=true`
   - The cancel_url will include a query parameter `?canceled=true`

### Payment Flow

1. User enters a name to register and clicks "Register"
2. Frontend saves the name in localStorage and calls the `/create-checkout-session` endpoint
3. Backend creates a Stripe Checkout session and returns the URL
4. Frontend redirects the user to the Stripe Checkout page
5. User completes payment on the Stripe Checkout page
6. Stripe redirects the user back to the application with success/canceled query parameters
7. Frontend reads the query parameters and completes the registration if payment was successful
