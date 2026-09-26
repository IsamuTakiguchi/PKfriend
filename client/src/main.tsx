import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { sfx, getAudioContext, getBus } from './audio';
import { music } from './music';

// debug / test hook (used by the automated audio checks)
(window as unknown as { __pk: unknown }).__pk = { sfx, music, getAudioContext, getBus };

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {}); });
}
