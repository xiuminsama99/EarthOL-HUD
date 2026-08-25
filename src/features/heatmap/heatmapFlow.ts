/**
 * 身份一致性曲线（工单 R3）
 *
 * 「连续天数会撒谎，身份一致性不会」的落地：以业务日为格的 GitHub 风格
 * 热力图，展示最近 12 周里「有多少天以新身份行动」。与连续打卡天数（streak）
 * 无关——断签不影响格子，以身份行动过就有颜色。
 *
 * 纯函数：只消费打卡记录与注入的业务日（YYYY-MM-DD，与 CheckinRecord 同口径，
 * 来源为引擎 resolveBusinessDate，固定 Asia/Shanghai）。不依赖 UI / 存储 / 时钟。
 *
 * 强度分档（level 0-4）：
 * - 0  未行动（当日无任何记录）
 * - 1  行动但未达标 / 缺勤归来达标 / 最低版本保底（R4：minimal 记行动但未达标，
 *       与缺勤归来同档——「恢复/保底」而非「稳定身份」）
 * - 2  达标（完成量 === 当日目标量）
 * - 3  超额（完成量 > 当日目标量）
 * - 4  休息日（假期币抵扣，特殊标记）
 * - 未来日：level 0 + isFuture 标记（UI 淡化）
 */
import type { CheckinRecord } from '../../storage/types'

/** 强度档位（0-4） */
export type HeatmapLevel = 0 | 1 | 2 | 3 | 4

/** 单日格子 */
export interface HeatmapCell {
  /** 业务日 YYYY-MM-DD */
  date: string
  /** 强度档位（0-4；未来日为 0） */
  level: HeatmapLevel
  /** 是否行动日（非休息日的打卡日） */
  isAction: boolean
  /** 是否休息日（假期币抵扣） */
  isRest: boolean
  /** 是否未来（晚于注入的今日） */
  isFuture: boolean
}

/** 默认窗口：最近 12 周 */
export const HEATMAP_DEFAULT_WEEKS = 12

/** 休息日档位常量（UI 与测试复用） */
export const HEATMAP_LEVEL_REST: HeatmapLevel = 4

const DAY_MS = 86_400_000

function parseKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split('-').map(Number)
  return { y, m, d }
}

function toKey(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** 业务日加减天数（YYYY-MM-DD，UTC 纯算数，与时区无关） */
export function addDays(key: string, n: number): string {
  const { y, m, d } = parseKey(key)
  const t = Date.UTC(y, m - 1, d) + n * DAY_MS
  const dt = new Date(t)
  return toKey(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
}

/** 两个业务日之间的日历日差（b - a） */
export function dateDiff(a: string, b: string): number {
  const { y: ay, m: am, d: ad } = parseKey(a)
  const { y: by, m: bm, d: bd } = parseKey(b)
  const ta = Date.UTC(ay, am - 1, ad)
  const tb = Date.UTC(by, bm - 1, bd)
  return Math.round((tb - ta) / DAY_MS)
}

/** 业务日是周几（0=周日 … 6=周六；YYYY-MM-DD 解析为 UTC 午夜，无时区歧义） */
function dayOfWeek(key: string): number {
  const { y, m, d } = parseKey(key)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** 单日记录：按业务日分组（同日期多条取 createdAt 最新一条，防御性） */
function groupByDate(checkins: CheckinRecord[]): Map<string, CheckinRecord> {
  const map = new Map<string, CheckinRecord>()
  for (const rec of checkins) {
    const prev = map.get(rec.businessDate)
    if (!prev || rec.createdAt > prev.createdAt) {
      map.set(rec.businessDate, rec)
    }
  }
  return map
}

/** 判定「缺勤归来」：该行动日之前最近一次行动日间隔 > 1 天（与引擎 missedDays 同口径） */
function isBackoffDay(actions: CheckinRecord[]): Set<string> {
  const backoff = new Set<string>()
  const sorted = [...actions].sort((a, b) => a.businessDate.localeCompare(b.businessDate))
  for (let i = 0; i < sorted.length; i += 1) {
    if (i > 0 && dateDiff(sorted[i - 1].businessDate, sorted[i].businessDate) > 1) {
      backoff.add(sorted[i].businessDate)
    }
  }
  return backoff
}

/**
 * 计算热力图格子。
 *
 * @param checkins 全部打卡记录（引擎保证一天一条，本函数对同日多条做防御去重）
 * @param today    注入的业务日 YYYY-MM-DD（决定窗口与「未来」标记，纯输入）
 * @param weeks    窗口周数（默认 12，末周必包含 today）
 */
export function computeHeatmap(
  checkins: CheckinRecord[],
  today: string,
  weeks: number = HEATMAP_DEFAULT_WEEKS,
): HeatmapCell[] {
  const byDate = groupByDate(checkins)
  const actions = [...byDate.values()].filter((r) => !r.restDay)
  const backoffDays = isBackoffDay(actions)

  // 窗口：today 所在自然周（周一 00:00 前 6 天算到周日），再往前 weeks-1 个完整周
  const dow = dayOfWeek(today) // 0=周日 … 6=周六
  const toSunday = dow === 0 ? 0 : 7 - dow
  const windowEnd = addDays(today, toSunday)
  const windowStart = addDays(windowEnd, -(weeks * 7 - 1))

  const cells: HeatmapCell[] = []
  for (let i = 0; i < weeks * 7; i += 1) {
    const date = addDays(windowStart, i)
    const rec = byDate.get(date)
    const isFuture = date > today
    let level: HeatmapLevel = 0
    if (rec && !isFuture) {
      if (rec.restDay) {
        level = HEATMAP_LEVEL_REST
      } else if (rec.mode === 'minimal') {
        // R4：最低版本保底——记行动但目标未达成，与缺勤归来同档（1 档）
        level = 1
      } else if (rec.amount > rec.targetAmount) {
        level = 3
      } else if (rec.amount === rec.targetAmount) {
        level = backoffDays.has(date) ? 1 : 2
      } else {
        level = 1
      }
    }
    cells.push({
      date,
      level,
      isAction: rec !== undefined && !rec.restDay && !isFuture,
      isRest: rec !== undefined && rec.restDay && !isFuture,
      isFuture,
    })
  }
  return cells
}
