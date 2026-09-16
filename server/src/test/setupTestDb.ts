import { MongoMemoryServer, MongoMemoryReplSet } from 'mongodb-memory-server'
import mongoose from 'mongoose'

let mongod: MongoMemoryServer | undefined

// mongodb-memory-server gives a mongod 10 seconds to come up and then aborts
// with "Instance failed to start within 10000ms". That default assumes a
// developer machine with headroom; it does not survive a full `jest
// --runInBand` sweep on a 6 GB box, where two dozen suites have already
// churned the page cache and mongod's own startup is competing with them.
//
// This is a SEPARATE limit from the Jest hook timeout below, and raising one
// without the other fixes nothing: Jest must be willing to wait, AND the
// library must not give up first. The failure signatures differ — Jest reports
// "Exceeded timeout of Nms for a hook", the library reports
// "GenericMMSError: Instance failed to start within Nms".
const INSTANCE_LAUNCH_TIMEOUT_MS = 60_000

// Starts a fresh, throwaway in-memory MongoDB and points Mongoose at it.
// Call once from a `beforeAll` in any test suite that touches models.
// This never touches the real Atlas database the app uses outside tests —
// there is no shared state between test runs or with production data.
export async function connectTestDb() {
  mongod = await MongoMemoryServer.create({
    instance: { launchTimeout: INSTANCE_LAUNCH_TIMEOUT_MS },
  })
  await mongoose.connect(mongod.getUri())
}

// Drops every document from every collection between tests, so one test's
// fixtures can never leak into the next. Call from `afterEach`. Faster
// than dropping and recreating the database, and keeps indexes intact.
export async function clearTestDb() {
  const { collections } = mongoose.connection
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})))
}

// Closes the Mongoose connection and stops the in-memory server. Call once
// from `afterAll`.
export async function disconnectTestDb() {
  await mongoose.disconnect()
  await mongod?.stop()
}

let replSet: MongoMemoryReplSet | undefined

// Jest's default timeout for a hook is 5 seconds, and booting a mongod does
// not fit in it — tens of seconds on a modest machine, and longer still for
// the replica-set variant, which additionally has to initiate the set and
// wait out the node's election before it is writable.
//
// Every suite that connects to a test database therefore passes this as the
// explicit timeout on its beforeAll/afterAll. Raising Jest's GLOBAL
// testTimeout instead would have been one line, but it would slacken the
// limit on every ordinary test too — and a test that genuinely hangs should
// still fail fast. The cost of keeping it narrow is the third argument.
export const DB_BOOT_TIMEOUT_MS = 120_000

// A single-node replica set instead of the plain standalone instance
// above — needed ONLY by tests that exercise a real MongoDB transaction
// (payment.service.ts's recordPayment uses session.withTransaction).
// Transactions are rejected outright on a standalone mongod ("Transaction
// numbers are only allowed on a replica set member or mongos"), and a
// single-node replica set is the smallest configuration that still
// supports them. This takes longer to boot than connectTestDb() above, so
// it's kept as its own opt-in pair rather than switching every test file
// over to it.
export async function connectTestDbWithReplSet() {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    // Per-member options; with count 1 that's a single entry. The replica
    // set forwards launchTimeout from here down to each member's mongod.
    instanceOpts: [{ launchTimeout: INSTANCE_LAUNCH_TIMEOUT_MS }],
  })
  await mongoose.connect(replSet.getUri())
}

export async function disconnectTestDbReplSet() {
  await mongoose.disconnect()
  await replSet?.stop()
}
