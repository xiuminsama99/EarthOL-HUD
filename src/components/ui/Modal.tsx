/**
 * 全屏覆盖对话框（role=dialog）外壳。
 * R13 P7 提取自 StoryPanel 的全屏覆盖层。只做「覆盖层 + dialog 语义」壳，
 * 内容（sheet / 头部 / 关闭钮 / 主体）由调用方渲染。
 * 值与原文件 overlay 常量逐字一致，零视觉变化。
 */
import type { CSSProperties, ReactNode } from 'react'

export interface ModalProps {
  /** 无障碍标签（aria-label） */
  label: string
  children: ReactNode
  /** 覆盖层顶层样式覆盖 */
  style?: CSSProperties
}

/** 全屏覆盖层样式（取自 StoryPanel overlay 常量，逐字一致） */
const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 50,
  background: 'rgba(8,8,18,0.92)',
  overflowY: 'auto',
  padding: '24px 0 60px',
}

export function Modal({ label, children, style }: ModalProps) {
  return (
    <div role="dialog" aria-label={label} style={{ ...overlay, ...style }}>
      {children}
    </div>
  )
}
