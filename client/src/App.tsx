import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'

function App() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background text-foreground">
      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-3xl font-semibold"
      >
        Sana
      </motion.h1>
      <p className="text-muted-foreground">Foundation scaffold — Phase 1 in progress.</p>
      <Button>Get started</Button>
    </div>
  )
}

export default App
