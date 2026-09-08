import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from '@/features/auth/AuthContext'
import { Toaster } from '@/components/ui/sonner'

// One shared TanStack Query client for the whole app. Every feature's
// data-fetching hooks (usePatients, useAppointments, etc.) use this same
// cache instead of each creating their own.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // In Sana, data often changes because other staff members are making
      // edits elsewhere in the app, not just because of what the current
      // user is doing. A short staleTime means we don't refetch every time
      // a component mounts or the browser tab regains focus, while still
      // keeping the data fresh enough for a clinical app where seeing
      // current information matters.
      staleTime: 30_000,
      retry: 1,
    },
  },
})

// This is the browser entry point — it mounts the React app into the
// <div id="root"> in index.html. The order of the providers below matters:
// QueryClientProvider goes first, so AuthProvider's own API calls during
// startup can use it if needed. Then BrowserRouter for routing. Then
// AuthProvider, which needs router access for redirects, wrapping <App/>.
// Because of this order, everything inside can call useAuth(), useNavigate(),
// and TanStack Query hooks. StrictMode runs extra checks during development
// only (like calling effects twice) to help catch bugs early. It has no
// effect on the production build that users actually see.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
          <Toaster richColors position="top-right" />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
