import { describe, expect, it, vi } from 'vitest'
import { getEvents, getLedgers } from '../src/stellar/rpc.js'
import { server } from '../src/stellar/rpc.js'

vi.mock('@stellar/stellar-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@stellar/stellar-sdk')>()
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      Server: class {
        getEvents = vi.fn()
        getLedgers = vi.fn()
        getLatestLedger = vi.fn()
      },
    },
  }
  })

describe('Stellar RPC rate limit retry wrapper', () => {
  it('retries getEvents on HTTP 429 and succeeds eventually', async () => {
    const mockGetEvents = vi.mocked(server.getEvents)
    mockGetEvents
      .mockRejectedValueOnce({ code: 429, message: 'rate limit exceeded' })
      .mockRejectedValueOnce({ status: 429, message: 'rate limit exceeded' })
      .mockResolvedValueOnce({ events: [], cursor: 'tok' } as any)

    const res = await getEvents({ startLedger: 1 } as any)
    expect(res).toEqual({ events: [], cursor: 'tok' })
    expect(mockGetEvents).toHaveBeenCalledTimes(3)
  })

  it('retries getLedgers on 429 error message and succeeds eventually', async () => {
    const mockGetLedgers = vi.mocked(server.getLedgers)
    mockGetLedgers
      .mockRejectedValueOnce(new Error('HTTP 429 Rate Limit'))
      .mockResolvedValueOnce({ ledgers: [] } as any)

    const res = await getLedgers({ startLedger: 1 } as any)
    expect(res).toEqual({ ledgers: [] })
    expect(mockGetLedgers).toHaveBeenCalledTimes(2)
  })
})
