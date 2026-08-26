/**
 * 天平可视化与累积数字（工单 06）
 *
 * 「身份一致性」叙事的可视化计算层：输入习惯与打卡记录 → 输出天平两盘
 * 重量、累积数字、目标达成率与「全球 X%」（示例数据，UI 暂不展示，
 * BaaS 接入后替换为真实统计再恢复）。纯函数，UI 只消费结果。
 *
 * 产品语义（CONTEXT.md）：天平左边是「真实的你」（以身份行动的积累），
 * 右边是「向往的你」（愿景的彼岸）。每次打卡左盘更沉——行动正在兑现身份。
 * 展示的是「有多少天以新身份行动」，与连续打卡天数（streak）无关。
 */
import type { HabitState } from '../../engine/types'
import type { CheckinRecord } from '../../storage/types'

/** 向往基准：连续行动这么多天后，天平压向「真实的你」（可调产品常数） */
export const DESIRE_BASELINE_DAYS = 7

/** YYYY-MM-DD 加减 N 天（仅日历运算，纯字符串；用于最近 7 天窗口） */
function businessDateDelta(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + delta, 12))
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${dt.getUTCFullYear()}-${mm}-${dd}`
}

/** 全球 X% 模拟区间（示例数据，BaaS 接入后替换为真实统计） */
export const GLOBAL_PERCENT_MIN = 30
export const GLOBAL_PERCENT_MAX = 97

/** 天平最大倾斜角度（度），避免视觉过载 */
export const TILT_MAX_DEG = 10

/** 每相差 1 天产生的倾斜角度系数 */
const TILT_PER_DAY_DEG = 3

export interface ScaleData {
  /** 以身份行动的天数（打卡记录按业务日去重；休息日不计） */
  actionDays: number
  /** 以身份行动的总次数（休息日不计） */
  actionCount: number
  /** 累计完成总量（全部习惯 totalAmount 之和，只涨不跌） */
  totalAmount: number
  /** 目标达成率：达标打卡数 / 行动打卡数，百分比整数；从未行动为 null（保留字段，兼容旧读数） */
  achievedRate: number | null
  /** 最近 7 天行动率：近 7 个业务日里行动过（非休息）的天数 / 7，百分比整数；无 today 或从未行动为 null */
  weeklyActionRate: number | null
  /** 左盘「真实的你」重量 = 行动天数 */
  leftValue: number
  /** 右盘「向往的你」重量 = 向往基准（产品常数） */
  rightValue: number
  /** 天平倾斜角（度）：>0 左盘下沉（行动压过向往），<0 右盘下沉 */
  tiltDeg: number
  /** 「已超过全球 X% 的玩家」（示例数据：按达成率模拟，BaaS 后置替换；UI 暂不展示） */
  globalPercent: number
  /** 累计总量的计量单位：全部习惯单位一致时用该单位，否则回退「次」（N4，避免多单位混用） */
  unit: string
  /** 最近一条行动打卡语（身份一致性的证据）；从未行动为 null */
  latestNote: string | null
}

/**
 * 计算天平与累积数字（纯函数）。
 *
 * @param habits 全部习惯（总量合计用）
 * @param checkins 全部打卡记录（行动天数 / 达成率 / 最近打卡语来源）
 * @param today 注入的业务日 YYYY-MM-DD（R-4：计算最近 7 天行动率；不传则不计算）
 */
export function computeScaleData(
  habits: HabitState[],
  checkins: CheckinRecord[],
  today: string | null = null,
): ScaleData {
  const actions = checkins.filter((c) => !c.restDay)
  const actionDays = new Set(actions.map((c) => c.businessDate)).size
  const actionCount = actions.length
  const totalAmount = habits.reduce((sum, h) => sum + h.totalAmount, 0)
  // N4：全部习惯单位一致 → 用该单位；不一致（或空）→ 回退「次」，避免混用误导
  const unitSet = new Set(
    habits.map((h) => (h.unit ?? '').trim()).filter((u) => u !== ''),
  )
  const unit = unitSet.size === 1 ? [...unitSet][0] : '次'
  const achieved = actions.filter((c) => c.amount >= c.targetAmount).length
  const achievedRate = actionCount > 0 ? Math.round((achieved / actionCount) * 100) : null

  // R-4：最近 7 天行动率 = 近 7 个业务日（含今天）行动过（非休息）的天数 / 7
  let weeklyActionRate: number | null = null
  if (today !== null) {
    const actionDaySet = new Set(actions.map((c) => c.businessDate))
    let acted = 0
    for (let i = 0; i < 7; i++) {
      const d = businessDateDelta(today, -i)
      if (actionDaySet.has(d)) acted += 1
    }
    weeklyActionRate = Math.round((acted / 7) * 100)
  }

  const leftValue = actionDays
  const rightValue = DESIRE_BASELINE_DAYS
  const tiltDeg = Math.max(
    -TILT_MAX_DEG,
    Math.min(TILT_MAX_DEG, (leftValue - rightValue) * TILT_PER_DAY_DEG),
  )

  // 示例数据：达成率越高「超过越多玩家」；从未行动取最低档
  const rate = achievedRate ?? 0
  const globalPercent = Math.round(
    Math.min(
      GLOBAL_PERCENT_MAX,
      Math.max(GLOBAL_PERCENT_MIN, GLOBAL_PERCENT_MIN + (rate / 100) * (GLOBAL_PERCENT_MAX - GLOBAL_PERCENT_MIN)),
    ),
  )

  const latest =
    actions.length > 0
      ? [...actions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
      : null

  return {
    actionDays,
    actionCount,
    totalAmount,
    achievedRate,
    weeklyActionRate,
    leftValue,
    rightValue,
    tiltDeg,
    globalPercent,
    unit,
    latestNote: latest ? latest.note : null,
  }
}
