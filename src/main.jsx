import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.jsx'
import { StoreProvider } from './lib/store.jsx'
import { ThemeProvider } from './lib/theme.jsx'
import { ToastProvider } from './lib/toast.jsx'
import { registerServiceWorker } from './lib/push.js'
import './index.css'

registerServiceWorker()

// HashRouter:GitHub Pages 為靜態站台,用 hash 路由避免重新整理時 404
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <HashRouter>
          <StoreProvider>
            <App />
          </StoreProvider>
        </HashRouter>
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
