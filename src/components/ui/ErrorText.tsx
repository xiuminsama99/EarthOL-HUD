/**
 * 错误提示文本（role=alert）。
 * R13 P4 提取自各文件重复的 `role="alert"` 块。
 * 默认红色 #ff7a7a + fontSize13；不同位置用 color/fontSize/style 覆盖，
 * 用 inline 切换为 span（如宠物卡内联提示）。值与原文件一致，零视觉变化。
 */
import type { CSSProperties, ReactNode } from 'react'
import { COLORS } from './theme'

export interface ErrorTextProps {
  children: ReactNode
  /** 文字颜色，默认错误红 */
  color?: string
  /** 字号，默认 13 */
  fontSize?: number
  /** 顶层样式覆盖（如 margin） */
  style?: CSSProperties
  /** true 渲染为 span（内联），默认 <p> */
  inline?: boolean
}

export function ErrorText({ children, color = COLORS.danger, fontSize = 13, style, inline }: ErrorTextProps) {
  const merged: CSSProperties = { color, fontSize, ...style }
  if (inline) {
    return (
      <span role="alert" style={merged}>
        {children}
      </span>
    )
  }
  return (
    <p role="alert" style={merged}>
      {children}
    </p>
  )
}
