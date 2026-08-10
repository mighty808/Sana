// Resolves page/limit query params into safe, bounded values — shared by
// every list endpoint that paginates (patients, invoices, audit logs, and
// any future one). Centralizes two things that were previously
// copy-pasted with slightly different behavior at each call site:
//
// 1. NaN-safety: `Number.isFinite` (not `??`) is required because callers
//    typically pass `Number(req.query.page)` straight through, and
//    `Number("abc")` is `NaN` — a "truthy-ish" value `??` does NOT replace
//    (only `null`/`undefined` trigger `??`'s fallback). Without this check,
//    garbage input like `?page=abc` would flow through as NaN into
//    `.skip()/.limit()`, which the MongoDB driver rejects with an
//    uncaught error instead of just falling back to a sane default.
// 2. A capped `limit` so a caller can't request an enormous page size and
//    force an unbounded query — `maxLimit` lets each endpoint set its own
//    ceiling (e.g. audit logs allow more per page than patient search).
export function resolvePagination(
  input: { page?: number; limit?: number },
  opts: { defaultLimit?: number; maxLimit?: number } = {},
) {
  const defaultLimit = opts.defaultLimit ?? 20
  const maxLimit = opts.maxLimit ?? 100

  const page = Number.isFinite(input.page) && input.page! > 0 ? Math.floor(input.page!) : 1
  const limit =
    Number.isFinite(input.limit) && input.limit! > 0 ? Math.min(maxLimit, Math.floor(input.limit!)) : defaultLimit

  return { page, limit, skip: (page - 1) * limit }
}
