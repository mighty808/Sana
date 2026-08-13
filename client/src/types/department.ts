// Matches server/src/models/Department.ts's document shape — returned as
// a raw Mongoose document (see department.controller.ts), so this is
// `_id`, not `id` (unlike /users, which normalizes via toPublicUser()).
export interface Department {
  _id: string
  name: string
  description?: string
  status: 'ACTIVE' | 'INACTIVE'
  createdAt: string
}
