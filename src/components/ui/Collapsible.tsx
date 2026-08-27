/**
 * 语义化折叠区（R13 P7）。
 * 统一「aria-expanded / 键盘可达 / 默认收起」的语义层；触发样式与内容完全由调用方控制
 * （通过 trigger render-prop 渲染触发器，可 spread 提供的 a11y props）。
 * 不改变任何触发器的视觉，只做语义包装。受控组件（open / onToggle 由调用方持有 state）。
 *
 * 注：本原语适合「非原生 button」触发器（如可点击的 div），为其补上 role/tabIndex/keydown；
 * 对已是原生 <button aria-expanded> 的折叠区，无需使用本原语。
 */
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'

export interface CollapsibleA11yProps {
  /** ARIA 展开态（供 spread 到触发器元素） */
  'aria-expanded': boolean
  role: 'button'
  tabIndex: number
  /** 键盘开关（Enter / Space） */
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void
}

export interface CollapsibleTriggerProps extends CollapsibleA11yProps {
  /** 是否展开 */
  open: boolean
  /** 展开/收起切换（供 onClick = toggle） */
  toggle: () => void
}

export interface CollapsibleProps {
  /** 受控：是否展开 */
  open: boolean
  /** 受控：切换回调 */
  onToggle: () => void
  /** 渲染触发器（调用方全权控制样式与内容） */
  trigger: (props: CollapsibleTriggerProps) => ReactNode
  /** 展开时渲染的内容 */
  children: ReactNode
  /** 内容区包裹样式（可选，如 marginTop） */
  contentStyle?: CSSProperties
}

export function Collapsible({ open, onToggle, trigger, children, contentStyle }: CollapsibleProps) {
  const handleKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onToggle()
    }
  }
  const a11y: CollapsibleA11yProps = {
    'aria-expanded': open,
    role: 'button',
    tabIndex: 0,
    onKeyDown: handleKey,
  }
  return (
    <>
      {trigger({ open, toggle: onToggle, ...a11y })}
      {open && (contentStyle ? <div style={contentStyle}>{children}</div> : children)}
    </>
  )
}
