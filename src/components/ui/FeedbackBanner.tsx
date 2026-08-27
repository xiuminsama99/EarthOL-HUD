/**
 * 反馈横幅（role=status）：成功/中性提示。
 * R13 P4 提取自 HabitPanel / SideHabitCard 的重复 `role="status"` 块。
 * 颜色按 ok 取成功绿/金；尺寸差异用 compact 区分（面板级 vs 卡片级）。值与原文件一致。
 */
import type { CSSProperties, ReactNode } from 'react'
import { COLORS } from './theme'

export interface FeedbackBannerProps {
  /** true=成功绿，false=金色警示 */
  ok?: boolean
  children: ReactNode
  /** true=紧凑（SideHabitCard 卡片级），默认面板级 */
  compact?: boolean
  /** 顶层样式覆盖 */
  style?: CSSProperties
}

export function FeedbackBanner({ ok = false, children, compact, style }: FeedbackBannerProps) {
  const merged: CSSProperties = compact
    ? { padding: '8px 10px', borderRadius: 8, fontSize: 12, margin: '0 0 10px' }
    : { padding: '10px 12px', borderRadius: 8, fontSize: 13, margin: '0 0 12px' }
  merged.background = ok ? COLORS.successBg : COLORS.warnBg
  merged.color = ok ? COLORS.success : COLORS.goldLight
  return (
    <p role="status" style={{ ...merged, ...style }}>
      {children}
    </p>
  )
}
