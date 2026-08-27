/**
 * 习惯打卡流程逻辑（工单 05）
 *
 * 领域规则判定全部委托给微习惯引擎（唯一测试接缝），本模块只负责
 * 三件事：输入校验、引擎调用、持久化编排。UI 组件不承载任何领域规则。
 *
 * 依赖注入：storage 与时间参数由调用方传入，测试注入 Map backend 的
 * EarthStorage 与固定时间即可覆盖完整流程（建习惯 → 打卡 → 锁死 → 超额）。
 */
import { checkIn, getDailyTarget, lockCap, resolveBusinessDate } from '../../engine/engine'

// 文案构建层已拆到 ./habitCopy（R13 P6）；以下桶重导出保证既有 import / 测试符号不变
export * from './habitCopy'
import type {
  CheckinInput,
  CheckinResult,
  HabitDirection,
  HabitState,
  WorkSchedule,
} from '../../engine/types'
import type { EarthStorage } from '../../storage/storage'
import type { CheckinRecord, PlayerProfile } from '../../storage/types'

/** 流程依赖：本模块只用到数据层的这些能力 */
export interface HabitDeps {
  storage: Pick<
    EarthStorage,
    | 'getHabit'
    | 'upsertHabit'
    | 'addCheckin'
    | 'listCheckins'
    | 'getProfile'
    | 'removeHabit'
    | 'updateProfile'
    | 'listHabits'
  >
}

/** 新习惯输入 */
export interface NewHabitInput {
  name: string
  direction: HabitDirection
  /** 起始基准（正整数） */
  baseAmount: number
  /** 可选自认上限：非 null 即创建即锁死 */
  cap: number | null
  /** 计量单位（R5，默认「次」；仅展示用，引擎规则不读） */
  unit?: string
  /** 创建业务日 YYYY-MM-DD */
  createdAt: string
}

export interface CreateResult {
  habit: HabitState | null
  error: string | null
}

/** 业务日格式 YYYY-MM-DD（createHabit 防御校验用） */
const BUSINESS_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** 最多习惯数：1 主线 + 2 支线（工单 14 破除单习惯限制） */
export const MAX_HABITS = 3

/** 是否已达容量上限（UI 隐藏「再加一个」入口 + flow 层兜底拦截） */
export function isAtHabitCapacity(deps: HabitDeps): boolean {
  return deps.storage.listHabits().length >= MAX_HABITS
}

/** 建习惯：校验 → 构造领域对象 → 持久化 */
export function createHabit(deps: HabitDeps, input: NewHabitInput): CreateResult {
  // 工单 14：容量上限（1 主线 + 2 支线），超限拒绝并说明
  if (isAtHabitCapacity(deps)) {
    return {
      habit: null,
      error: `最多建立 ${MAX_HABITS} 个习惯（1 个主线 + 2 个支线）`,
    }
  }
  const name = input.name.trim()
  if (name.length === 0) return { habit: null, error: '习惯名称不能为空' }
  if (name.length > 40) return { habit: null, error: '习惯名称最长 40 字' }
  if (!Number.isInteger(input.baseAmount) || input.baseAmount < 1) {
    return { habit: null, error: '起始基准必须是大于 0 的整数' }
  }
  if (input.baseAmount > 1_000_000) {
    return { habit: null, error: '起始基准过大（上限 100 万）' }
  }
  if (input.cap !== null && (!Number.isInteger(input.cap) || input.cap < 1)) {
    return { habit: null, error: '自认上限必须是大于 0 的整数' }
  }
  if (input.cap !== null && input.cap > 1_000_000) {
    return { habit: null, error: '自认上限过大（上限 100 万）' }
  }
  // 防御：业务日未解析（非法 createdAt）时拒绝，避免脏数据（A3）
  if (!BUSINESS_DATE_RE.test(input.createdAt)) {
    return { habit: null, error: '时间尚未解析完成，请稍后再试' }
  }
  const unit = (input.unit ?? '次').trim()
  if (unit.length === 0) {
    return { habit: null, error: '计量单位不能为空' }
  }
  if (unit.length > 10) {
    return { habit: null, error: '计量单位最长 10 字' }
  }

  const habit: HabitState = {
    id: crypto.randomUUID(),
    name,
    direction: input.direction,
    baseAmount: input.baseAmount,
    unit,
    cap: input.cap,
    progressStep: 0,
    totalAmount: 0,
    consistencyDays: 0,
    formationDateList: [],
    formationDays: 0,
    isFormed: false,
    vacationCoins: 0,
    streakDays: 0,
    lastCheckinDate: null,
    actionCount: 0,
    createdAt: input.createdAt,
  }
  deps.storage.upsertHabit(habit)
  return { habit, error: null }
}



