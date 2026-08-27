/**
 * 空/加载状态占位：居中弱文字。
 * R13 P4 提取自 HabitScreen(解析时间中) 与 StoryPanel(无记录) 的重复块。值与原文件一致。
 */
import type { CSSProperties, ReactNode } from 'react'
import { COLORS } from './theme'

export interface EmptyStateProps {
  children: ReactNode
  /** 顶层样式覆盖 */
  style?: CSSProperties
}

export function EmptyState({ children, style }: EmptyStateProps) {
  return (
    <div style={{ padding: '40px 0', textAlign: 'center', color: COLORS.textMuted, fontSize: 14, ...style }}>
      {children}
    </div>
  )
}
