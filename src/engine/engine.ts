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
  CheckinMode,
  CheckinResult,
  HabitDirection,
  HabitState,
  WorkSchedule,
} from './types'

/** 养成窗口天数（21 天滑动窗口养成制） */
export const FORMATION_WINDOW_DAYS = 21

/** 展示用分母别名（历史字段名，保留给 UI/测试：养成进度 X/21） */
export const FORMED_DAYS = FORMATION_WINDOW_DAYS

/** 养成所需窗口内达标天数（>= 14 即养成） */
export const FORMATION_THRESHOLD = 14

/** 连续达标 7 天赠 1 张休息券 */
export const STREAK_COIN_DAYS = 7

/** 年度投影周期：一年之约 365 天 */
export const ANNUAL_PROJECTION_DAYS = 365

/**
 * 夜间工作者的业务日边界小时：凌晨 0:00-4:59 的操作归属昨日，
 * 5:00 起归属当日。白天工作者任何时刻归属当日。
 */
export const NIGHT_DAY_START_HOUR = 5

const DAY_MS = 86_400_000

/** 超额文案（R-2：超额改名「储备」——多做一点不是违规，进度冻结不惩罚） */
const OVERACHIEVEMENT_MESSAGE = '储蓄日：多做一点，进度冻结不惩罚'

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
 *
 * B2（防改设备时区作弊）：业务日固定按业务时区（默认 Asia/Shanghai）计算，
 * 由注入的 timeZone 决定，与设备本地时区/时钟无关。改设备时区无法改变业务日归属。
 */
export const BUSINESS_TIME_ZONE = 'Asia/Shanghai'

/** 按业务时区拆出日期与小时（hourCycle h23：午夜为 0，避免 24） */
function businessParts(now: Date, timeZone: string): { dateKey: string; hour: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  })
  const parts = fmt.formatToParts(now)
  const get = (t: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === t)?.value ?? ''
  return {
    dateKey: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')) || 0,
  }
}

/** 业务日字符串加减 N 天（按业务时区，与设备时区无关） */
function dayKeyWithDelta(dateKey: string, delta: number, timeZone: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  return businessParts(new Date(Date.UTC(y, m - 1, d + delta, 12)), timeZone).dateKey
}

