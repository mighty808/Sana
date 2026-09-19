import { notify, listNotifications, listAllNotifications, markAsRead } from '../services/notification.service.js'
import { connectTestDb, clearTestDb, disconnectTestDb, DB_BOOT_TIMEOUT_MS } from './setupTestDb.js'
import { createUser } from './factories.js'

beforeAll(connectTestDb, DB_BOOT_TIMEOUT_MS)
afterEach(clearTestDb)
afterAll(disconnectTestDb, DB_BOOT_TIMEOUT_MS)

describe('notify', () => {
  test('creates a notification even when Socket.IO is not initialized (never throws)', async () => {
    const user = await createUser('DOCTOR')

    const notification = await notify(user.id, {
      type: 'test.event',
      title: 'Test',
      message: 'Something happened',
      entityType: 'Appointment',
      entityId: '507f1f77bcf86cd799439011',
    })

    expect(notification?.title).toBe('Test')
    expect(notification?.readAt).toBeUndefined()
  })
})

describe('listNotifications', () => {
  test('only returns this user\'s own notifications, newest first', async () => {
    const userA = await createUser('DOCTOR')
    const userB = await createUser('DOCTOR')
    await notify(userA.id, { type: 'a.1', title: 'First', message: 'x' })
    await notify(userA.id, { type: 'a.2', title: 'Second', message: 'x' })
    await notify(userB.id, { type: 'b.1', title: 'Not yours', message: 'x' })

    const result = await listNotifications(userA.id)
    expect(result).toHaveLength(2)
    expect(result[0]?.title).toBe('Second') // newest first
  })
})

describe('listAllNotifications', () => {
  test('returns notifications for every user, newest first, with the recipient populated', async () => {
    const userA = await createUser('DOCTOR')
    const userB = await createUser('NURSE')
    await notify(userA.id, { type: 'a.1', title: 'First', message: 'x' })
    await notify(userB.id, { type: 'b.1', title: 'Second', message: 'x' })

    const result = await listAllNotifications()

    expect(result.length).toBeGreaterThanOrEqual(2)
    expect(result[0]?.title).toBe('Second') // newest first
    const populatedUser = result[0]?.user as unknown as { firstName: string }
    expect(populatedUser.firstName).toBe(userB.firstName)
  })
})

describe('markAsRead', () => {
  test('sets readAt the first time', async () => {
    const user = await createUser('DOCTOR')
    const notification = await notify(user.id, { type: 'x', title: 'x', message: 'x' })

    const updated = await markAsRead(notification!.id, user.id)
    expect(updated.readAt).toBeInstanceOf(Date)
  })

  test('marking an already-read notification again is a harmless no-op', async () => {
    const user = await createUser('DOCTOR')
    const notification = await notify(user.id, { type: 'x', title: 'x', message: 'x' })
    const firstRead = await markAsRead(notification!.id, user.id)
    const firstReadAt = firstRead.readAt

    const secondRead = await markAsRead(notification!.id, user.id)
    expect(secondRead.readAt?.getTime()).toBe(firstReadAt?.getTime())
  })

  test('cannot mark another user\'s notification as read', async () => {
    const owner = await createUser('DOCTOR')
    const stranger = await createUser('DOCTOR')
    const notification = await notify(owner.id, { type: 'x', title: 'x', message: 'x' })

    await expect(markAsRead(notification!.id, stranger.id)).rejects.toMatchObject({
      status: 404,
      code: 'NOTIFICATION_NOT_FOUND',
    })
  })

  test('rejects a nonexistent notification id', async () => {
    const user = await createUser('DOCTOR')
    await expect(markAsRead('507f1f77bcf86cd799439011', user.id)).rejects.toMatchObject({ status: 404 })
  })
})
