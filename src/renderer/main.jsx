import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { SecuritySetupDev } from './security/setupScaffold';
import './index.css';

// CAR-242: dev-only first-run security setup. Open the app with
// `#dev-security-setup` in the URL to mount this form instead of the
// regular app shell. CAR-243 will replace this with a Settings → Security
// panel.
function Bootstrap() {
  const [hash, setHash] = React.useState(() => (typeof window !== 'undefined' ? window.location.hash : ''));
  React.useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  if (hash === '#dev-security-setup') {
    return <SecuritySetupDev onClose={() => { window.location.hash = ''; }} />;
  }
  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Bootstrap />
  </React.StrictMode>
);
