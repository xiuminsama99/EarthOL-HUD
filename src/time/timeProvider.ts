/**
 * 网络时间锚点（地球online玩家控制台，工单 02）
 *
 * 「今天」的判定来自网络时间而非设备系统时间（防改设备时间作弊）。
 * 实现：fetch 候选端点读取 HTTP Date 响应头（RFC 7231 GMT 格式），
 * 逐个尝试直到命中；全部失败时降级设备时间并在结果中标记
 * （UI 显示「时间源: 设备(未验证)」）。
 *
 * 误差说明：Date 头是服务器发出响应的时刻，本地收到时已过约半个 RTT，
 * 对「业务日归属」判定（分钟级精度需求）可接受。
 */
import { resolveBusinessDate } from '../engine/engine'
import type { WorkSchedule } from '../engine/types'

export interface TimeSource {
  /** 当前时刻（网络源：解析自 Date 头；设备源：new Date()） */
  now: Date
  /** 时间来源 */
  source: 'network' | 'device'
  /** 命中的端点（网络源时存在） */
  endpoint?: string
  /** 原始 Date 响应头（网络源时存在） */
  rawDateHeader?: string
  /** 本次解析时刻（本地时钟，用于缓存过期判定） */
  fetchedAt: Date
}

export interface TimeProvider {
  /** 获取时间源；缓存有效期内直接返回缓存，否则触发网络解析 */
  getNow(): Promise<TimeSource>
  /** 强制刷新（忽略缓存） */
  refresh(): Promise<TimeSource>
  /** 最近一次解析结果（同步读取） */
  lastSource(): TimeSource | null
}

/** 默认候选端点（2026-08 实测可达且返回 Date 头，含海外兜底） */
export const DEFAULT_TIME_ENDPOINTS: readonly string[] = [
  'https://registry.npmmirror.com',
  'https://www.baidu.com',
  'https://timeapi.io/api/Time/current/zone?timeZone=UTC',
  'https://api.github.com',
]

export interface NetworkTimeProviderOptions {
  endpoints?: readonly string[]
  /** 单端点请求超时（毫秒） */
  requestTimeoutMs?: number
  /** 缓存有效期（毫秒） */
  maxAgeMs?: number
  /** 测试注入用 fetch 实现 */
  fetchFn?: typeof fetch
}

export class NetworkTimeProvider implements TimeProvider {
  private readonly endpoints: readonly string[]
  private readonly requestTimeoutMs: number
  private readonly maxAgeMs: number
  private readonly fetchFn: typeof fetch
  private last: TimeSource | null = null

  constructor(options: NetworkTimeProviderOptions = {}) {
    this.endpoints = options.endpoints ?? DEFAULT_TIME_ENDPOINTS
    this.requestTimeoutMs = options.requestTimeoutMs ?? 3000
    this.maxAgeMs = options.maxAgeMs ?? 5 * 60_000
    this.fetchFn = options.fetchFn ?? fetch
  }

  async getNow(): Promise<TimeSource> {
    const cached = this.last
    if (
      cached &&
      Date.now() - cached.fetchedAt.getTime() < this.maxAgeMs &&
      // 跨自然日保护（A1 修复）：缓存仍在有效期内但缓存时间与当前本地时刻
      // 不在同一天（如页面跨午夜挂机），强制重新请求网络时间
      sameLocalDate(cached.now, new Date())
    ) {
      return cached
    }
    return this.refresh()
  }

  async refresh(): Promise<TimeSource> {
    // UX-10：并行请求全部端点，取最快成功者（弱网首屏不再串行最长 12s）
    const attempts = this.endpoints.map(async (endpoint) => {
      const source = await this.tryEndpoint(endpoint)
      if (!source) throw new Error(`no time from ${endpoint}`)
      return source
    })
    try {
      const source = await Promise.any(attempts)
      this.last = source
      return source
    } catch {
      const source: TimeSource = {
        now: new Date(),
        source: 'device',
        fetchedAt: new Date(),
      }
      this.last = source
      return source
    }
  }

  lastSource(): TimeSource | null {
    return this.last
  }

  private async tryEndpoint(endpoint: string): Promise<TimeSource | null> {
    try {
      const response = await this.fetchFn(endpoint, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      })
      const raw = response.headers.get('date')
      if (!raw) return null
      const parsed = new Date(raw)
      if (Number.isNaN(parsed.getTime())) return null
      return {
        now: parsed,
        source: 'network',
        endpoint,
        rawDateHeader: raw,
        fetchedAt: new Date(),
      }
    } catch {
      return null
    }
  }
}

/** 两个时刻在本地时区是否同一天（YYYY-MM-DD 比较） */
function sameLocalDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** 便捷：用注入时间源与作息类型解析业务日（边界规则见引擎 resolveBusinessDate） */
export function businessDateFromSource(source: TimeSource, schedule: WorkSchedule): string {
  return resolveBusinessDate(source.now, schedule)
}

/** 应用级单例 */
export const timeProvider: TimeProvider = new NetworkTimeProvider()
