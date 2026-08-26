/**
 * 「我的故事」时间线（工单 16 R10b-4 B）
 *
 * 让打卡语成为可回看的资产：按业务日倒序聚合全部打卡记录，顶部统计，
 * 每条含日期 / 习惯名 / 状态色 / 打卡语；当天条可编辑 note / 删除，历史只读。
 *
 * 纯逻辑：输入打卡记录 + 习惯映射 → 输出聚合时间线与可操作结果。
 * UI 薄壳只做渲染，编辑/删除走本模块（含当天守卫，防作弊体系不破坏）。
 */
import type { CheckinRecord } from '../../storage/types'
import type { EarthStorage } from '../../storage/storage'

/** 状态分类（驱动颜色与文案） */
export type StoryStatus = '达标' | '未达标' | '超额' | '休息' | '最低版本'

export interface StoryEntry {
  id: string
  habitId: string
  habitName: string
  /** 业务日 YYYY-MM-DD */
  businessDate: string
  amount: number
  targetAmount: number
  note: string
  restDay: boolean
  mode: 'normal' | 'minimal'
  status: StoryStatus
}

export interface StoryDay {
  businessDate: string
  entries: StoryEntry[]
}

export interface StoryTimeline {
  /** 倒序（最新在前）的日期分组 */
  days: StoryDay[]
  /** 有行动（非休息）的业务日数 */
  totalDays: number
  /** 总打卡次数（含休息） */
  totalCheckins: number
  /** 休息券使用次数 */
  restUses: number
}

/** 状态分类（纯函数） */
export function classifyStatus(c: CheckinRecord): StoryStatus {
  if (c.restDay) return '休息'
  if (c.mode === 'minimal') return '最低版本'
  if (c.amount > c.targetAmount) return '超额'
  if (c.amount === c.targetAmount) return '达标'
  return '未达标'
}

/** 聚合时间线（纯函数）：按业务日倒序，同日按习惯名稳定排序，只读视图 */
export function buildStoryTimeline(
  checkins: CheckinRecord[],
  habitName: (habitId: string) => string,
): StoryTimeline {
  const byDay = new Map<string, StoryEntry[]>()
  let totalDays = 0
  let totalCheckins = checkins.length
  let restUses = 0

  for (const c of checkins) {
    if (c.restDay) restUses += 1
    const entry: StoryEntry = {
      id: c.id,
      habitId: c.habitId,
      habitName: habitName(c.habitId),
      businessDate: c.businessDate,
      amount: c.amount,
      targetAmount: c.targetAmount,
      note: c.note,
      restDay: c.restDay,
      mode: c.mode,
      status: classifyStatus(c),
    }
    const list = byDay.get(c.businessDate) ?? []
    list.push(entry)
    byDay.set(c.businessDate, list)
  }

  const days = [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([businessDate, entries]) => ({
      businessDate,
      entries: entries.sort((a, b) => a.habitName.localeCompare(b.habitName, 'zh-CN')),
    }))

  // 有行动（非休息）的业务日数
  totalDays = [...byDay.keys()].length

  return { days, totalDays, totalCheckins, restUses }
}

/** 状态→颜色（UI 消费；当天达标绿/超额金/未达标红/休息灰/最低版本青） */
export const STORY_STATUS_COLOR: Record<StoryStatus, string> = {
  '达标': '#7ee0a8',
  '未达标': '#ff9a9a',
  '超额': '#ffd27a',
  '休息': '#8b8ba3',
  '最低版本': '#7cc7d9',
}

/** 依赖：本模块只用到数据层这些能力 */
export interface StoryDeps {
  storage: Pick<
    EarthStorage,
    | 'listCheckins'
    | 'listHabits'
    | 'updateCheckinNote'
    | 'removeCheckin'
  >
}

export interface EditResult {
  ok: boolean
  error: string | null
}

/** 编辑当天条记录的文字（仅当天）；历史只读。返回 ok/error。 */
export function editTodayNote(
  deps: StoryDeps,
  checkinId: string,
  businessDate: string,
  note: string,
): EditResult {
  const trimmed = note.trim()
  if (trimmed.length === 0) return { ok: false, error: '记录内容不能为空' }
  const target = deps.storage.listCheckins().find((c) => c.id === checkinId)
  if (!target) return { ok: false, error: '记录不存在' }
  if (target.businessDate !== businessDate) return { ok: false, error: '只能修改今天的记录' }
  deps.storage.updateCheckinNote(checkinId, trimmed)
  return { ok: true, error: null }
}

/** 删除当天条记录（仅当天）；历史只读。返回 ok/error。 */
export function deleteTodayCheckin(
  deps: StoryDeps,
  checkinId: string,
  businessDate: string,
): EditResult {
  const target = deps.storage.listCheckins().find((c) => c.id === checkinId)
  if (!target) return { ok: false, error: '记录不存在' }
  if (target.businessDate !== businessDate) return { ok: false, error: '只能删除今天的记录' }
  deps.storage.removeCheckin(checkinId)
  return { ok: true, error: null }
}
