import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'

// One document per hospital-system user — admin, doctor, nurse, patient,
// or lab tech. The actual permissions a user has come from their
// referenced Role, not from anything stored directly on the User.
const userSchema = new Schema(
  {
    // Login identifier. Lowercased + unique so "Doc@Sana.test" and
    // "doc@sana.test" can't both be registered as separate accounts.
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Argon2id hash of the password — the plaintext password is never stored.
    passwordHash: { type: String, required: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    // Reference to a Role document — this is how the user's permissions are determined.
    role: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
    // INACTIVE accounts are rejected at login/auth-middleware time even with
    // a valid password — used instead of hard-deleting user records.
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
    // Updated on every successful login; useful for admin dashboards/audits.
    lastLoginAt: { type: Date },
    // Incremented on logout or password reset to invalidate all existing
    // refresh tokens for this user in one step (see auth.service.ts).
    tokenVersion: { type: Number, default: 0 },
    // SHA-256 hash of the current password-reset token (never the raw token).
    // `select: false` keeps it out of normal queries so it's never accidentally
    // sent to the client — callers must explicitly `.select('+passwordResetTokenHash')`.
    passwordResetTokenHash: { type: String, select: false },
    // When the reset token above expires; reset requests after this are rejected.
    passwordResetExpires: { type: Date, select: false },
  },
  { timestamps: true }, // adds createdAt/updatedAt automatically
)

// Note: `unique: true` on the `email` field above already creates a unique
// index — no separate `userSchema.index({ email: 1 })` call needed (that
// would register the same index twice and trigger a Mongoose warning).

// Plain attribute shape inferred from the schema (no Mongoose Document methods).
export type UserAttrs = InferSchemaType<typeof userSchema>
// The "hydrated" document type — UserAttrs plus Mongoose instance methods
// like .save() and the .id virtual getter (string version of _id).
export type UserDoc = HydratedDocument<UserAttrs>
// The Mongoose model used to query/create/update User documents.
export const User = model<UserAttrs>('User', userSchema)
