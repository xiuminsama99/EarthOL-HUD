/**
 * 习惯打卡「文案构建」层（R13 P6 从 habitFlow 拆出）
 *
 * 这里只承载面向 UI 的文案构建（人话标签 / 业务日 / 储蓄日 / 一年之约 / 打卡结果反馈）。
 * 纯函数、无 IO、无存储；领域规则判定仍委托微习惯引擎。
 * 与校验/编排（habitFlow.ts）解耦：改文案不误伤流程，改流程不误伤文案。
 * 文案字符串被 habitFlow.test 精确断言，**一个字符都不能改**。
 */
import { projectAnnual } from '../../engine/engine'
import type { CheckinResult, HabitDirection, HabitState } from '../../engine/types'

/** 徽章文案（P1-1）：方向 + 等差数列/固定态的人话标签，UI 直接消费 */
export function habitBadgeLabel(direction: HabitDirection, locked: boolean): string {
  const dir = direction === 'positive' ? '养成' : '戒除'
  if (locked) return `${dir} · 已固定`
  return `${dir} · ${direction === 'positive' ? '每天只多一点点' : '每天少做一点点'}`
}

/**
 * 引导坏习惯描述是否可直接预填为习惯名（P1-3）：
 * 描述过长（>12 字）时通常是一整句话（如「晚上躺床上刷手机到一两点」），
 * 不适合直接当习惯名，UI 改为提示用户用模板或起个简短名字。
 */
export function isPrefillableHabitDesc(desc: string | null): boolean {
  if (desc === null) return false
  const trimmed = desc.trim()
  return trimmed.length > 0 && trimmed.length <= 12
}

/** 周几标签（0=周日 … 6=周六） */
const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/**
 * 业务日人话化（P1-7）：YYYY-MM-DD → 「9 月 1 日 周二」。
 * 业务日为业务时区（Asia/Shanghai）的日期，UTC 日历与该时区不跨日（+8），
 * 用 UTC 解析星期无时区歧义（与 heatmapFlow 同口径）。
 */
export function formatBusinessDateReadable(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return date
  const month = Number(m[2])
  const day = Number(m[3])
  const weekday = new Date(Date.UTC(Number(m[1]), month - 1, day)).getUTCDay()
  return `${month} 月 ${day} 日 ${WEEKDAY_LABELS[weekday]}`
}

/**
 * 超额反馈提示（R-2：储蓄日——多做一点是储备，进度冻结不惩罚；B3 文案区分"存入的券"与"真实超额量"）。
 * 超额产生的休息券上限 = 当日目标量，因此超额量中只有部分转为休息券。
 */
export function buildOverachievementNotice(
  overAmount: number,
  coinsGained: number,
  vacationCoins: number,
): string {
  return `储蓄日：超额 ${overAmount} 中 ${coinsGained} 已存为休息券（当前 ${vacationCoins} 张）——进度冻结一天，不丢失`
}

/**
 * 一年之约面板文案（工单 13）。
 *
 * 把等差数列的复利力量可视化：理想年度总量（愿景大数）+ 已累计进度 +
 * 小目标（今日量）/ 上限（cap）副行；泄漏回退时给出「年度预估少了 Z」的
 * 激励性提示（不惩罚，总量依然巨大）。
 *
 * 正向习惯：显示「坚持一年 = X 单位」+ 进度条。
 * 戒除（反向）习惯：无法用「累计总量」表述（ideal/projected 为 0），
 * 头部改用「每天能省出」口径，避免反语义。
 *
 * @param projection 引擎投影结果
 * @param habit 习惯状态
 * @param yearlyEffectCopy 戒除习惯时代替「坚持一年」大数的文案（habitTemplates.yearlyEffect 产物）
 */
export function buildAnnualPanelCopy(
  projection: ReturnType<typeof projectAnnual>,
  habit: HabitState,
  yearlyEffectCopy?: string,
): {
  headline: string
  progressLabel: string | null
  sub: string
  warn: string | null
} {
  const unit = habit.unit?.trim() || '次'
  const fmt = (n: number): string => {
    if (!Number.isFinite(n)) return '0'
    return Math.floor(n).toLocaleString('zh-CN')
  }
  // 戒除习惯：用「省出」口径的头部大数（理想/预计为 0，不渲染进度条）
  if (habit.direction === 'negative') {
    return {
      headline: yearlyEffectCopy ?? `坚持一年，每天能省出 ${fmt(projection.todayTarget * 365)} ${unit}`,
      progressLabel: null,
      sub: `今天 ${fmt(projection.todayTarget)} ${unit}（第 ${projection.dayIndex} 天）${habit.cap !== null ? ` · 上限 ${habit.cap}` : ' · 每天少做一点点'}`,
      warn: null,
    }
  }
  // 正向习惯：理想愿景大数
  const headline = `${fmt(projection.idealAnnual)} ${unit}`
  const progressLabel = `${fmt(projection.achievedTotal)} / ${fmt(projection.idealAnnual)} ${unit}`
  const sub = `今天 ${fmt(projection.todayTarget)} ${unit}（第 ${projection.dayIndex} 天）${habit.cap !== null ? ` · 上限 ${habit.cap}` : ' · 每天只多一点点'}`
  // 泄漏回退：年度预估少于理想愿景 → 给激励性提示（Z = ideal - projected）
  const warn =
    projection.projectedAnnual > 0 && projection.projectedAnnual < projection.idealAnnual
      ? `漏了几天，年度预估少了 ${fmt(projection.idealAnnual - projection.projectedAnnual)} ${unit}——但一年依然是 ${fmt(projection.idealAnnual)} ${unit} 大数，继续就好`
      : null
  return { headline, progressLabel, sub, warn }
}

/**
 * 打卡结果反馈文案（R-1：不惩罚——未达标/超额均冻结进度而非清零）。
 * - 超额：储蓄日 + 休息券（走 buildOverachievementNotice）
 * - 未达标：如实告知「做了 X / 目标 Y」（进度冻结，不丢历史）
 * - 达标：庆祝
 */
export function buildCheckinResultNotice(result: CheckinResult): string {
  // P1-2：连续达标赠券提示（如当天达标 + 促发 7 天券，一并告知）
  const streakMsg = result.streakCoin ? '连续达标 7 天，获得 1 张休息券。' : ''
  if (result.warning) {
    const base = buildOverachievementNotice(
      result.overAmount,
      result.vacationCoinsDelta,
      result.habit.vacationCoins,
    )
    return streakMsg ? `${base}${streakMsg}` : base
  }
  if (result.completedAmount < result.targetAmount) {
    return `做了 ${result.completedAmount} / 目标 ${result.targetAmount}，明天继续（进度冻结，不丢历史）`
  }
  return streakMsg
    ? `今日达标 ✓ 以新身份行动的一天。${streakMsg}`
    : '今日达标 ✓ 以新身份行动的一天'
}
