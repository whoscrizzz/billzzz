import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initServiceWorker } from './components/UpdatePrompt';
import './index.css';
import App from './App.tsx';

initServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
