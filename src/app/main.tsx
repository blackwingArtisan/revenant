import '@fontsource/big-shoulders-display/700';
import '@fontsource/big-shoulders-display/900';
import '@fontsource/ibm-plex-mono/400';
import '@fontsource/ibm-plex-mono/600';
import '@fontsource/monoton/400';
import '@fontsource/special-elite/400';
import '@fontsource/vt323/400';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
