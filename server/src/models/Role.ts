import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'
import { PERMISSIONS, ROLE_NAMES } from '../types/permissions.js'

// A Role is just a name (ADMIN/DOCTOR/NURSE/PATIENT) plus the list of
// permission strings it grants. Users reference a Role by id instead of
// storing permissions directly, so changing what a role can do (e.g. adding
// a new permission to DOCTOR) instantly applies to every doctor account.
const roleSchema = new Schema(
  {
    // Restricted to the known role names via `enum`, enforced at the database level too.
    name: { type: String, required: true, unique: true, enum: ROLE_NAMES },
    // Array of permission strings this role grants, restricted to the known
    // permission list so typos/invalid permissions are rejected on save.
    permissions: [{ type: String, enum: PERMISSIONS }],
  },
  { timestamps: true }, // adds createdAt/updatedAt automatically
)

// Plain attribute shape inferred from the schema (no Mongoose Document methods).
export type RoleAttrs = InferSchemaType<typeof roleSchema>
// The "hydrated" document type — RoleAttrs plus Mongoose instance methods
// like .save(), .populate(), and the .id virtual getter. This is what you
// actually get back from Role.findOne(), Role.create(), etc.
export type RoleDoc = HydratedDocument<RoleAttrs>
// The Mongoose model used to query/create/update Role documents.
export const Role = model<RoleAttrs>('Role', roleSchema)
