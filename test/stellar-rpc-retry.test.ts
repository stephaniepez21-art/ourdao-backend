import { describe, expect, it, vi, beforeEach } from 'vitest'
import { getEvents, getLedgers } from '../src/stellar/rpc.js'
import { rpc } from '@stellar/stellar-sdk'

vi.mock('../src/stellar/rpc.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/stellar/rpc.js')>()
  return {
    ...actual,
    server: {
      ...actual.server,
      getEvents: vi.fn(),
      getLedgers: vi.fn(),
    },
  }
  })

import { server } from '../src/stellar/rpc.js'

describe('stellar rpc rate limit retry for getEvents and getLedgers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retries getEvents on HTTP 429 and succeeds', async () => {
    const rateLimitError = new Error('rate limit exceeded')
    Object.assign(rateLimitError, { code: 429 })

    vi.mocked(server.getEvents)
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce({ events: [], cursor: 'tok' } as unknown as rpc.Api.GetEventsResponse)

    const res = await getEvents({ startLedger: 1, filters: [] } as unknown as rpc.Api.GetEventsRequest)
    expect(res.cursor).toBe('tok')
    expect(server.getEvents).toHaveBeenCalledTimes(2)
  })

  it('retries getLedgers on HTTP 429 and succeeds', async () => {
    const rateLimitError = new Error('429 Too Many Requests')

    vi.mocked(server.getLedgers)
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce({ ledgers: [{ hash: 'HASH' }] } as unknown as rpc.Api.GetLedgersResponse)

    const res = await getLedgers(100, 5)
    expect(res.ledgers[0]?.hash).toBe('HASH')
    expect(server.getLedgers).toHaveBeenCalledTimes(2)
  })

  it('throws after exceeding max retries on rate limit', async () => {
    const rateLimitError = new Error('rate limit exceeded')
    Object.assign(rateLimitError, { status: 429 })

    vi.mocked(server.getEvents).mockRejectedValue(rateLimitError)

    await expect(getEvents({ startLedger: 1, filters: [] } as unknown as rpc.Api.GetEventsRequest)).rejects.toThrow(/rate limit/)
    expect(server.getEvents).toHaveBeenCalledTimes(6)
  })
})
