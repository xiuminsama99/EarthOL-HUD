/**
 * 习惯相关的共享类型/常量（R13 P1 抽出，避免主壳与组件间循环引用）。
 */
import type { RejectReason } from '../../engine/types'

export interface Feedback {
  kind: 'ok' | 'warn'
  text: string
}

export const REJECT_LABEL: Record<RejectReason, string> = {
  'missing-note': '打卡记录不能为空',
  'insufficient-vacation-coins': '休息券不足：今天多做一点可以存休息券，存 1 张就能休息',
  'already-checked-in': '今天已经打过卡了，明天再来',
  'schedule-switched-today': '今天已切换过作息类型，今天不能再打卡',
}
