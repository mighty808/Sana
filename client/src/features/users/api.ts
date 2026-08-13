import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type ApiSuccess } from '@/lib/api'
import type { AuthUser, RoleName } from '@/types/auth'

// The exact body POST /users accepts — mirrors server/src/schemas/auth.ts's
// createUserSchema. There is deliberately no update/deactivate endpoint on
// the backend yet, so this feature only supports list + create — a
// "deactivate" button would be a dead click with nothing to call.
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
