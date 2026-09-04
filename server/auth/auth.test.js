import { describe, expect, test, vi } from 'vitest'
import { createAuthenticator, createFirebaseTokenVerifier } from './verifyToken.js'
import { createAuthorizer } from './authorize.js'
import { transitionCampaign } from '../../shared/workflowRules.js'

const activeUser = {
  id: 'user-1',
  email: 'person@example.com',
  firebaseUid: 'firebase-user-1',
  role: 'designer',
  displayName: 'Person',
  disabledAt: null,
}

function request(authorization) {
  return { headers: authorization === undefined ? {} : { authorization } }
}

function harness({ claims, verifyError, resolvedUser = activeUser } = {}) {
  const tokenVerifier = {
    verify: vi.fn(async () => {
      if (verifyError) throw verifyError
      return claims ?? {
        uid: 'firebase-user-1',
        email: ' Person@Example.com ',
        email_verified: true,
        name: 'Person',
      }
    }),
  }
  const userRepository = {
    resolveAuthenticatedUser: vi.fn(async () => resolvedUser),
  }
  const transaction = vi.fn(async (_pool, operation) => operation({ query: vi.fn() }))
  const authenticate = createAuthenticator({
    pool: { query: vi.fn() },
    tokenVerifier,
    transaction,
    userRepositoryFactory: () => userRepository,
    idGenerator: () => 'generated-user-1',
  })
  return { authenticate, tokenVerifier, userRepository, transaction }
}

describe('Firebase request authentication', () => {
  test('resolves an invited actor from verified claims and normalized email', async () => {
    const { authenticate, tokenVerifier, userRepository } = harness()

    await expect(authenticate(request('Bearer valid-token'))).resolves.toEqual(activeUser)
    expect(tokenVerifier.verify).toHaveBeenCalledWith('valid-token')
    expect(userRepository.resolveAuthenticatedUser).toHaveBeenCalledWith({
      firebaseUid: 'firebase-user-1',
      verifiedEmail: 'person@example.com',
      displayName: 'Person',
      userId: 'generated-user-1',
    })
  })

  test('falls back to the verified email when Firebase has no usable display name', async () => {
    const { authenticate, userRepository } = harness({
      claims: { uid: 'firebase-user-1', email: 'person@example.com', email_verified: true, name: '   ' },
    })

    await expect(authenticate(request('Bearer valid-token'))).resolves.toEqual(activeUser)
    expect(userRepository.resolveAuthenticatedUser).toHaveBeenCalledWith(expect.objectContaining({
      displayName: 'person@example.com',
    }))
  })

  test.each([
    undefined,
    '',
    'Basic token',
    'bearer token',
    'Bearer',
    'Bearer token extra',
  ])('rejects a missing or malformed bearer header: %s', async (authorization) => {
    const { authenticate, tokenVerifier } = harness()

    await expect(authenticate(request(authorization))).rejects.toMatchObject({
      statusCode: 401,
      code: 'unauthorized',
      publicMessage: 'Authentication is required',
      expose: true,
    })
    expect(tokenVerifier.verify).not.toHaveBeenCalled()
  })

  test('normalizes expired or invalid SDK errors without exposing their details', async () => {
    const { authenticate } = harness({
      verifyError: new Error('Firebase ID token has expired at 2026-09-04; project secret follows'),
    })

    const error = await authenticate(request('Bearer expired-token')).catch((caught) => caught)

    expect(error).toMatchObject({
      statusCode: 401,
      code: 'unauthorized',
      publicMessage: 'Authentication is required',
      expose: true,
    })
    expect(error.message).not.toContain('Firebase')
    expect(error.message).not.toContain('secret')
  })

  test.each([
    [{ uid: 'firebase-user-1', email: 'person@example.com', email_verified: false }, 'unverified'],
    [{ uid: '', email: 'person@example.com', email_verified: true }, 'missing UID'],
    [{ uid: 'firebase-user-1', email: 'not-an-email', email_verified: true }, 'invalid email'],
  ])('rejects %s identity claims', async (claims) => {
    const { authenticate, userRepository } = harness({ claims })

    await expect(authenticate(request('Bearer token'))).rejects.toMatchObject({ statusCode: 401, code: 'unauthorized' })
    expect(userRepository.resolveAuthenticatedUser).not.toHaveBeenCalled()
  })

  test('rejects an uninvited or identity-mismatched user returned by persistence', async () => {
    const { authenticate } = harness({ resolvedUser: null })

    await expect(authenticate(request('Bearer token'))).rejects.toMatchObject({ statusCode: 401, code: 'unauthorized' })
  })

  test.each([
    { ...activeUser, email: 'other@example.com' },
    { ...activeUser, firebaseUid: 'other-firebase-uid' },
    { ...activeUser, role: 'owner' },
  ])('defensively rejects an invalid persisted actor: %j', async (resolvedUser) => {
    const { authenticate } = harness({ resolvedUser })

    await expect(authenticate(request('Bearer token'))).rejects.toMatchObject({ statusCode: 401, code: 'unauthorized' })
  })

  test('rejects disabled users and never trusts token role claims', async () => {
    const disabled = harness({
      claims: {
        uid: 'firebase-user-1', email: 'person@example.com', email_verified: true, role: 'admin',
      },
      resolvedUser: { ...activeUser, role: 'marketer', disabledAt: new Date('2026-09-04T10:00:00Z') },
    })

    await expect(disabled.authenticate(request('Bearer token'))).rejects.toMatchObject({
      statusCode: 403,
      code: 'user_disabled',
    })
  })
})

