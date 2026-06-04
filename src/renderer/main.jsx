import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// CAR-243: slice 2's dev-only `#dev-security-setup` route is gone — the
// real first-run wizard lives in Settings → Security and the inline
// SecurityNudge.

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
