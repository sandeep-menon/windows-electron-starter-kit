import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { Toaster } from './components/ui/sonner'
import { ThemeProvider } from './components/theme-provider'
import { ErrorBoundary } from './components/ErrorBoundary'
import { globalErrorLogging } from './lib/errorLogging'

globalErrorLogging();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider defaultTheme='system'>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
      <Toaster richColors />
    </ThemeProvider>
  </StrictMode>
)