/** UX-7：戒除类习惯目标触底 0（已完成判定，UI 展示完成态用） */
export function isZeroTarget(habit: HabitState, businessDate: string): boolean {
  return habit.direction === 'negative' && getDailyTarget(habit, businessDate) === 0
}

/**
 * 今日计划：目标量 + 明日目标 + 缺勤回退信息（展示用）
 *
 * BUG-3（诚实预告）：明日目标 = 打卡后将要面对的真实值。缺勤回归日，回退折扣只在归来日
 * 当天生效，一旦打卡（lastCheckinDate 更新为今日）明日不再视为缺勤，目标会回弹到
 * 无缺勤位置。因此明日目标 = getDailyTarget(打卡后习惯, 明日)，而非今日目标 ± 1，
 * 避免「预告 6、实际 11」的跳崖式谎言。
 */
export interface TodayPlan {
  target: number
  /** 明日目标量（真实值：打卡后将面对的量；反向触底时为 0，不会出现负数——A2 修复） */
  tomorrowTarget: number
  /** 缺勤回退天数（0 = 无回退） */
  backoffDays: number
  /** 是否已锁死（cap 非 null） */
  locked: boolean
}

export function planToday(habit: HabitState, businessDate: string): TodayPlan {
  const target = getDailyTarget(habit, businessDate)
  let backoffDays = 0
  if (habit.cap === null) {
    // 无缺勤时应有的目标（进度未回退的位置）
    const noMissTarget =
      habit.direction === 'positive'
        ? habit.baseAmount + habit.progressStep
        : Math.max(0, habit.baseAmount - habit.progressStep)
    backoffDays = Math.max(0, noMissTarget - target)
  }
  // BUG-3：模拟「今天已打卡（达标）+ 明日不再缺勤」后的真实明日目标
  const postCheckin: HabitState = {
    ...habit,
    // 打卡后进度推进一步（未锁死）；锁死恒 cap
    progressStep: habit.cap === null ? habit.progressStep + 1 : habit.progressStep,
    lastCheckinDate: businessDate,
  }
  const tomorrow = businessDelta(businessDate, 1)
  const tomorrowTarget =
    habit.cap !== null
      ? habit.cap
      : getDailyTarget(postCheckin, tomorrow)
  return { target, tomorrowTarget, backoffDays, locked: habit.cap !== null }
}

