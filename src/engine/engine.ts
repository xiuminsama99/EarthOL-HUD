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
 * 打卡语自动生成（产品口径：身份在引导时已定，用户零手输）。
 *
 * 基础：我以【身份】完成了【习惯名】的第【N】次，离目标更近了一点点
 * 超额：…（今天多做了 X 个）…
 *
 * @param identity 身份宣言「我是___」；未设置时兜底用习惯名
 * @param overAmount 超额量（>0 时并入文案）
 * @param count 累计真实打卡成功次数（默认取 habit.actionCount，至少 1）
 */
export function buildAutoNote(
  habit: HabitState,
  identity: string | null,
  overAmount = 0,
  count = Math.max(1, habit.actionCount),
): string {
  const who = identity?.trim() ? identity.trim() : habit.name
  const base = `我以${who}的身份完成了${habit.name}的第${count}次，离目标更近了一点点`
  return overAmount > 0 ? `${base}（今天多做了${overAmount}个）` : base
}

/** 休息日自动打卡语（假期币抵扣） */
export function buildRestNote(habit: HabitState, identity: string | null): string {
  const who = identity?.trim() ? identity.trim() : habit.name
  return `今天休息，用假期币抵扣了一天（我以${who}的身份保持节奏）`
}

/**
 * 规则 9：打卡语约束。
 * note 未传（undefined）→ 自动生成（零输入）；传字符串 → trim 后必须非空。
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
  const identity = input.identity ?? null

  const businessDate = resolveBusinessDate(now, schedule)
  const targetAmount = getDailyTarget(habit, businessDate)

  // 规则 9：用户显式传入的记录必须非空；未传则交给自动生成（永远非空）
  if (note !== undefined && !hasNote(note)) {
    return {
      status: 'rejected',
      reason: 'missing-note',
      note: '',
      habit,
      targetAmount,
      completedAmount: amount,
      overAmount: 0,
      vacationCoinsDelta: 0,
      formed: habit.isFormed,
    }
  }

  // 休息日：用假期币抵扣，不打卡、不计缺勤、不触发扣减
  if (restDay === true) {
    if (habit.vacationCoins <= 0) {
      return {
        status: 'rejected',
        reason: 'insufficient-vacation-coins',
        note: '',
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
      note: note !== undefined ? note.trim() : buildRestNote(habit, identity),
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
      note: '',
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

  // 真实打卡成功次数（锁死 / 缺勤回退不影响；打卡语「第 N 次」用它）
  const actionCount = habit.actionCount + 1

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
    actionCount,
    lastCheckinDate: businessDate,
  }

  const warning =
    overAmount > 0
      ? { kind: 'overachievement' as const, message: OVERACHIEVEMENT_MESSAGE }
      : undefined

  // 打卡语：用户未输入时按推进后的进度自动生成（超额自动并入）
  const finalNote =
    note !== undefined ? note.trim() : buildAutoNote(nextHabit, identity, overAmount)

  return {
    status: 'checked-in',
    habit: nextHabit,
    note: finalNote,
    targetAmount,
    completedAmount: amount,
    warning,
    overAmount,
    vacationCoinsDelta: overAmount,
    formed: isFormed,
  }
}

/**
 * 规则 3：用户设定自认上限后目标量锁死，不再随天数自动变化。
 * cap 非 null 即视为锁死；锁死后 progressStep 不再推进。
 * 本函数可重复调用：同一习惯可随时调高/调低 cap（可调锁死，2026-08 产品反馈），
 * 约束（正向 ≥ 基准 / 反向 ≤ 基准）由调用方（habitFlow.setCap）校验。
 */
export function lockCap(habit: HabitState, cap: number): HabitState {
  return { ...habit, cap }
}

/** 习惯方向常量（供调用方与测试使用） */
export const HABIT_DIRECTIONS: readonly HabitDirection[] = ['positive', 'negative']
