/**
 * 习惯模板库与年度效果换算（R5）
 *
 * 降建习惯门槛 + 持续激励：
 * - HABIT_TEMPLATES：预设微习惯模板，点选即预填表单（方向/名称/基准/单位）
 * - yearlyEffect：把「当前目标量」换算成 365 天累计效果文案
 *   （文档原话：「坚持 365 天 × 5 个 = 1825 个俯卧撑，你的身体正在变健康」）
 *
 * 纯逻辑模块：无 UI / 存储依赖，模板点选逻辑在表单组件（薄壳）。
 */
import type { HabitDirection } from '../../engine/types'

/** 习惯模板（建习惯表单预填源） */
export interface HabitTemplate {
  id: string
  /** 习惯名称（预填表单） */
  label: string
  /** 方向：养成（每天多做一点）/ 戒除（每天少做一点） */
  direction: HabitDirection
  /** 推荐起始基准（第 0 天目标量，只多不少原则） */
  baseAmount: number
  /** 计量单位（年度效果展示用） */
  unit: string
  /** 一句话激励文案（贴合不惩罚哲学） */
  tip: string
}

/** 常见计量单位（表单「单位」下拉选项，模板预填对应值） */
export const UNIT_OPTIONS: readonly string[] = ['次', '个', '步', '分钟', '元', '口', '杯', '页']

/** 预设模板库（MVP 起步；后续可扩展） */
export const HABIT_TEMPLATES: readonly HabitTemplate[] = [
  {
    id: 'pushup',
    label: '俯卧撑',
    direction: 'positive',
    baseAmount: 1,
    unit: '个',
    tip: '每天只多做一个，一年后身体会记住你的坚持',
  },
  {
    id: 'walking',
    label: '走路步数',
    direction: 'positive',
    baseAmount: 100,
    unit: '步',
    tip: '从 100 步开始，走到你觉得舒服就定死',
  },
  {
    id: 'less-snack',
    label: '少吃一口零食',
    direction: 'negative',
    baseAmount: 1,
    unit: '口',
    tip: '每天少一口，365 天后和过去的自己告别',
  },
  {
    id: 'less-phone',
    label: '戒刷手机',
    direction: 'negative',
    baseAmount: 5,
    unit: '分钟',
    tip: '每天少刷 5 分钟，把时间还给自己',
  },
  {
    id: 'saving',
    label: '存钱',
    direction: 'positive',
    baseAmount: 1,
    unit: '元',
    tip: '每天存 1 块，365 天就是 365 块的底气',
  },
  {
    id: 'water',
    label: '喝水',
    direction: 'positive',
    baseAmount: 1,
    unit: '杯',
    tip: '多喝一杯水，身体会给出温柔的回应',
  },
  {
    id: 'reading',
    label: '阅读页数',
    direction: 'positive',
    baseAmount: 1,
    unit: '页',
    tip: '每天一页，一年就是一本又一本的书',
  },
]

/**
 * 年度累计效果文案：按「当前目标量」换算 365 天累计。
 *
 * @param target 当日目标量（锁死后 = cap；未锁死 = 今日目标）
 * @param unit 计量单位（习惯字段 unit）
 * @returns 如「365 天累计 365 个」
 */
export function yearlyEffect(target: number, unit: string): string {
  const safeTarget = Number.isFinite(target) && target > 0 ? Math.floor(target) : 0
  const u = unit.trim() === '' ? '次' : unit.trim()
  return `365 天累计 ${safeTarget * 365} ${u}`
}
