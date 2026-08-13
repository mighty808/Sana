import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Mail, MailCheck } from 'lucide-react'
import { api, getApiErrorMessage } from '@/lib/api'
import { AuthLayout } from './AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'

// Mirrors server/src/schemas/auth.ts's forgotPasswordSchema.
const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
})
type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>

export function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })

  async function onSubmit(values: ForgotPasswordForm) {
    setServerError(null)
    try {
      // The backend always returns the same generic success message here,
      // whether or not the email is actually registered (see
      // server/src/services/auth.service.ts's requestPasswordReset) — so
      // this form always shows the same "check your email" confirmation
      // too, deliberately not revealing which emails exist in the system.
      await api.post('/auth/forgot-password', values)
      setSubmitted(true)
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
            {submitted && (
              <span className="mx-auto mb-1 flex size-11 items-center justify-center rounded-full bg-green-50 text-green-600">
                <MailCheck className="size-5" />
              </span>
            )}
            <CardTitle className="text-xl font-semibold text-slate-900">
              {submitted ? 'Check your email' : 'Forgot password'}
            </CardTitle>
            <CardDescription className="text-sm">
              {submitted
                ? "If that email is registered with Sana, a reset link is on its way. It expires in 1 hour, so use it soon."
                : "No problem — enter the email your administrator registered for you and we'll send a link to reset your password."}
            </CardDescription>
          </CardHeader>
          {!submitted && (
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
                  {serverError && (
                    <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{serverError}</p>
                  )}
                  <Button type="submit" className="w-full h-10" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? 'Sending…' : 'Send reset link'}
                  </Button>
                </form>
              </Form>
            </CardContent>
          )}
          <CardContent className={submitted ? 'flex justify-center pt-0' : 'pt-0'}>
            <Link to="/login" className="text-sm font-medium text-blue-600 hover:underline">
              ← Back to sign in
            </Link>
          </CardContent>
        </Card>
      </motion.div>
    </AuthLayout>
  )
}