export function resolveBusinessDate(
  now: Date,
  schedule: WorkSchedule,
  timeZone: string = BUSINESS_TIME_ZONE,
): string {
  const { dateKey, hour } = businessParts(now, timeZone)
  if (schedule === 'day') return dateKey
  if (hour < NIGHT_DAY_START_HOUR) return dayKeyWithDelta(dateKey, -1, timeZone)
  return dateKey
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

/** 达标日窗口过滤：只保留 businessDate 前 FORMATION_WINDOW_DAYS 天内（含当日）的达标日 */
function pruneFormationDates(dates: string[], businessDate: string): string[] {
  return dates.filter((d) => {
    const gap = daysBetween(d, businessDate)
    return gap >= 0 && gap < FORMATION_WINDOW_DAYS
  })
}

/** 截至 businessDate 的连续达标天数（按业务日往前数；中断即停） */
function achievedStreak(dates: string[], businessDate: string): number {
  const set = new Set(dates)
  let streak = 0
  let cursor = businessDate
  while (set.has(cursor)) {
    streak += 1
    cursor = dayKeyWithDelta(cursor, -1, BUSINESS_TIME_ZONE)
  }
  return streak
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
 * 打卡语自动生成（产品口径：身份在引导时已定，用户零手输；UX-17 通顺化）。
 *
 * 基础：今天以【身份】的身份行动了：【习惯】 · 第 N 次，离向往的自己又近了一点点
 * 超额：… 还多做了 X【单位】，离向往的自己又近了一点点
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
  const unit = habit.unit?.trim() || '次'
  const base = `今天以${who}的身份行动了：${habit.name} · 第${count}次，离向往的自己又近了一点点`
  return overAmount > 0
    ? `今天以${who}的身份行动了：${habit.name} · 第${count}次，还多做了${overAmount}${unit}，离向往的自己又近了一点点`
    : base
}

/** 休息日自动打卡语（休息券抵扣，UX-17 通顺化） */
export function buildRestNote(habit: HabitState, identity: string | null): string {
  const who = identity?.trim() ? identity.trim() : habit.name
  return `今天休息，用 1 张休息券歇了一天（以${who}的身份继续向前）`
}

/**
 * 最低版本自动打卡语（R4 + UX-17 通顺化）：状态差保底行动，目标未达成。
 * 「无论如何都能完成」——保住今天，不丢养成进度。
 */
export function buildMinimalNote(habit: HabitState, identity: string | null): string {
  const who = identity?.trim() ? identity.trim() : habit.name
  return `状态不太好也没关系，做了一点点（以${who}的身份，今天也算行动了）`
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
  const mode: CheckinMode = input.mode ?? 'normal'

  const businessDate = resolveBusinessDate(now, schedule)
  const targetAmount = getDailyTarget(habit, businessDate)

  // 规则 9：用户显式传入的记录必须非空；未传则交给自动生成（永远非空）
  if (note !== undefined && !hasNote(note)) {
    return {
      status: 'rejected',
      reason: 'missing-note',
      mode,
      note: '',
      habit,
      targetAmount,
      completedAmount: amount,
      overAmount: 0,
      vacationCoinsDelta: 0,
      formed: habit.isFormed,
    }
  }

  // 休息日：用假期币抵扣，不打卡、不计缺勤、不触发扣减（与 minimal 互斥，休息优先）
  if (restDay === true) {
    if (habit.vacationCoins <= 0) {
      return {
        status: 'rejected',
        reason: 'insufficient-vacation-coins',
        mode: 'normal',
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
      mode: 'normal',
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

  // 同一业务日重复打卡拒绝（防御性领域约束；minimal 同样防同日重复）
  if (habit.lastCheckinDate === businessDate) {
    return {
      status: 'rejected',
      reason: 'already-checked-in',
      mode,
      note: '',
      habit,
      targetAmount,
      completedAmount: amount,
      overAmount: 0,
      vacationCoinsDelta: 0,
      formed: habit.isFormed,
    }
  }

  // ---- 最低版本（R4）：保底行动，目标未达成 ----
  // 语义（设计已定案）：actionCount+1（记行动日）、totalAmount+amount（如实累计）、
  // progressStep 不推进（明日目标不变）、formationDays 保持（不推进也不归零）、
  // consistencyDays 不涨、无超额无假期币、lastCheckinDate 更新（防同日重复）。
  if (mode === 'minimal') {
    const nextHabit: HabitState = {
      ...habit,
      totalAmount: habit.totalAmount + amount,
      actionCount: habit.actionCount + 1,
      lastCheckinDate: businessDate,
    }
    return {
      status: 'checked-in',
      mode,
      habit: nextHabit,
      note: note !== undefined ? note.trim() : buildMinimalNote(habit, identity),
      targetAmount,
      completedAmount: amount,
      overAmount: 0,
      vacationCoinsDelta: 0,
      formed: habit.isFormed,
    }
  }

  // ---- 状态推进 ----
  let progressStep = habit.progressStep
  if (habit.cap === null) progressStep += 1

  const totalAmount = habit.totalAmount + amount
  const overAmount = amount > targetAmount ? amount - targetAmount : 0
  // B3：超额产生假期币上限 = 当日目标量（超额量"存储"为休息额度，防故意刷币）；
  // 超额警告仍显示真实超额量
  const vacationCoinsGain = Math.min(overAmount, targetAmount)

  // 真实打卡成功次数（锁死 / 缺勤回退不影响；打卡语「第 N 次」用它）
  const actionCount = habit.actionCount + 1

  // 达标日（完成量 === 目标量）：养成值与窗口都推进；否则冻结（不加不清零，R-1）
  const achieved = amount === targetAmount
  const consistencyDays = achieved ? habit.consistencyDays + 1 : habit.consistencyDays

  // ---- R-1 窗口制养成（冻结不惩罚）----
  // 达标日追加到窗口，未达标/超额日冻结（不加也不清零），窗口按业务日自然滑动
  let formationDateList = habit.formationDateList ?? []
  if (achieved) {
    if (!formationDateList.includes(businessDate)) {
      formationDateList = [...formationDateList, businessDate]
    }
  }
  formationDateList = pruneFormationDates(formationDateList, businessDate)
  const formationDays = formationDateList.length

  // R-3：戒除习惯目标触底 0 ＝ 完成戒除 ＝ 直接已养成。
  // 以推进后的 progressStep 判定「下一次目标是否已到 0」；今日目标已为 0 亦视为完成。
  const nextStep = habit.cap === null ? progressStep : habit.progressStep
  const nextTargetNegative =
    habit.direction === 'negative' ? Math.max(0, habit.baseAmount - nextStep) : -1
  const quitCompleted = habit.direction === 'negative' && (targetAmount === 0 || nextTargetNegative === 0)

  // 已养成后不被单日撤销（isFormed 一旦为真即保持）；达到窗口阈值养成；戒除触底亦养成
  const isFormed = habit.isFormed || formationDays >= FORMATION_THRESHOLD || quitCompleted

  // R-2：连续达标 STREAK_COIN_DAYS 天赠 1 张休息券（达标日当天发放）
  const streak = achieved ? achievedStreak(formationDateList, businessDate) : 0
  const streakCoin = streak > 0 && streak % STREAK_COIN_DAYS === 0 ? 1 : 0
  const vacationCoins = habit.vacationCoins + vacationCoinsGain + streakCoin

  const nextHabit: HabitState = {
    ...habit,
    progressStep,
    totalAmount,
    consistencyDays,
    formationDateList,
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
    mode,
    habit: nextHabit,
    note: finalNote,
    targetAmount,
    completedAmount: amount,
    warning,
    overAmount,
    vacationCoinsDelta: vacationCoinsGain,
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

/**
 * 年度投影结果（一年之约：把等差数列的复利力量可视化）。
 * 正向习惯才有大数值；反向（戒除）习惯无法用「累计总量」表述，
 * ideal/projected 恒为 0（UI 改用「每天能省出」口径，见 yearlyEffect）。
 */
export interface AnnualProjection {
  /** 理想年度总量（第 1 天起理想轨迹 365 天总和；锁死后恒 cap×365）。反向恒 0 */
  idealAnnual: number
  /** 预计年度总量（已累计 + 未来按当前真实目标轨迹到第 365 天；漏卡回退后下降）。反向恒 0 */
  projectedAnnual: number
  /** 已累计总量（= habit.totalAmount） */
  achievedTotal: number
  /** 当前第几天（1-based，从创建业务日起算） */
  dayIndex: number
  /** 今日目标量（含缺勤回退；锁死后恒 cap） */
  todayTarget: number
}

/** YYYY-MM-DD 是否合法业务日格式（projectAnnual 兜底用） */
const BUSINESS_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * 轨迹求和：Σ_{d=startDay}^{endDay} targetMet(d)
 * - cap === Infinity（无上限）：纯等差，每日 +1
 * - cap 有限：递增段后恒定封顶
 * @param base 起始基准（第 1 天目标）
 * @param cap  上限（Infinity 表示未锁死/无上限）
 * @param startDay / endDay 起止日（1-based，endDay < startDay 返回 0）
 */
function sumTrajectory(base: number, cap: number, startDay: number, endDay: number): number {
  if (endDay < startDay) return 0
  const n = endDay - startDay + 1
  // 无上限：纯等差和
  if (cap === Infinity) {
    const first = base + (startDay - 1)
    const last = base + (endDay - 1)
    return (n * (first + last)) / 2
  }
  // 目标从哪天起恒等于 cap：base + (d-1) >= cap → d >= cap - base + 1
  const capDay = cap - base + 1
  if (capDay <= startDay) return n * cap
  if (capDay > endDay) {
    const first = base + (startDay - 1)
    const last = base + (endDay - 1)
    return (n * (first + last)) / 2
  }
  // 部分递增、部分封顶
  const incDays = capDay - startDay
  const first = base + (startDay - 1)
  const incTotal = (incDays * (first + (cap - 1))) / 2 // 递增段末项目标 = cap - 1
  return incTotal + (n - incDays) * cap
}

/**
 * 年度投影（一年之约，工单 13）。
 *
 * 语义（不虚假成功，正向前瞻）：
 * - idealAnnual：理想愿景——从第 1 天起每天 +1 到第 365 天（cap 非空则封顶恒 cap），
 *   全年累计总量。恒定不变，是「坚持一年 = X」的大目标。
 * - projectedAnnual：更现实——已累计 totalAmount + 从明天起按当前真实目标（含缺勤回退）
 *   每天 +1 到第 365 天的预计新增。漏卡回退会让 todayTarget 变小 → 预计下降
 *   （体现「从总数扣减」，但总量依然巨大）。
 * - dayIndex：从创建业务日起的第几天（1-based）。无创建日/非法日期兜底 = 1。
 *
 * 反向（戒除）习惯无法以「累计量」表述，ideal/projected 恒为 0，UI 走 yearlyEffect
 * 的「每天能省出」口径，避免出现「做了 66,795 个」这类反语义。
 */
export function projectAnnual(habit: HabitState, businessDate: string): AnnualProjection {
  const validCreated = BUSINESS_DATE_RE.test(habit.createdAt)
  const dayIndex = validCreated
    ? Math.max(1, daysBetween(habit.createdAt, businessDate) + 1)
    : 1
  const todayTarget = getDailyTarget(habit, businessDate)

  if (habit.direction === 'negative') {
    return {
      idealAnnual: 0,
      projectedAnnual: 0,
      achievedTotal: habit.totalAmount,
      dayIndex,
      todayTarget,
    }
  }

  // 锁死（cap 非 null）：每天恒 cap；未锁死：每天 +1（cap 为 Infinity 表示无上限）
  const cap = habit.cap === null ? Infinity : habit.cap
  // 轨迹起点：锁死时从第 1 天起就是 cap（无递增段），未锁死时从 baseAmount 起递增
  const trajectoryBase = habit.cap === null ? habit.baseAmount : habit.cap
  const idealAnnual = sumTrajectory(trajectoryBase, cap, 1, ANNUAL_PROJECTION_DAYS)
  // 从今天（含）到第 365 天的剩余天数；全勤达标时 projected 会与 ideal 相等
  const remainingDays = Math.max(0, ANNUAL_PROJECTION_DAYS - dayIndex + 1)
  const futureSum = sumTrajectory(todayTarget, cap, 1, remainingDays)
  const projectedAnnual = habit.totalAmount + futureSum

  return {
    idealAnnual,
    projectedAnnual,
    achievedTotal: habit.totalAmount,
    dayIndex,
    todayTarget,
  }
}
