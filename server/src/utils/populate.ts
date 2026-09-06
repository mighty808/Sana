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
