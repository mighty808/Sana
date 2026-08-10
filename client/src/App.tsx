import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'

// Temporary placeholder root component — proves the Phase 1 stack (Tailwind
// utility classes, a shadcn/ui component, and a Framer Motion animation) all
// work together end to end. Gets replaced with real routing (React Router)
// and pages starting in Phase 2 (login screen) onward.
function App() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background text-foreground">
      {/* Fades and slides in on mount to sanity-check Framer Motion is wired up. */}
      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-3xl font-semibold"
      >
        Sana
      </motion.h1>
      <p className="text-muted-foreground">Foundation scaffold — Phase 1 in progress.</p>
      {/* shadcn/ui Button, styled via the Tailwind theme tokens in index.css. */}
      <Button>Get started</Button>
    </div>
  )
}

export default App
