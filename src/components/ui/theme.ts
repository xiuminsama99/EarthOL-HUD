/**
 * 全局视觉 token 与共享样式对象（R13 P3 提取）。
 * 集中色彩/状态 tokens 与跨文件复用的样式对象，作为单一来源。
 * 值严格取自各文件原始定义，零视觉变化；同名但值不同的样式对象以语义变体导出。
 */
import type { CSSProperties } from 'react'

/** 色彩 tokens（各文件原始 hex，未改值；同一对象内颜色走此单一来源） */
export const COLORS = {
  panelBg: '#141428', // 主面板深底
  cardBg: '#1b1b33', // 卡片底
  deepBg: '#2d2d4a', // 深紫卡片
  border: '#2c2c4a', // 边框
  text: '#e5e5f0', // 主文字
  textMuted: '#8b8ba3', // 弱文字
  textFaint: '#5a5a74', // 更弱文字
  accent: '#7c5cff', // 主紫强调
  success: '#7ee0a8', // 成功绿字
  successBg: '#153a2c', // 成功绿底
  successBorder: '#2c8a5a', // 成功绿边框
  gold: '#d9b64a', // 金色（储蓄/警示）
  goldLight: '#ffd27a', // 金色亮字
  warnBg: '#3a2c15', // 警示暗底
  danger: '#ff7a7a', // 错误红字
  dangerLight: '#ff9a9a', // 浅红字
  dangerBg: '#3a1515', // 错误暗底
  dangerBorder: '#8a2c2c', // 错误边框
  white: '#fff',
} as const

/** 页面主面板（480 宽 dashboard 型）：Onboarding / AdoptPet 使用 */
export const panelPage = {
  maxWidth: 480,
  margin: '40px auto',
  padding: 24,
  borderRadius: 12,
  background: COLORS.panelBg,
  color: COLORS.text,
  fontFamily: 'system-ui, sans-serif',
} satisfies CSSProperties

/** 页面主面板（HabitScreen 专用：给底部固定「一键打卡」留空间） */
export const panelScreen = {
  maxWidth: 480,
  margin: '40px auto',
  padding: 24,
  paddingBottom: 120, // 给底部固定「一键打卡」留空间
  borderRadius: 12,
  background: COLORS.panelBg,
  color: COLORS.text,
  fontFamily: 'system-ui, sans-serif',
} satisfies CSSProperties

/** 小卡片面板（#1b1b33 紧凑型）：Heatmap / Scale 使用 */
export const panelCard = {
  background: COLORS.cardBg,
  borderRadius: 10,
  padding: '14px 16px',
  marginBottom: 16,
} satisfies CSSProperties

/** 文本输入（含字体会继承 + fontSize15）：Onboarding / AdoptPet 使用 */
export const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  borderRadius: 8,
  border: `1px solid ${COLORS.border}`,
  background: COLORS.cardBg,
  color: COLORS.text,
  fontSize: 15,
  fontFamily: 'inherit',
} satisfies CSSProperties

/** 文本输入（CreateHabitForm：fontSize16，无字体继承） */
export const inputStyleForm = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  borderRadius: 8,
  border: `1px solid ${COLORS.border}`,
  background: COLORS.cardBg,
  color: COLORS.text,
  fontSize: 16,
} satisfies CSSProperties

/** 字段标签（Onboarding：marginBottom 6） */
export const labelStyle = {
  display: 'block',
  fontSize: 13,
  color: COLORS.textMuted,
  marginBottom: 6,
} satisfies CSSProperties

/** 字段标签（CreateHabitForm：marginBottom 4） */
export const labelStyleForm = {
  display: 'block',
  fontSize: 13,
  color: COLORS.textMuted,
  marginBottom: 4,
} satisfies CSSProperties

/** 主 CTA 按钮（Onboarding / AdoptPet，值一致） */
export const primaryBtn = {
  width: '100%',
  padding: '12px',
  borderRadius: 8,
  border: 'none',
  background: COLORS.accent,
  color: COLORS.white,
  fontSize: 16,
  fontWeight: 600,
  cursor: 'pointer',
} satisfies CSSProperties

/** 表单行（SettingsPanel / FoundationPanel，值一致） */
export const row = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  margin: '6px 0',
} satisfies CSSProperties
