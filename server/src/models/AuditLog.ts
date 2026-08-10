import { Schema, model, type InferSchemaType } from 'mongoose'

// One document per sensitive action taken in the system (login, password reset,
// user creation, etc — more actions get logged as later phases add them).
// Read-only from the app's perspective once written; viewed via the admin
// audit-log dashboard built in Phase 9.
const auditLogSchema = new Schema(
  {
    // Who performed the action. Optional because failed-login attempts (where
    // we don't know which user, if any, was being impersonated) still get logged.
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    // Short machine-readable action name, e.g. 'LOGIN_SUCCESS', 'USER_CREATED'.
    action: { type: String, required: true },
    // The type of resource affected, e.g. 'User', 'Patient', 'Invoice'.
    resource: { type: String, required: true },
    // The specific document id affected, if applicable.
    resourceId: { type: String },
    // IP address the request came from — useful for spotting suspicious activity.
    ipAddress: { type: String },
    // Free-form extra context about the action (e.g. { role: 'DOCTOR' } for USER_CREATED).
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }, // audit logs are never updated, only created
)

// Sorting by newest-first is the default view for the audit log dashboard,
// so index createdAt descending to make that query fast.
auditLogSchema.index({ createdAt: -1 })

// Plain attribute shape inferred from the schema.
export type AuditLogDoc = InferSchemaType<typeof auditLogSchema>
// The Mongoose model used to write audit entries (see services/audit.service.ts).
export const AuditLog = model('AuditLog', auditLogSchema)
