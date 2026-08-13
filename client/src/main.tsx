import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from '@/features/auth/AuthContext'
import { Toaster } from '@/components/ui/sonner'

// One shared TanStack Query client for the whole app — every feature's
// data-fetching hooks (usePatients, useAppointments, etc., added in later
// build steps) go through this same cache/client rather than each creating
// their own.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Sana's data changes via staff actions elsewhere in the app just as
      // often as via the current user's own actions — a short staleTime
      // (rather than the default "stale immediately") avoids refetching on
      // every single component mount/tab-focus while still keeping data
      // reasonably fresh for a clinical app where seeing current information matters.
      staleTime: 30_000,
      retry: 1,
    },
  },
})

// Browser entry point — mounts the React tree into the <div id="root"> in
// index.html. Provider order matters: QueryClientProvider first (so
// AuthProvider's own API calls during boot can use it if needed later),
// then BrowserRouter (routing), then AuthProvider (needs router context for
// eventual redirects) wrapping <App/> — everything inside can call
// useAuth(), useNavigate(), and TanStack Query hooks. StrictMode runs extra
// dev-only checks (e.g. double-invoking effects) to surface bugs early; it
// has no effect in production builds.
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
