import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Browser entry point — mounts the React tree into the <div id="root"> in
// index.html. StrictMode runs extra dev-only checks (e.g. double-invoking
// effects) to surface bugs early; it has no effect in production builds.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
