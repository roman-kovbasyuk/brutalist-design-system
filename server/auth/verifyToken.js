import { randomUUID } from 'node:crypto'
import { applicationDefault, deleteApp, getApp, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { z } from 'zod'
import { roleSchema } from '../../shared/contracts.js'
import { withTransaction } from '../db/pool.js'
import { createUserRepository } from '../repositories/userRepository.js'
import { AuthorizationError, unauthorized } from './authorize.js'

const verifiedIdentitySchema = z.strictObject({
  uid: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email().max(320),
  email_verified: z.literal(true),
  name: z.string().trim().optional(),
}).passthrough()

const firebaseAppName = 'banner-studio-auth'
const defaultFirebaseSdk = { applicationDefault, deleteApp, getApp, getAuth, initializeApp }

function bearerToken(request) {
  const authorization = request?.headers?.authorization
  const match = typeof authorization === 'string' ? /^Bearer ([^\s]+)$/.exec(authorization) : null
  if (!match) throw unauthorized()
  return match[1]
}

export function createAuthenticator({
  pool,
  tokenVerifier,
  transaction = withTransaction,
  userRepositoryFactory = createUserRepository,
  idGenerator = randomUUID,
} = {}) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('A PostgreSQL pool is required')
  if (!tokenVerifier || typeof tokenVerifier.verify !== 'function') throw new TypeError('A token verifier is required')
  if (typeof transaction !== 'function') throw new TypeError('A transaction function is required')

  return async function authenticate(request) {
    const token = bearerToken(request)
    let claims
    try {
      claims = await tokenVerifier.verify(token)
    } catch {
      throw unauthorized()
    }

    const identity = verifiedIdentitySchema.safeParse(claims)
    if (!identity.success) throw unauthorized()

    const actor = await transaction(pool, async (client) => userRepositoryFactory(client).resolveAuthenticatedUser({
      firebaseUid: identity.data.uid,
      verifiedEmail: identity.data.email,
      displayName: identity.data.name || identity.data.email,
      userId: idGenerator(),
    }))
    if (
      !actor
      || typeof actor.id !== 'string'
      || actor.id.trim().length === 0
      || actor.firebaseUid !== identity.data.uid
      || actor.email !== identity.data.email
      || !roleSchema.safeParse(actor.role).success
    ) throw unauthorized()
    if (actor.disabledAt != null || actor.disabled === true) {
      throw new AuthorizationError(403, 'user_disabled', 'This user is disabled')
    }
    return actor
  }
}

export function createFirebaseTokenVerifier({ firebaseApp, projectId, sdk = defaultFirebaseSdk } = {}) {
  const expectedProjectId = typeof projectId === 'string' ? projectId.trim() : ''
  if (!expectedProjectId) throw new TypeError('A Firebase project ID is required')

  let app = firebaseApp
  let ownsApp = false
  if (!app) {
    try {
      app = sdk.getApp(firebaseAppName)
    } catch (error) {
      if (error?.code !== 'app/no-app') throw error
      app = sdk.initializeApp({
        credential: sdk.applicationDefault(),
        projectId: expectedProjectId,
      }, firebaseAppName)
      ownsApp = true
    }
  }
  if (app?.options?.projectId !== expectedProjectId) {
    throw new Error('Firebase app project does not match FIREBASE_PROJECT_ID')
  }

  const auth = sdk.getAuth(app)
  let closed = false

  return {
    async verify(token) {
      return auth.verifyIdToken(token, true)
    },
    async close() {
      if (!ownsApp || closed) return
      closed = true
      await sdk.deleteApp(app)
    },
  }
}
