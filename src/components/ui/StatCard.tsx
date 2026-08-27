/**
 * 统计卡：flex-1 居中容器 + 大数字 + 小标签。
 * R13 P4 提取自 ScalePanel(statBox) 与 StoryPanel(Stat) 的重复结构。
 * compact 用面板底 + 小 padding（天平卡）；默认用卡片底 + minWidth90（时间线统计）。值与原文件一致。
 */
import type { CSSProperties, ReactNode } from 'react'
import { COLORS } from './theme'

export interface StatCardProps {
  label: string
  value: ReactNode
  /** true=紧凑（天平卡：面板底 + 小 padding，无 minWidth），默认卡片底 + minWidth90 */
  compact?: boolean
  /** 大数字颜色，默认继承（不设） */
  valueColor?: string
  /** 顶层样式覆盖 */
  style?: CSSProperties
}

export function StatCard({ label, value, compact, valueColor, style }: StatCardProps) {
  return (
    <div
      style={{
        flex: 1,
        ...(compact ? {} : { minWidth: 90 }),
        background: compact ? COLORS.panelBg : COLORS.cardBg,
        borderRadius: 8,
        padding: compact ? '8px 10px' : '10px 12px',
        textAlign: 'center',
        ...style,
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 700, ...(valueColor ? { color: valueColor } : {}) }}>{value}</div>
      <div style={{ fontSize: 11, color: COLORS.textMuted }}>{label}</div>
    </div>
  )
}
