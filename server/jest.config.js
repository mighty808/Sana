/** @type {import('@jest/types').Config.InitialOptions} */
// Configures Jest to run our TypeScript + native ESM ("type": "module")
// server code directly, without a separate compile step.
//
// Uses @swc/jest (a fast Rust-based transform) instead of ts-jest. ts-jest
// was the original choice, but TypeScript 7 (this project's pinned
// version — see package.json) removed the JS compiler API ts-jest's
// current release depends on, making every test suite fail to even load
// with "does not expose the JavaScript compiler API required by ts-jest."
// @swc/jest only strips types — it does no type-checking of its own — but
// that's not a loss here: `npx tsc --noEmit` already type-checks the whole
// project, and re-checking types on every test run would just be slower
// for no extra safety. If ts-jest ever ships a TypeScript-7-compatible
// release, switching back is a config-only change; nothing about how
// tests are written above this file depends on which transform runs them.
export default {
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  // Our source imports use explicit ".js" extensions (required by NodeNext
  // module resolution, e.g. `import { env } from './env.js'` even though the
  // actual file is env.ts) — this mapping tells Jest to resolve those
  // ".js" import paths back to the real ".ts" source files.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': [
      '@swc/jest',
      {
        jsc: { target: 'es2022', parser: { syntax: 'typescript' } },
        module: { type: 'es6' },
      },
    ],
  },
  // Only files ending in .test.ts are treated as test suites.
  testMatch: ['**/*.test.ts'],
}
