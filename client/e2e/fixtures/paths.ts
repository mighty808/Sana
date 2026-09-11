import path from 'node:path'
import { fileURLToPath } from 'node:url'

// client/ is an ESM package ("type": "module" in package.json), so
// __dirname isn't available in these files the way it would be in CJS —
// this is the standard ESM equivalent. Shared here so every spec/setup
// file that needs e2e/.auth/ computes the same path the same way, instead
// of re-deriving it (and re-hitting the same ReferenceError) in each file.
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// This file lives in e2e/fixtures/, so .auth/ (created by auth.setup.ts) is
// one level up, at e2e/.auth/.
export function authStatePath(role: string): string {
  return path.join(__dirname, '..', '.auth', `${role}.json`)
}