/** 业务日 YYYY-MM-DD 加减 N 天（仅日历运算，纯字符串；heatmapFlow 同口径） */
function businessDelta(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + delta, 12))
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${dt.getUTCFullYear()}-${mm}-${dd}`
}

/** 打卡动作参数 */
export interface CheckinAction {
  amount: number
  /** 一句话记录：不传（undefined）则引擎基于身份自动生成；传空串仍被引擎拒绝 */
  note?: string
  /** 是否用假期币抵扣休息（默认 false） */
  restDay?: boolean
  /** 打卡模式（R4）：normal 默认 / minimal 最低版本保底 / quit-maintain 戒除完成态继续坚持 */
  mode?: 'normal' | 'minimal' | 'quit-maintain'
}

export interface CheckinOutcome {
  result: CheckinResult
  /** 持久化的打卡记录（rejected 时为 null） */
  record: CheckinRecord | null
}

/** 同一设备自然日判定（B1 防刷卡用；防御逻辑以设备时钟粗判） */
function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** B1：当日已切换作息类型（设备自然日与 now 相同）→ 禁止再次打卡 */
function switchedScheduleToday(profile: PlayerProfile | null, now: Date): boolean {
  if (profile === null || profile.lastScheduleSwitchAt === null) return false
  const switched = new Date(profile.lastScheduleSwitchAt)
  return !Number.isNaN(switched.getTime()) && sameLocalDay(switched, now)
}

/** 打卡：引擎判定 + 结果持久化（习惯状态 + 打卡记录） */
export function performCheckin(
  deps: HabitDeps,
  habit: HabitState,
  now: Date,
  schedule: WorkSchedule,
  action: CheckinAction,
): CheckinOutcome {
  const profile = deps.storage.getProfile()
  const identity = profile?.identityStatement ?? null

  // B1 前置校验：当日已切换作息 → 拒绝（防"切昼夜刷卡"多打一天）
  if (switchedScheduleToday(profile, now)) {
    const rejected: CheckinResult = {
      status: 'rejected',
      reason: 'schedule-switched-today',
      mode: action.mode ?? 'normal',
      note: '',
      habit,
      targetAmount: 0,
      completedAmount: 0,
      overAmount: 0,
      vacationCoinsDelta: 0,
      formed: habit.isFormed,
    }
    return { result: rejected, record: null }
  }

  const input: CheckinInput = {
    habit,
    now,
    schedule,
    amount: action.amount,
    note: action.note,
    identity,
    restDay: action.restDay === true,
    mode: action.mode ?? 'normal',
  }
  const result = checkIn(input)
  if (result.status === 'rejected') {
    return { result, record: null }
  }

  deps.storage.upsertHabit(result.habit)
  const record: CheckinRecord = {
    id: crypto.randomUUID(),
    habitId: habit.id,
    businessDate: resolveBusinessDate(now, schedule),
    amount: result.completedAmount,
    targetAmount: result.targetAmount,
    note: result.note,
    restDay: result.status === 'rest-day',
    mode: result.mode,
    habitBefore: habit,
    createdAt: new Date().toISOString(),
  }
  deps.storage.addCheckin(record)
  return { result, record }
}



/** 锁死：定死自认上限（动态调节条落地动作） */
export interface SetCapResult {
  habit: HabitState | null
  error: string | null
}

/**
 * 锁死 / 调整上限（动态调节条落地动作）。
 *
 * 可调锁死（2026-08 产品反馈）：设定后不再随天数自动变化，但用户可随时调高/调低。
 * 约束（相对基准，与引擎规则 3 配套）：
 * - 正向习惯：新 cap ≥ 基准（不许调到基准以下，=基准即回到起点档）
 * - 反向习惯：新 cap ≤ 基准（不许调到基准以上，=基准即回到起点档）
 * 调整只改 cap 字段，不影响已积累的养成值 / 总量。
 */
export function setCap(
  deps: HabitDeps,
  habit: HabitState,
  cap: number,
): SetCapResult {
  if (!Number.isInteger(cap) || cap < 1) {
    return { habit: null, error: '自认上限必须是大于 0 的整数' }
  }
  if (cap > 1_000_000) {
    return { habit: null, error: '自认上限过大（上限 100 万）' }
  }
  if (habit.direction === 'positive' && cap < habit.baseAmount) {
    return { habit: null, error: `正向习惯上限不能低于起始基准 ${habit.baseAmount}` }
  }
  if (habit.direction === 'negative' && cap > habit.baseAmount) {
    return { habit: null, error: `反向习惯上限不能高于起始基准 ${habit.baseAmount}` }
  }
  const locked = lockCap(habit, cap)
  deps.storage.upsertHabit(locked)
  return { habit: locked, error: null }
}

/** 删除习惯（B6）：仅删习惯本身，关联打卡记录保留（统计口径不变） */
export function deleteHabit(deps: HabitDeps, habitId: string): { ok: boolean; error: string | null } {
  const existing = deps.storage.getHabit(habitId)
  if (!existing) return { ok: false, error: '习惯不存在' }
  deps.storage.removeHabit(habitId)
  return { ok: true, error: null }
}

/** 改名（B6）：仅改 name 字段，引擎规则不读名称 */
export function renameHabit(
  deps: HabitDeps,
  habitId: string,
  newName: string,
): { habit: HabitState | null; error: string | null } {
  const name = newName.trim()
  if (name.length === 0) return { habit: null, error: '习惯名称不能为空' }
  if (name.length > 40) return { habit: null, error: '习惯名称最长 40 字' }
  const existing = deps.storage.getHabit(habitId)
  if (!existing) return { habit: null, error: '习惯不存在' }
  const renamed: HabitState = { ...existing, name }
  deps.storage.upsertHabit(renamed)
  return { habit: renamed, error: null }
}

/**
 * 切换作息类型（N3：主界面与诊断面板共用，防 B1 守卫被绕过）。
 * 写入新作息 + 切换时刻（lastScheduleSwitchAt），切换当天禁止再次打卡。
 * window.confirm 由调用方负责；本函数只做持久化与返回新值。
 * @param switchedAt 切换时刻（ISO，默认取当前时刻；测试注入固定时间用）
 */
export function switchSchedule(
  deps: HabitDeps,
  current: WorkSchedule,
  switchedAt = new Date().toISOString(),
): { next: WorkSchedule } {
  const next: WorkSchedule = current === 'day' ? 'night' : 'day'
  deps.storage.updateProfile({
    schedule: next,
    lastScheduleSwitchAt: switchedAt,
  })
  return { next }
}
