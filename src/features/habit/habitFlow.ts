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
import type {
  CheckinInput,
  CheckinResult,
  HabitDirection,
  HabitState,
  WorkSchedule,
} from '../../engine/types'
import type { EarthStorage } from '../../storage/storage'
import type { CheckinRecord } from '../../storage/types'

/** 流程依赖：本模块只用到数据层的这些能力 */
export interface HabitDeps {
  storage: Pick<
    EarthStorage,
    'getHabit' | 'upsertHabit' | 'addCheckin' | 'listCheckins'
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
  /** 创建业务日 YYYY-MM-DD */
  createdAt: string
}

export interface CreateResult {
  habit: HabitState | null
  error: string | null
}

/** 建习惯：校验 → 构造领域对象 → 持久化 */
export function createHabit(deps: HabitDeps, input: NewHabitInput): CreateResult {
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

  const habit: HabitState = {
    id: crypto.randomUUID(),
    name,
    direction: input.direction,
    baseAmount: input.baseAmount,
    cap: input.cap,
    progressStep: 0,
    totalAmount: 0,
    consistencyDays: 0,
    formationDays: 0,
    isFormed: false,
    vacationCoins: 0,
    lastCheckinDate: null,
    createdAt: input.createdAt,
  }
  deps.storage.upsertHabit(habit)
  return { habit, error: null }
}

/** 今日计划：目标量 + 缺勤回退信息（展示用） */
export interface TodayPlan {
  target: number
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
  return { target, backoffDays, locked: habit.cap !== null }
}

/** 打卡动作参数 */
export interface CheckinAction {
  amount: number
  note: string
  /** 是否用假期币抵扣休息（默认 false） */
  restDay?: boolean
}

export interface CheckinOutcome {
  result: CheckinResult
  /** 持久化的打卡记录（rejected 时为 null） */
  record: CheckinRecord | null
}

/** 打卡：引擎判定 + 结果持久化（习惯状态 + 打卡记录） */
export function performCheckin(
  deps: HabitDeps,
  habit: HabitState,
  now: Date,
  schedule: WorkSchedule,
  action: CheckinAction,
): CheckinOutcome {
  const input: CheckinInput = {
    habit,
    now,
    schedule,
    amount: action.amount,
    note: action.note,
    restDay: action.restDay === true,
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
    note: action.note,
    restDay: result.status === 'rest-day',
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
 * 锁死上限校验：
 * - 正整数
 * - 正向习惯：cap 不得低于当日目标（锁死不使目标倒退）
 * - 反向习惯：cap 不得高于当日目标（反向锁死只能更少）
 */
export function setCap(
  deps: HabitDeps,
  habit: HabitState,
  businessDate: string,
  cap: number,
): SetCapResult {
  if (!Number.isInteger(cap) || cap < 1) {
    return { habit: null, error: '自认上限必须是大于 0 的整数' }
  }
  const target = getDailyTarget(habit, businessDate)
  if (habit.direction === 'positive' && cap < target) {
    return { habit: null, error: `正向习惯上限不能低于今日目标 ${target}` }
  }
  if (habit.direction === 'negative' && cap > target) {
    return { habit: null, error: `反向习惯上限不能高于今日目标 ${target}` }
  }
  const locked = lockCap(habit, cap)
  deps.storage.upsertHabit(locked)
  return { habit: locked, error: null }
}
