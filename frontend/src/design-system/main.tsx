import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/index.css'
import { ThemeProvider } from '@/components/theme'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import DesignSystemPage from './DesignSystemPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <TooltipProvider>
        <DesignSystemPage />
        <Toaster position="top-center" />
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>,
)
