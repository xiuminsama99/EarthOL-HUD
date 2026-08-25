/**
 * 微习惯引擎（地球online玩家控制台）
 *
 * 整个产品的领域大脑与唯一测试接缝。纯逻辑模块：
 * - 不依赖 UI / 数据库 / 网络 / 设备时间
 * - 所有时间输入由调用方注入（now: Date + schedule: WorkSchedule）
 * - 全部状态以不可变方式返回新对象
 *
 * 规则来源：.scratch/earthol-hud/issues/01-habit-engine.md（11 条）
 */
import type {
  CheckinInput,
  CheckinResult,
  HabitDirection,
  HabitState,
  WorkSchedule,
} from './types'

/** 养成所需连续达标天数 */
export const FORMED_DAYS = 21

/**
 * 夜间工作者的业务日边界小时：凌晨 0:00-4:59 的操作归属昨日，
 * 5:00 起归属当日。白天工作者任何时刻归属当日。
 */
export const NIGHT_DAY_START_HOUR = 5

const DAY_MS = 86_400_000

/** 超额警告文案（产品口径：不建议，离目标更远） */
const OVERACHIEVEMENT_MESSAGE = '不建议，离目标更远'

function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 两个 YYYY-MM-DD 业务日之间的日历日差（b - a） */
function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  const ta = Date.UTC(ay, am - 1, ad)
  const tb = Date.UTC(by, bm - 1, bd)
  return Math.round((tb - ta) / DAY_MS)
}

/**
 * 规则 10：作息类型决定「今天」的业务日边界。
 * 注入 now + 作息类型 → 返回业务日 YYYY-MM-DD。
 */
export function resolveBusinessDate(now: Date, schedule: WorkSchedule): string {
  if (schedule === 'day') return toDateKey(now)
  if (now.getHours() < NIGHT_DAY_START_HOUR) {
    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    return toDateKey(yesterday)
  }
  return toDateKey(now)
}

/**
 * 规则 4 支撑：连续未打卡天数。
 * 上次打卡日与业务日间隔 > 1 天即为缺勤（差 - 1）。
 */
export function missedDays(habit: HabitState, businessDate: string): number {
  if (habit.lastCheckinDate === null) return 0
  const gap = daysBetween(habit.lastCheckinDate, businessDate)
  return Math.max(0, gap - 1)
}

/**
 * 规则 1/2/3/4：当日目标量。
 * - 正向：第 N 天目标 = 基准 + N（未锁死）
 * - 反向：第 N 天目标 = 基准 - N，不低于 0
 * - 锁死（cap 非 null）：恒等于 cap
 * - 缺勤归来回退 N 步，且永不越过起点（step 不低于 0）
 */
export function getDailyTarget(habit: HabitState, businessDate: string): number {
  if (habit.cap !== null) return habit.cap
  const step = Math.max(0, habit.progressStep - missedDays(habit, businessDate))
  if (habit.direction === 'positive') return habit.baseAmount + step
  return Math.max(0, habit.baseAmount - step)
}

/**
 * 规则 9 支撑：打卡必须附带一句话记录。
 */
function hasNote(note: string): boolean {
  return note.trim().length > 0
}

/**
 * 打卡动作（原子）：校验 → 休息日分支 → 状态推进。
 *
 * 规则 5：完成量超出目标 → 超额警告 + 超额量累计为假期币
 * 规则 6：假期币抵扣休息日，抵扣日不计缺勤、不触发动态扣减
 * 规则 7：总量与养成值分离（突击只涨总量，达标日两者都涨）
 * 规则 8：21 天养成线，中断重计
 */
export function checkIn(input: CheckinInput): CheckinResult {
  const { habit, now, schedule, amount, note, restDay } = input

  if (!hasNote(note)) {
    return {
      status: 'rejected',
      reason: 'missing-note',
      habit,
      targetAmount: getDailyTarget(habit, resolveBusinessDate(now, schedule)),
      completedAmount: amount,
      overAmount: 0,
      vacationCoinsDelta: 0,
      formed: habit.isFormed,
    }
  }

  const businessDate = resolveBusinessDate(now, schedule)
  const targetAmount = getDailyTarget(habit, businessDate)

  // 休息日：用假期币抵扣，不打卡、不计缺勤、不触发扣减
  if (restDay === true) {
    if (habit.vacationCoins <= 0) {
      return {
        status: 'rejected',
        reason: 'insufficient-vacation-coins',
        habit,
        targetAmount,
        completedAmount: 0,
        overAmount: 0,
        vacationCoinsDelta: 0,
        formed: habit.isFormed,
      }
    }
    return {
      status: 'rest-day',
      // 休息日计入已处理业务日：次日不判缺勤、不触发动态扣减（规则 6）
      habit: {
        ...habit,
        vacationCoins: habit.vacationCoins - 1,
        lastCheckinDate: businessDate,
      },
      targetAmount,
      completedAmount: 0,
      overAmount: 0,
      vacationCoinsDelta: -1,
      formed: habit.isFormed,
    }
  }

  // 同一业务日重复打卡拒绝（防御性领域约束）
  if (habit.lastCheckinDate === businessDate) {
    return {
      status: 'rejected',
      reason: 'already-checked-in',
      habit,
      targetAmount,
      completedAmount: amount,
      overAmount: 0,
      vacationCoinsDelta: 0,
      formed: habit.isFormed,
    }
  }

  const missed = missedDays(habit, businessDate)

  // ---- 状态推进 ----
  let progressStep = habit.progressStep
  if (habit.cap === null) progressStep += 1

  const totalAmount = habit.totalAmount + amount
  const overAmount = amount > targetAmount ? amount - targetAmount : 0
  const vacationCoins = habit.vacationCoins + overAmount

  // 达标日（完成量 === 目标量）：养成值与连续计数都推进；否则养成连续中断
  const achieved = amount === targetAmount
  const consistencyDays = achieved ? habit.consistencyDays + 1 : habit.consistencyDays
  const formationDays = achieved ? (missed > 0 ? 1 : habit.formationDays + 1) : 0

  const isFormed = formationDays >= FORMED_DAYS

  const nextHabit: HabitState = {
    ...habit,
    progressStep,
    totalAmount,
    consistencyDays,
    formationDays,
    isFormed,
    vacationCoins,
    lastCheckinDate: businessDate,
  }

  const warning =
    overAmount > 0
      ? { kind: 'overachievement' as const, message: OVERACHIEVEMENT_MESSAGE }
      : undefined

  return {
    status: 'checked-in',
    habit: nextHabit,
    targetAmount,
    completedAmount: amount,
    warning,
    overAmount,
    vacationCoinsDelta: overAmount,
    formed: isFormed,
  }
}

/**
 * 规则 3：用户设定自认上限后目标量锁死，后续天数不再变化。
 * cap 非 null 即视为锁死；锁死后 progressStep 不再推进。
 */
export function lockCap(habit: HabitState, cap: number): HabitState {
  return { ...habit, cap }
}

/** 习惯方向常量（供调用方与测试使用） */
export const HABIT_DIRECTIONS: readonly HabitDirection[] = ['positive', 'negative']
