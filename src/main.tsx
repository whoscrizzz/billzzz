import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initServiceWorker } from './components/UpdatePrompt';
import { initPushSyncListeners } from './lib/push-sync';
import './index.css';
import App from './App.tsx';
import './platform.css';

initServiceWorker();
initPushSyncListeners();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
