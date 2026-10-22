import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// The site's theme toggle writes localStorage in the parent page; the storage event reaches this frame.
addEventListener('storage', (e) => {
  if (e.key !== 'theme') return
  if (e.newValue === 'light' || e.newValue === 'dark') document.documentElement.setAttribute('data-theme', e.newValue)
  else document.documentElement.removeAttribute('data-theme')
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
