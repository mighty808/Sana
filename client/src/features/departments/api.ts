import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type ApiSuccess } from '@/lib/api'
import type { Department } from '@/types/department'

export interface DepartmentInput {
  name: string
  description?: string
}

// GET /departments?all=true — `all` only actually includes INACTIVE rows
// server-side if the caller's role holds 'department.manage' (see
// department.controller.ts), so passing it here is safe for every role;
// non-admins just silently get the normal ACTIVE-only list back.
export function useDepartments(all = false) {
  return useQuery({
    queryKey: ['departments', { all }],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<Department[]>>('/departments', { params: all ? { all: 'true' } : undefined })
      return res.data.data
    },
  })
}

export function useCreateDepartment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: DepartmentInput) => {
      const res = await api.post<ApiSuccess<Department>>('/departments', input)
      return res.data.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['departments'], exact: false }),
  })
}

export function useUpdateDepartment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<DepartmentInput> & { id: string; status?: Department['status'] }) => {
      const res = await api.patch<ApiSuccess<Department>>(`/departments/${id}`, input)
      return res.data.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['departments'], exact: false }),
  })
}
