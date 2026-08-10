import { Department } from '../models/Department.js'
import { AppError } from '../utils/apiResponse.js'

// Creates a new department. Relies on the schema's `unique: true` on `name`
// to reject duplicates — Mongoose surfaces that as a driver-level error
// (code 11000), which we catch here and turn into a clean 409 response
// instead of leaking a raw MongoDB error to the client.
export async function createDepartment(input: { name: string; description?: string }) {
  try {
    return await Department.create(input)
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 11000) {
      throw new AppError('A department with that name already exists', 409, 'DEPARTMENT_EXISTS')
    }
    throw err
  }
}

// Lists departments. By default only ACTIVE ones (for pickers used when
// booking appointments etc.); pass includeInactive=true for the admin
// management screen, which needs to see everything to be able to reactivate one.
export async function listDepartments(includeInactive = false) {
  // Explicitly typed so TS knows `status` is the schema's literal enum, not
  // a plain `string` — otherwise it can't match the Mongoose query overload.
  const filter: { status?: 'ACTIVE' } = includeInactive ? {} : { status: 'ACTIVE' }
  return Department.find(filter).sort({ name: 1 })
}

// Partially updates a department (name/description/status).
export async function updateDepartment(id: string, updates: Partial<{ name: string; description: string; status: 'ACTIVE' | 'INACTIVE' }>) {
  const department = await Department.findByIdAndUpdate(id, updates, { returnDocument: 'after' })
  if (!department) throw new AppError('Department not found', 404, 'DEPARTMENT_NOT_FOUND')
  return department
}
