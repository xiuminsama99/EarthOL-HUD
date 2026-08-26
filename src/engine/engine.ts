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
  Achievement,
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

/** 戒除完成态「继续坚持」打卡语（P1-1）：保持 0 目标态，防止复吸无记录。 */
export function buildQuitMaintainNote(habit: HabitState, identity: string | null): string {
  const who = identity?.trim() ? identity.trim() : habit.name
  return `今天也没做${habit.name}（以${who}的身份，继续坚持）`
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
  // quit-maintain 仅在戒除习惯且目标已触底 0 时适用；否则回落 normal（正向/未触底不消费
  // 该模式，避免 result.mode 是 quit-maintain 却走了普通打卡路径的语义错乱）
  const isQuitMaintainApplicable =
    mode === 'quit-maintain' && habit.direction === 'negative' && getDailyTarget(habit, resolveBusinessDate(now, schedule)) === 0
  const effectiveMode: CheckinMode = mode === 'quit-maintain' && !isQuitMaintainApplicable ? 'normal' : mode

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

  // ---- 戒除完成态「继续坚持」（P1-1）：目标已到 0，记录"今天也没做 X"，保持 0 目标态 ----
  // 仅戒除习惯且目标已触底 0 时可用；不累计总量/行动次数（它本就不是"行动"），
  // 进度/养成窗口/休息券/连胜均不动（保持已养成的 0 目标状态），仅刷新当日避免缺勤回退。
  if (isQuitMaintainApplicable) {
    const nextHabit: HabitState = {
      ...habit,
      lastCheckinDate: businessDate,
    }
    return {
      status: 'checked-in',
      mode: effectiveMode,
      habit: nextHabit,
      note: note !== undefined ? note.trim() : buildQuitMaintainNote(habit, identity),
      targetAmount,
      completedAmount: 0,
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

  // BUG-1：连续良性达成计数（原始、未被 21 天窗口裁剪）。
  // 仅达标日（amount === target，即 achieved） +1；未达标/超额断连清零；
  // 缺勤归来（miss > 0）链被打断清零；休息/最低版本日提前 return（冻结不增不减）。
  // 说明：超额在窗口制养成里同样"冻结不计达标"（R-1 现有语义），因此对 streak 也是断连。
  const miss = missedDays(habit, businessDate)
  let streakDays = habit.streakDays
  if (miss > 0) streakDays = 0 // 缺勤归来：链被打断
  if (achieved) {
    streakDays += 1
  } else {
    streakDays = 0 // 未达标（含超额）断连
  }

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

  // R-2：连续良性达成 STREAK_COIN_DAYS 天赠 1 张休息券（达标日当天发放）
  // BUG-1：用原始 streakDays（未被 21 天窗口裁剪），避免窗口满后每天白送券
  const streakCoin = streakDays > 0 && streakDays % STREAK_COIN_DAYS === 0 ? 1 : 0
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
    streakDays,
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
    mode: effectiveMode,
    habit: nextHabit,
    note: finalNote,
    targetAmount,
    completedAmount: amount,
    warning,
    overAmount,
    vacationCoinsDelta: vacationCoinsGain,
    formed: isFormed,
    streakCoin,
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

/** 成就系统输入（R12）：从 EarthData 抽取成就判定所需的最小字段，保持引擎不依赖 storage */
export interface AchievementInput {
  /** 是否完成角色设定（profile.onboardedAt 非空） */
  hasProfile: boolean
  /** 全部习惯 */
  habits: HabitState[]
  /** 全部打卡记录数（真实发生过的事） */
  checkinCount: number
  /** 达成当天写入的业务日（YYYY-MM-DD） */
  businessDate: string
}

/** 判定「戒除目标是否已触底 0」：反向习惯、已养成、当前目标为 0 */
function isQuitAchieved(habit: HabitState, businessDate: string): boolean {
  if (habit.direction !== 'negative') return false
  if (!habit.isFormed) return false
  return getDailyTarget(habit, businessDate) <= 0
}

/**
 * 成就系统（R12 游戏化薄层，工单 19 P0）。
 *
 * 诚实原则：只基于真实发生过的事（profile/habits/checkins）判定，
 * 绝不"假装成功"或用假数字激励（如"今日×365"）。所有成就 id 恒定，
 * 达成后 earnedAt 写入业务日（YYYY-MM-DD），未达成 earnedAt=null + 暗示。
 */
export function computeAchievements(input: AchievementInput): Achievement[] {
  const { hasProfile, habits, checkinCount, businessDate } = input

  /** 全部习惯累计真实打卡成功次数 */
  const totalActionCount = habits.reduce((sum, h) => sum + h.actionCount, 0)
  /** 已养成（isFormed）的习惯数 */
  const formedCount = habits.filter((h) => h.isFormed).length
  /** 任一习惯连续 >= 7 天 */
  const bestStreak = habits.reduce((best, h) => Math.max(best, h.streakDays), 0)
  /** 是否任一戒除习惯已触底 0 */
  const quitDone = habits.some((h) => isQuitAchieved(h, businessDate))

  /** 定义一个成就；done 满足则达成，否则未达成给 hint */
  const make = (
    id: string,
    title: string,
    desc: string,
    icon: string,
    hint: string,
    done: boolean,
  ): Achievement => ({ id, title, desc, icon, earnedAt: done ? businessDate : null, hint })

  return [
    make('first-avatar', '初次化身', '完成角色设定，踏上身份蜕变之旅', '🌱', '完成角色设定后解锁', hasProfile),
    make('first-action', '第一次行动', '迈出第一步——完成第一次打卡', '✅', '完成第一次打卡后解锁', checkinCount >= 1),
    make('streak-7', '连续 7 天', '连续 7 天都稳稳地行动', '🔥', '连续 7 天达标后解锁', bestStreak >= 7),
    make('formed', '习惯养成', '养成一个习惯——21 天窗口内达标 14 天', '💪', '让一个习惯的时间线达标 14 天后解锁', formedCount >= 1),
    make('multi', '多线并进', '同时养成 2 个习惯', '⚔️', '同时养成 2 个习惯后解锁', formedCount >= 2),
    make('quit', '戒除达人', '成功戒掉一个想做减法的事', '🚫', '把一个戒除习惯降到 0 后解锁', quitDone),
    make('action-100', '百次行动', '累计完成 100 次打卡', '💯', '累计打卡 100 次后解锁', totalActionCount >= 100),
    make('month-30', '坚持一月', '单习惯连续 30 天', '🏆', '一个习惯连续 30 天后解锁', bestStreak >= 30),
  ]
}
