import { randomUUID } from 'node:crypto'
import Fastify from 'fastify'

const safeRequestId = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

function requestIdFrom(request) {
  const inboundId = request.headers['x-request-id']
  if (typeof inboundId === 'string' && safeRequestId.test(inboundId)) {
    return inboundId
  }

  return randomUUID()
}

function errorEnvelope(code, message, requestId, details) {
  return {
    code,
    message,
    ...(details === undefined ? {} : { details }),
    requestId,
  }
}

export function buildApp({ readiness = async () => true } = {}) {
  const app = Fastify({
    logger: false,
    requestIdHeader: false,
    genReqId: requestIdFrom,
  })

  app.addHook('onSend', (request, reply, payload, done) => {
    reply.header('x-request-id', request.id)
    done(null, payload)
  })

  app.addHook('preSerialization', (request, _reply, payload, done) => {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      done(null, { ...payload, requestId: request.id })
      return
    }

    done(null, payload)
  })

  app.get('/healthz', async () => ({ status: 'ok' }))

  app.get('/readyz', async (request, reply) => {
    if (await readiness()) return { status: 'ready' }

    return reply.code(503).send(errorEnvelope(
      'DEPENDENCY_UNAVAILABLE',
      'Dependencies are not ready',
      request.id,
    ))
  })

  app.setNotFoundHandler((request, reply) => reply.code(404).send(errorEnvelope(
    'NOT_FOUND',
    'Route not found',
    request.id,
  )))

  app.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode >= 400 && error.statusCode < 600
      ? error.statusCode
      : 500

    reply.code(statusCode).send(errorEnvelope(
      statusCode === 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
      statusCode === 500 ? 'An unexpected error occurred' : 'Request could not be processed',
      request.id,
    ))
  })

  return app
}