describe('role authorization', () => {
  test('reads the current actor for every request and keeps Admin separate from Designer', async () => {
    let role = 'admin'
    const authenticate = vi.fn(async () => ({ ...activeUser, role }))
    const { requireRole } = createAuthorizer(authenticate)
    const designerOnly = requireRole('designer')
    const marketerCapability = requireRole('marketer', 'admin')

    await expect(marketerCapability({ headers: {} })).resolves.toBeUndefined()
    await expect(designerOnly({ headers: {} })).rejects.toMatchObject({ statusCode: 403, code: 'forbidden' })
    role = 'designer'
    await expect(designerOnly({ headers: {} })).resolves.toBeUndefined()
    await expect(marketerCapability({ headers: {} })).rejects.toMatchObject({ statusCode: 403, code: 'forbidden' })
    expect(authenticate).toHaveBeenCalledTimes(4)
  })

  test('preserves database actor identity for self-approval enforcement', async () => {
    const { authenticate } = harness({
      claims: {
        uid: 'firebase-user-1', email: 'person@example.com', email_verified: true, role: 'designer',
      },
      resolvedUser: { ...activeUser, role: 'admin' },
    })
    const actor = await authenticate(request('Bearer token'))
    const campaign = {
      id: 'campaign-1', status: 'ready', revision: 3,
      currentVersion: { id: 'version-1', number: 1, contentHash: 'a'.repeat(64), readyActorId: actor.id },
    }

    expect(transitionCampaign({ campaign, action: 'approve', actor })).toEqual({
      ok: false,
      code: 'self_approval_forbidden',
      status: 403,
      message: 'The person who marked this version ready cannot approve it.',
    })
  })
})

describe('production Firebase verifier lifecycle', () => {
  function firebaseSdkHarness({ existingApp } = {}) {
    const createdApp = { name: 'banner-studio-auth', options: { projectId: 'banner-project' } }
    const verifyIdToken = vi.fn(async () => ({ uid: 'verified' }))
    const sdk = {
      applicationDefault: vi.fn(() => 'application-default-credential'),
      getApp: vi.fn(() => {
        if (existingApp) return existingApp
        const error = new Error('no app')
        error.code = 'app/no-app'
        throw error
      }),
      initializeApp: vi.fn(() => createdApp),
      getAuth: vi.fn(() => ({ verifyIdToken })),
      deleteApp: vi.fn(async () => {}),
    }
    return { createdApp, sdk, verifyIdToken }
  }

  test('creates the deterministic named app for the configured project and checks revocation', async () => {
    const { createdApp, sdk, verifyIdToken } = firebaseSdkHarness()
    const verifier = createFirebaseTokenVerifier({ projectId: 'banner-project', sdk })

    await expect(verifier.verify('firebase-token')).resolves.toEqual({ uid: 'verified' })
    expect(sdk.getApp).toHaveBeenCalledWith('banner-studio-auth')
    expect(sdk.initializeApp).toHaveBeenCalledWith({
      credential: 'application-default-credential', projectId: 'banner-project',
    }, 'banner-studio-auth')
    expect(sdk.getAuth).toHaveBeenCalledWith(createdApp)
    expect(verifyIdToken).toHaveBeenCalledWith('firebase-token', true)
  })

  test('rejects a deterministic named app belonging to another project', () => {
    const { sdk } = firebaseSdkHarness({
      existingApp: { name: 'banner-studio-auth', options: { projectId: 'other-project' } },
    })

    expect(() => createFirebaseTokenVerifier({ projectId: 'banner-project', sdk }))
      .toThrow('Firebase app project does not match FIREBASE_PROJECT_ID')
    expect(sdk.getAuth).not.toHaveBeenCalled()
  })

  test('reuses only the deterministic named app for the configured project without claiming ownership', async () => {
    const existingApp = { name: 'banner-studio-auth', options: { projectId: 'banner-project' } }
    const { sdk } = firebaseSdkHarness({ existingApp })
    const verifier = createFirebaseTokenVerifier({ projectId: 'banner-project', sdk })

    await verifier.close()
    expect(sdk.getApp).toHaveBeenCalledWith('banner-studio-auth')
    expect(sdk.initializeApp).not.toHaveBeenCalled()
    expect(sdk.deleteApp).not.toHaveBeenCalled()
  })

  test('does not own or delete an explicitly injected app', async () => {
    const firebaseApp = { name: 'injected', options: { projectId: 'banner-project' } }
    const { sdk } = firebaseSdkHarness()
    const verifier = createFirebaseTokenVerifier({ firebaseApp, projectId: 'banner-project', sdk })

    await verifier.close()
    await verifier.close()
    expect(sdk.getApp).not.toHaveBeenCalled()
    expect(sdk.initializeApp).not.toHaveBeenCalled()
    expect(sdk.deleteApp).not.toHaveBeenCalled()
  })

  test('deletes only an app created by this verifier and only once', async () => {
    const { createdApp, sdk } = firebaseSdkHarness()
    const verifier = createFirebaseTokenVerifier({ projectId: 'banner-project', sdk })

    await verifier.close()
    await verifier.close()
    expect(sdk.deleteApp).toHaveBeenCalledOnce()
    expect(sdk.deleteApp).toHaveBeenCalledWith(createdApp)
  })
})
