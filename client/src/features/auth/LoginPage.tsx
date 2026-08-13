import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Mail, ShieldCheck } from 'lucide-react'
import { useAuth } from './useAuth'
import { AuthLayout } from './AuthLayout'
import { getApiErrorMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/PasswordInput'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'

// Mirrors server/src/schemas/auth.ts's loginSchema exactly (trimmed,
// lowercased email; password just needs to be present) — client-side
// validation exists purely to give instant feedback before a round trip,
// the backend re-validates the same rules regardless.
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})
type LoginForm = z.infer<typeof loginSchema>

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  async function onSubmit(values: LoginForm) {
    setServerError(null)
    try {
      await login(values.email, values.password)
      // Send the user back to whatever page they originally tried to
      // reach before ProtectedRoute redirected them here (see
      // components/ProtectedRoute.tsx), or the dashboard by default.
      const from = (location.state as { from?: Location })?.from?.pathname ?? '/dashboard'
      navigate(from, { replace: true })
    } catch (err) {
      setServerError(getApiErrorMessage(err))
    }
  }

  return (
    <AuthLayout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        <Card className="p-2">
          <CardHeader className="space-y-1.5 text-center">
            <div className="mx-auto mb-2 text-2xl font-bold tracking-tight text-blue-600 lg:hidden">Sana</div>
            <CardTitle className="text-xl font-semibold text-slate-900">Welcome back</CardTitle>
            <CardDescription className="text-sm">
              Sign in with the email and password your administrator set up for you.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                          <Input
                            type="email"
                            autoComplete="email"
                            placeholder="you@sana.test"
                            className="h-10 pl-9"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Password</FormLabel>
                        <Link to="/forgot-password" className="text-xs font-medium text-blue-600 hover:underline">
                          Forgot password?
                        </Link>
                      </div>
                      <FormControl>
                        <PasswordInput autoComplete="current-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {serverError && (
                  <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{serverError}</p>
                )}

                <Button type="submit" className="w-full h-10" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
                </Button>
              </form>
            </Form>

            <div className="mt-6 flex items-start gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-blue-600" />
              <p className="text-xs leading-relaxed text-slate-500">
                Access is provisioned by your hospital's admin team. If you don't have an account
                yet, ask an administrator to create one for you.
              </p>
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-slate-400">
          <Link to="/" className="hover:text-blue-600">← Back to Sana</Link>
        </p>
      </motion.div>
    </AuthLayout>
  )
}
