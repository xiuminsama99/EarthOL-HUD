import { afterEach, describe, expect, it, vi } from 'vitest'
import { NetworkTimeProvider, businessDateFromSource } from './timeProvider'

const DATE_HEADER = 'Tue, 25 Aug 2026 16:41:47 GMT'

function makeResponse(dateHeader: string | null): Response {
  const headers = new Headers()
  if (dateHeader !== null) headers.set('date', dateHeader)
  return new Response(null, { status: 200, headers })
}

describe('NetworkTimeProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('命中端点时返回网络时间源（解析 Date 头）', async () => {
    const fetchFn = vi.fn(async () => makeResponse(DATE_HEADER))
    const p = new NetworkTimeProvider({ endpoints: ['https://e1'], fetchFn })
    const s = await p.refresh()
    expect(s.source).toBe('network')
    expect(s.now.toUTCString()).toBe(new Date(DATE_HEADER).toUTCString())
    expect(s.endpoint).toBe('https://e1')
    expect(s.rawDateHeader).toBe(DATE_HEADER)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('首个端点失败时轮询下一个端点', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(makeResponse(DATE_HEADER))
    const p = new NetworkTimeProvider({ endpoints: ['https://e1', 'https://e2'], fetchFn })
    const s = await p.refresh()
    expect(s.source).toBe('network')
    expect(s.endpoint).toBe('https://e2')
  })

  it('无 Date 头视为失败并继续轮询', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(null))
      .mockResolvedValueOnce(makeResponse(DATE_HEADER))
    const p = new NetworkTimeProvider({ endpoints: ['https://e1', 'https://e2'], fetchFn })
    const s = await p.refresh()
    expect(s.source).toBe('network')
    expect(s.endpoint).toBe('https://e2')
  })

  it('Date 头非法视为失败', async () => {
    const fetchFn = vi.fn(async () => makeResponse('not-a-date'))
    const p = new NetworkTimeProvider({ endpoints: ['https://e1'], fetchFn })
    const s = await p.refresh()
    expect(s.source).toBe('device')
  })

  it('全部端点失败时降级设备时间', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('network down')
    })
    const p = new NetworkTimeProvider({ endpoints: ['https://e1', 'https://e2'], fetchFn })
    const s = await p.refresh()
    expect(s.source).toBe('device')
    expect(s.now).toBeInstanceOf(Date)
  })

  it('缓存有效期内 getNow 不再请求网络', async () => {
    const fetchFn = vi.fn(async () => makeResponse(DATE_HEADER))
    const p = new NetworkTimeProvider({ endpoints: ['https://e1'], fetchFn, maxAgeMs: 60_000 })
    await p.refresh()
    const s = await p.getNow()
    expect(s.source).toBe('network')
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('缓存过期后 getNow 重新请求', async () => {
    const fetchFn = vi.fn(async () => makeResponse(DATE_HEADER))
    const p = new NetworkTimeProvider({ endpoints: ['https://e1'], fetchFn, maxAgeMs: 0 })
    await p.refresh()
    await p.getNow()
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('A1：缓存有效期内但跨自然日（午夜保护）→ 强制刷新', async () => {
    vi.useFakeTimers()
    try {
      // 本地 2026-01-01 23:30 首次解析（缓存昨日的绝对时刻）
      const t1 = new Date(2026, 0, 1, 23, 30)
      vi.setSystemTime(t1)
      const fetchFn = vi.fn(async () => makeResponse(t1.toUTCString()))
      const p = new NetworkTimeProvider({ endpoints: ['https://e1'], fetchFn, maxAgeMs: 60_000 })
      const cached = await p.refresh()
      expect(cached.source).toBe('network')
      // 本地时钟推进到次日 00:10（仍在 maxAge 内，但已跨自然日）
      vi.setSystemTime(new Date(2026, 0, 2, 0, 10))
      const s = await p.getNow()
      expect(fetchFn).toHaveBeenCalledTimes(2) // 跨日 → 强制重新请求
      expect(s.source).toBe('network')
    } finally {
      vi.useRealTimers()
    }
  })

  it('A1：同一天内缓存仍生效（不跨日不刷新）', async () => {
    const fetchFn = vi.fn(async () => makeResponse(DATE_HEADER))
    const p = new NetworkTimeProvider({ endpoints: ['https://e1'], fetchFn, maxAgeMs: 60_000 })
    await p.refresh()
    await p.getNow()
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('UX-10：并行请求全部端点，取最快成功者', async () => {
    // e1 永不完成（模拟慢端点），e2 立即成功 → 并行下 e2 先到，refresh 不再等 e1
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === 'https://e1') return new Promise<Response>(() => {})
      return makeResponse(DATE_HEADER)
    })
    const p = new NetworkTimeProvider({ endpoints: ['https://e1', 'https://e2'], fetchFn })
    const s = await p.refresh()
    expect(s.endpoint).toBe('https://e2')
    expect(fetchFn).toHaveBeenCalledTimes(2) // 两个端点同时被调用（并发，非串行）
  })

  it('lastSource 同步返回最近一次解析结果', async () => {
    const fetchFn = vi.fn(async () => makeResponse(DATE_HEADER))
    const p = new NetworkTimeProvider({ endpoints: ['https://e1'], fetchFn })
    expect(p.lastSource()).toBeNull()
    await p.refresh()
    expect(p.lastSource()?.source).toBe('network')
  })
})

describe('网络时间边界判定（业务日）', () => {
  // 用本地时间构造 Date，使测试与机器时区无关
  it('白天工作者凌晨操作归属当日', () => {
    const now = new Date(2026, 7, 26, 0, 30)
    const source = { now, source: 'network' as const, fetchedAt: now }
    expect(businessDateFromSource(source, 'day')).toBe('2026-08-26')
  })

  it('夜间工作者凌晨 4:59 操作归属昨日', () => {
    const now = new Date(2026, 7, 26, 4, 59)
    const source = { now, source: 'network' as const, fetchedAt: now }
    expect(businessDateFromSource(source, 'night')).toBe('2026-08-25')
  })

  it('夜间工作者 5:00 起归属当日', () => {
    const now = new Date(2026, 7, 26, 5, 0)
    const source = { now, source: 'network' as const, fetchedAt: now }
    expect(businessDateFromSource(source, 'night')).toBe('2026-08-26')
  })

  it('设备时间降级源同样走业务日判定', () => {
    const now = new Date(2026, 7, 26, 1, 0)
    const source = { now, source: 'device' as const, fetchedAt: now }
    expect(businessDateFromSource(source, 'night')).toBe('2026-08-25')
  })
})
