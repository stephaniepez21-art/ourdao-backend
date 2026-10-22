import { describe, expect, it, vi } from 'vitest'
import { getEvents, getLedgers } from '../src/stellar/rpc.js'

const serverGetEventsMock = vi.fn()
const serverGetLedgersMock = vi.fn()

vi.mock('../src/stellar/rpc.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/stellar/rpc.js')>()
  return {
    ...actual,
    getEvents: (...args: unknown[]) => serverGetEventsMock(...(args as [unknown])),
    getLedgers: (...args: unknown[]) => serverGetLedgersMock(...(args as [unknown])),
    server: {
      ...actual.server,
      getEvents: (...args: unknown[]) => serverGetEventsMock(...(args as [unknown])),
      getLedgers: (...args: unknown[]) => serverGetLedgersMock(...(args as [unknown])),
    },
  }
  })

describe('stellar rpc rate limit retry (issue #268 / getEvents & getLedgers)', () => {
  it('retries getEvents on 429 rate limit error and succeeds eventually', async () => {
    serverGetEventsMock
      .mockRejectedValueOnce({ code: 429, message: 'rate limit exceeded' })
      .mockResolvedValueOnce({ events: [], cursor: 'tok' })

    const res = await getEvents({ filters: [{ type: 'contract', contractIds: ['C123'], topics: [] }], startLedger: 1 })
    expect(res).toEqual({ events: [], cursor: 'tok' })
    expect(serverGetEventsMock).toHaveBeenCalledTimes(2)
  })

  it('retries getLedgers on 429 rate limit error and succeeds eventually', async () => {
    serverGetLedgersMock
      .mockRejectedValueOnce(new Error('HTTP 429 rate limit'))
      .mockResolvedValueOnce({ ledgers: [] })

    const res = await getLedgers(1, 10)
    expect(res).toEqual({ ledgers: [] })
    expect(serverGetLedgersMock).toHaveBeenCalledTimes(2)
  })

  it('throws after exhausting maxRetries on getEvents 429 errors', async () => {
    serverGetEventsMock.mockRejectedValue({ code: 429, message: 'rate limit exceeded' })

    await expect(getEvents({ filters: [{ type: 'contract', contractIds: ['C123'], topics: [] }], startLedger: 1 })).rejects.toThrow(/rate limit/)
    expect(serverGetEventsMock).toHaveBeenCalledTimes(6) // initial + 5 retries
  })

  it('throws after exhausting maxRetries on getLedgers 429 errors', async () => {
    serverGetLedgersMock.mockRejectedValue(new Error('HTTP 429 rate limit'))

    await expect(getLedgers(1, 10)).rejects.toThrow(/429/)
    expect(serverGetLedgersMock).toHaveBeenCalledTimes(6)
  })
})
