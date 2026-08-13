import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { KeyRound, ShieldAlert } from 'lucide-react'
import { api, getApiErrorMessage } from '@/lib/api'
import { AuthLayout } from './AuthLayout'
import { Button } from '@/components/ui/button'
import { PasswordInput } from '@/components/PasswordInput'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'

// Mirrors server/src/schemas/auth.ts's resetPasswordSchema (newPassword
// min length 8 — the same floor the backend enforces).
const resetPasswordSchema = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
})
type ResetPasswordForm = z.infer<typeof resetPasswordSchema>

export function ResetPasswordPage() {
  // The raw reset token — emailed to the user in a real deployment; in
  // this MVP (no email service — see server/src/controllers/auth.controller.ts's
  // forgotPassword) it's logged server-side and expected to be pasted into
  // the URL as ?token=... for demo purposes.
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: '' },
  })

  async function onSubmit(values: ResetPasswordForm) {
    setServerError(null)
    try {
      await api.post('/auth/reset-password', { token, ...values })
      navigate('/login', { replace: true })
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
            <span
              className={`mx-auto mb-1 flex size-11 items-center justify-center rounded-full ${
                token ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'
              }`}
            >
              {token ? <KeyRound className="size-5" /> : <ShieldAlert className="size-5" />}
            </span>
            <CardTitle className="text-xl font-semibold text-slate-900">
              {token ? 'Choose a new password' : 'Link expired or invalid'}
            </CardTitle>
            <CardDescription className="text-sm">
              {token
                ? 'Use at least 8 characters. You\'ll be signed out everywhere else once this is saved.'
                : 'This reset link is missing or no longer valid — request a new one from the forgot password page.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!token ? (
              <Button asChild className="w-full h-10">
                <Link to="/forgot-password">Request a new link</Link>
              </Button>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="newPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>New password</FormLabel>
                        <FormControl>
                          <PasswordInput autoComplete="new-password" placeholder="At least 8 characters" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {serverError && (
                    <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{serverError}</p>
                  )}
                  <Button type="submit" className="w-full h-10" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? 'Resetting…' : 'Reset password'}
                  </Button>
                </form>
              </Form>
            )}
            <Link to="/login" className="mt-4 inline-block text-sm font-medium text-blue-600 hover:underline">
              ← Back to sign in
            </Link>
          </CardContent>
        </Card>
      </motion.div>
    </AuthLayout>
  )
}
