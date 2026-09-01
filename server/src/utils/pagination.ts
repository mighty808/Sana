// Turns the page/limit query params from a request into safe, bounded
// values. This is shared by every list endpoint that paginates its results
// (patients, invoices, audit logs, and any future one), so this logic lives
// in one place instead of being copy-pasted slightly differently at each
// call site. It handles two things:
//
// 1. Handling bad input safely: this uses `Number.isFinite` instead of `??`
//    because callers typically pass `Number(req.query.page)` straight
//    through, and `Number("abc")` produces `NaN`. The `??` operator only
//    falls back on `null`/`undefined`, not on `NaN`, so it would let `NaN`
//    slip through unchanged. Without this check, garbage input like
//    `?page=abc` would flow through as `NaN` into `.skip()/.limit()`, which
//    the MongoDB driver would reject with an error instead of just falling
//    back to a sane default page number.
// 2. Capping `limit` so a caller can't ask for an enormous page size and
//    force a huge, slow query — `maxLimit` lets each endpoint set its own
//    ceiling (e.g. audit logs allow more results per page than patient
//    search does).
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
