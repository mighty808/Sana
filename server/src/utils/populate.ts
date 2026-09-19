// Mongoose's `.populate()` replaces a ref field's raw ObjectId with the
// full referenced document at runtime, but TypeScript's static types never
// see that happen — a populated field still types as `Types.ObjectId` (or
// whatever the schema says), not the document it actually holds. This
// helper names that gap explicitly at each call site, instead of every
// caller writing and re-explaining its own `as unknown as {...}` cast.
// It does nothing at runtime — it's purely a type-level assertion — so
// it's only safe to use directly after a `.populate()` call that actually
// covers this field.
export function asPopulated<T>(field: unknown): T {
  return field as T
}

// Reduces a ref field to its plain id string, whether it currently holds a
// raw ObjectId, a populated Mongoose document, or a populated plain object
// from `.lean()`. Unlike asPopulated above, this one is real runtime code —
// use it when a value may or may not have been populated (for example an
// ownership comparison in a helper shared by a populated and an unpopulated
// caller), where a type-level cast alone would silently compare the wrong
// thing.
//
// Note a raw Mongoose ObjectId does technically have an `.id` property, but
// it's a Buffer rather than the hex string, which is why that branch checks
// for a string specifically before trusting it.
export function refToIdString(field: unknown): string | undefined {
  if (field === null || field === undefined) return undefined
  if (typeof field === 'string') return field

  const candidate = field as { id?: unknown; _id?: unknown }
  if (typeof candidate.id === 'string') return candidate.id
  if (candidate._id !== undefined && candidate._id !== null) return String(candidate._id)
  return String(field)
}
