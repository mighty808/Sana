import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type ApiSuccess } from '@/lib/api'
import type { AuthUser, RoleName } from '@/types/auth'

// The exact data that POST /users accepts, matching server/src/schemas/auth.ts's
// createUserSchema. The backend doesn't have an update or deactivate endpoint yet,
// so this feature only supports listing and creating users for now. A
// "deactivate" button wouldn't have anything to call, so it isn't built here.
export interface UserInput {
  email: string
  password: string
  firstName: string
  lastName: string
  phone?: string
  role: RoleName
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<AuthUser[]>>('/users')
      return res.data.data
    },
  })
}

// GET /users/doctors — a narrower lookup than useUsers() above, which requires
// the Admin-only 'user.manage' permission. This one powers the doctor picker on
// the appointment-booking form, and instead requires 'appointment.create',
// which only a Nurse has.
export function useDoctors() {
  return useQuery({
    queryKey: ['users', 'doctors'],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<AuthUser[]>>('/users/doctors')
      return res.data.data
    },
  })
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UserInput) => {
      const res = await api.post<ApiSuccess<AuthUser>>('/users', input)
      return res.data.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'], exact: false }),
  })
}
