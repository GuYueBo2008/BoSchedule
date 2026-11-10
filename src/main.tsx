import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App';
import { initDeviceClass } from './device';
import { initSafeArea } from './safeArea';
import './styles.css';

initDeviceClass();
if (Capacitor.isNativePlatform()) initSafeArea();

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js'); });
}
