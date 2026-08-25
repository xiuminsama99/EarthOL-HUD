/**
 * 微习惯引擎领域类型（地球online玩家控制台）
 *
 * 命名遵循根目录 CONTEXT.md 领域词汇：微习惯法、动态调节条、不退零、
 * 假期币、总量/养成值分离、21 天养成线、作息类型。
 *
 * 引擎是纯逻辑模块：不依赖 UI / 数据库 / 网络 / 设备时间。
 * 所有时间输入由调用方注入。
 */

/** 习惯方向：正向习惯（递增，如每天多读一页）/ 反向习惯（递减，如每天少吃一口） */
export type HabitDirection = 'positive' | 'negative'

/** 作息类型：白天工作 / 夜间工作（影响「今天」的业务日边界判定） */
export type WorkSchedule = 'day' | 'night'

/** 超额警告：完成量超出当日目标时给出 */
export interface OverachievementWarning {
  kind: 'overachievement'
  message: string
}

/** 习惯状态（引擎读写的最小领域对象） */
export interface HabitState {
  id: string
  /** 习惯名称（产品展示用，引擎规则不读） */
  name: string
  /** 正向/反向习惯 */
  direction: HabitDirection
  /** 起始基准：第 0 天（未推进时）的当日目标量，永不越过 */
  baseAmount: number
  /** 用户自认上限；非 null 即已锁死，目标量恒等于 cap */
  cap: number | null
  /** 当前等差数列位置：已推进的步数（第 N 天目标 = 基准 ± N） */
  progressStep: number
  /** 总量：累计完成量之和，只涨不跌（突击完成也计入） */
  totalAmount: number
  /** 养成值：达标日（完成量 === 当日目标量）累计天数；突击/不足不涨 */
  consistencyDays: number
  /** 当前连续达标计数：中断（缺勤/未达标）归零，达 21 天养成 */
  formationDays: number
  /** 是否已养成（formationDays >= 21） */
  isFormed: boolean
  /** 假期币余额：超额量累计而来，可抵扣休息日 */
  vacationCoins: number
  /** 上次打卡的业务日（YYYY-MM-DD），null 表示从未打卡 */
  lastCheckinDate: string | null
  /** 真实打卡成功次数（checked-in 才 +1；休息日/拒绝不计；锁死与缺勤回退不影响）——打卡语「第 N 次」的 N */
  actionCount: number
  /** 习惯创建的业务日（YYYY-MM-DD） */
  createdAt: string
}

/** 打卡动作输入 */
export interface CheckinInput {
  habit: HabitState
  /** 注入的当前时刻（引擎不读设备时间） */
  now: Date
  /** 作息类型，决定「今天」的业务日边界 */
  schedule: WorkSchedule
  /** 当日完成量（非负整数） */
  amount: number
  /**
   * 一句话打卡记录。
   * - 未传（undefined）：由引擎基于身份自动生成（零输入体验）
   * - 传入字符串：使用该文本；trim 后为空仍拒绝（missing-note）
   */
  note?: string
  /** 身份宣言「我是___」（正愿景产物）；未设置时打卡语兜底用习惯名 */
  identity?: string | null
  /** 今天是否用假期币抵扣休息（抵扣日不计缺勤、不触发动态扣减） */
  restDay?: boolean
}

export type CheckinStatus = 'checked-in' | 'rest-day' | 'rejected'

/** 拒绝原因 */
export type RejectReason =
  /** 打卡未附一句话记录 */
  | 'missing-note'
  /** 想休息但假期币不足 */
  | 'insufficient-vacation-coins'
  /** 同一业务日已打过卡 */
  | 'already-checked-in'
  /** 当日已切换作息类型（B1 防刷卡：切换当天禁止再次打卡） */
  | 'schedule-switched-today'

/** 打卡动作结果 */
export interface CheckinResult {
  status: CheckinStatus
  /** rejected 时给出原因 */
  reason?: RejectReason
  /** 最终打卡语：自动生成文本或用户文本（rejected 时为 ''） */
  note: string
  /** 更新后的习惯状态（rejected 时等于原状态） */
  habit: HabitState
  /** 当日目标量 */
  targetAmount: number
  /** 本次记录完成量 */
  completedAmount: number
  /** 超额警告（完成量 > 目标量时存在） */
  warning?: OverachievementWarning
  /** 超额量（未超额为 0） */
  overAmount: number
  /** 假期币变动（超额入币上限=当日目标量 B3 / 休息日抵扣为负 / 其他为 0） */
  vacationCoinsDelta: number
  /** 本次动作后的养成状态 */
  formed: boolean
}
