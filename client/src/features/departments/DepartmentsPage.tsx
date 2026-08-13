import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Building2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { useDepartments, useCreateDepartment, useUpdateDepartment, type DepartmentInput } from './api'
import type { Department } from '@/types/department'
import { getApiErrorMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'

const departmentFormSchema = z.object({
  name: z.string().trim().min(1, 'Required'),
  description: z.string().trim().optional(),
})
type DepartmentForm = z.infer<typeof departmentFormSchema>

// Shared by both the "Add department" and "Edit department" dialogs — the
// only difference is which mutation it calls and what it's pre-filled with.
function DepartmentFormDialog({
  trigger,
  title,
  defaultValues,
  onSubmit,
}: {
  trigger: ReactNode
  title: string
  defaultValues: DepartmentForm
  onSubmit: (values: DepartmentInput) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const form = useForm<DepartmentForm>({ resolver: zodResolver(departmentFormSchema), defaultValues })

  async function handleSubmit(values: DepartmentForm) {
    try {
      await onSubmit(values)
      setOpen(false)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) form.reset(defaultValues)
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Departments are referenced by appointments and encounters throughout the system.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Cardiology" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="What this department covers" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

function DepartmentRow({ department }: { department: Department }) {
  const updateDepartment = useUpdateDepartment()

  async function toggleStatus(checked: boolean) {
    try {
      await updateDepartment.mutateAsync({ id: department._id, status: checked ? 'ACTIVE' : 'INACTIVE' })
      toast.success(`${department.name} is now ${checked ? 'active' : 'inactive'}`)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  return (
    <TableRow>
      <TableCell className="font-medium text-slate-900">{department.name}</TableCell>
      <TableCell className="max-w-md text-slate-600">{department.description || '—'}</TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={
            department.status === 'ACTIVE'
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-slate-200 bg-slate-100 text-slate-500'
          }
        >
          {department.status === 'ACTIVE' ? 'Active' : 'Inactive'}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-3">
          <Switch
            checked={department.status === 'ACTIVE'}
            onCheckedChange={toggleStatus}
            aria-label={`Toggle ${department.name} active status`}
          />
          <DepartmentFormDialog
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label={`Edit ${department.name}`}>
                <Pencil className="size-4" />
              </Button>
            }
            title="Edit department"
            defaultValues={{ name: department.name, description: department.description ?? '' }}
            onSubmit={async (values) => {
              await updateDepartment.mutateAsync({ id: department._id, ...values })
              toast.success('Department updated')
            }}
          />
        </div>
      </TableCell>
    </TableRow>
  )
}

export function DepartmentsPage() {
  // `all: true` — this page only renders behind the 'department.manage'
  // permission (see App.tsx), so it's always safe to ask for INACTIVE rows
  // too; the backend independently re-checks the same permission anyway.
  const { data: departments, isLoading } = useDepartments(true)
  const createDepartment = useCreateDepartment()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Departments are referenced when booking appointments and encounters.</p>
        <DepartmentFormDialog
          trigger={
            <Button>
              <Plus className="size-4" /> Add department
            </Button>
          }
          title="Add department"
          defaultValues={{ name: '', description: '' }}
          onSubmit={async (values) => {
            const department = await createDepartment.mutateAsync(values)
            toast.success(`${department.name} added`)
          }}
        />
      </div>

      <div className="rounded-lg border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Name</TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Description</TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-slate-500 uppercase">Status</TableHead>
              <TableHead className="text-right text-xs font-medium tracking-wider text-slate-500 uppercase">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 4 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {!isLoading && departments?.map((department) => <DepartmentRow key={department._id} department={department} />)}
          </TableBody>
        </Table>

        {!isLoading && departments?.length === 0 && (
          <EmptyState icon={Building2} title="No departments yet" description="Add the first department to start scheduling appointments against it." />
        )}
      </div>
    </div>
  )
}
