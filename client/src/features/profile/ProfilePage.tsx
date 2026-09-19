import { motion } from 'framer-motion'
import { useAuth } from '@/features/auth/useAuth'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

// A simple read-only view of the logged-in user's own account. The data comes
// straight from the auth context, which is filled in by /auth/login or
// /auth/refresh. Those endpoints return the same user data shape as GET
// /users/me (see server/src/services/auth.service.ts's toPublicUser), so this
// page doesn't need to make any extra request just to display it.
export function ProfilePage() {
  const { user } = useAuth()
  if (!user) return null

  const fields: Array<[string, string]> = [
    ['Full name', `${user.firstName} ${user.lastName}`],
    ['Email', user.email],
    ['Phone', user.phone || '—'],
    ['Role', user.role.name],
    ['Status', user.status],
  ]

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>My profile</CardTitle>
          <CardDescription>Your account details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {fields.map(([label, value], i) => (
            <div key={label}>
              <div className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-muted-foreground">{label}</span>
                {label === 'Role' ? <Badge variant="secondary">{value}</Badge> : <span className="font-medium">{value}</span>}
              </div>
              {i < fields.length - 1 && <Separator />}
            </div>
          ))}
        </CardContent>
      </Card>
    </motion.div>
  )
}
