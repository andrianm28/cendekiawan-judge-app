import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Ask the browser not to clear the tablet's saved scores when storage runs low.
void navigator.storage?.persist?.().catch(() => {})

// Lets a tablet reopen the app with no Wi-Fi (public/sw.js). Production builds only,
// so the dev server is never served from a cache.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js').catch(() => {})
}
