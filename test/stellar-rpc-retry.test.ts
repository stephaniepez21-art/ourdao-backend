import { describe, expect, it, vi, beforeEach } from 'vitest'
import { rpc } from '@stellar/stellar-sdk'
import { getEvents, getLedgers, server } from '../src/stellar/rpc.js'

vi.mock('@stellar/stellar-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@stellar/stellar-sdk')>()
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      Server: class {
        getEvents = vi.fn()
        getLedgers = vi.fn()
      },
      getEvents: vi.fn(),
      getLedgers: vi.fn(),
    },
  }
  })

describe('stellar rpc rate limit retry for getEvents and getLedgers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retries getEvents on 429 error and succeeds eventually', async () => {
    const mockGetEvents = vi.mocked(server.getEvents)
    const rateLimitError = Object.assign(new Error('rate limit exceeded'), { code: 429 })
    mockGetEvents
      .mockRejectedValueOnce(rateLimitError)
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce({ events: [], cursor: 'tok' } as unknown as rpc.Api.GetEventsResponse)

    const res = await getEvents({ startLedger: 1, filters: [{ type: 'contract', contractIds: ['C123'], topics: [] }] })
    expect(res.cursor).toBe('tok')
    expect(mockGetEvents).toHaveBeenCalledTimes(3)
  })

  it('retries getLedgers on 429 error and succeeds eventually', async () => {
    const mockGetLedgers = vi.mocked(server.getLedgers)
    const rateLimitError = Object.assign(new Error('429 Too Many Requests'), { status: 429 })
    mockGetLedgers
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce({ ledgers: [{ hash: 'abc' }] } as unknown as rpc.Api.GetLedgersResponse)

    const res = await getLedgers({ startLedger: 1, pagination: { limit: 1 } })
    expect(res.ledgers[0]?.hash).toBe('abc')
    expect(mockGetLedgers).toHaveBeenCalledTimes(2)
  })

  it('throws after exceeding max retries on rate limit', async () => {
    const mockGetEvents = vi.mocked(server.getEvents)
    const rateLimitError = Object.assign(new Error('rate limit exceeded'), { code: 429 })
    mockGetEvents.mockRejectedValue(rateLimitError)

    await expect(getEvents({ startLedger: 1, filters: [{ type: 'contract', contractIds: ['C123'], topics: [] }] })).rejects.toThrow('rate limit exceeded')
    expect(mockGetEvents).toHaveBeenCalledTimes(6)
  })
})
