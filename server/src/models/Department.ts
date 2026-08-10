import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'

// A hospital department (e.g. "Cardiology", "General Medicine"). Referenced
// by Appointments/Encounters in later phases so those records can be
// filtered/grouped by department. Deliberately simple for the MVP — no
// department-level staffing or scheduling rules.
const departmentSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, trim: true },
    // Soft-delete flag: an INACTIVE department is hidden from new-appointment
    // pickers but its historical records are kept intact (never hard-deleted —
    // see blueprint section 5.2 "Soft-delete for important records").
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  },
  { timestamps: true },
)

export type DepartmentAttrs = InferSchemaType<typeof departmentSchema>
export type DepartmentDoc = HydratedDocument<DepartmentAttrs>
export const Department = model<DepartmentAttrs>('Department', departmentSchema)
