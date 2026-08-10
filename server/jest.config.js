/** @type {import('ts-jest').JestConfigWithTsJest} */
// Configures Jest to run our TypeScript + native ESM ("type": "module")
// server code directly, without a separate compile step.
export default {
  // Tells ts-jest to treat .ts files as native ESM instead of transpiling to CommonJS.
  preset: 'ts-jest/presets/default-esm',
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
    '^.+\\.ts$': ['ts-jest', { useESM: true }],
  },
  // Only files ending in .test.ts are treated as test suites.
  testMatch: ['**/*.test.ts'],
}
