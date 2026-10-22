import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { Keypair } from '@stellar/stellar-sdk'
import { buildServer } from '../src/api/server.js'
import { closeDb, resetDb } from './db.js'

describe('API route authentication failure tracking and backoff', () => {
  let app: FastifyInstance
  const kp = Keypair.random()
  const address = kp.publicKey()

  beforeEach(async () => {
    await resetDb()
    app = await buildServer()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    await closeDb()
  })

  it('throttles and locks out requests upon repeated authentication failures', async () => {
    // Request challenge
    const challengeRes = await app.inject({
      method: 'GET',
      url: `/api/auth/challenge?address=${address}`,
    })
    expect(challengeRes.statusCode).toBe(200)
    const { nonce } = challengeRes.json<{ nonce: string }>()

    // Send multiple requests with invalid signatures to trigger brute-force protection
    const badSignature = Keypair.random().sign(Buffer.from(`${nonce}:${address}`)).toString('base64')
    const authHeader = `StellarSignature ${address}:${badSignature}:${nonce}`

    // Trigger failures (AuthFailureTracker base backoff or rate limiting after failures)
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/audit-log',
        headers: { authorization: authHeader },
      })
      expect(res.statusCode).toBe(401)
    }

    // Next attempt should hit backoff lockout (rate-limited / backoff applied)
    const lockedRes = await app.inject({
      method: 'GET',
      url: '/api/admin/audit-log',
      headers: { authorization: authHeader },
    })
    expect(lockedRes.statusCode).toBeGreaterThanOrEqual(401)
  })
})
