/**
 * 天平可视化与累积数字计算测试（工单 06）
 *
 * 纯函数规则表测试：只断言输入输出，不涉及 UI。
 * 覆盖：行动天数去重 / 休息日不计 / 达成率口径 / 总量 / 天平倾斜方向与钳制 /
 * 最近打卡语 / 全球 X% 示例数据区间。
 */
import { describe, expect, it } from 'vitest'
import type { HabitState } from '../../engine/types'
import type { CheckinRecord } from '../../storage/types'
import {
  DESIRE_BASELINE_DAYS,
  GLOBAL_PERCENT_MAX,
  GLOBAL_PERCENT_MIN,
  TILT_MAX_DEG,
  computeScaleData,
} from './scaleFlow'

function makeHabit(partial: Partial<HabitState> = {}): HabitState {
  return {
    id: 'h1',
    name: '每天读一页书',
    direction: 'positive',
    baseAmount: 1,
    unit: '次',
    cap: null,
    progressStep: 3,
    totalAmount: 0,
    consistencyDays: 0,
    formationDateList: [],
    formationDays: 0,
    isFormed: false,
    vacationCoins: 0,
    streakDays: 0,
    lastCheckinDate: null,
    actionCount: 0,
    createdAt: '2026-01-01',
    ...partial,
  }
}

function makeCheckin(partial: Partial<CheckinRecord>): CheckinRecord {
  return {
    id: 'c1',
    habitId: 'h1',
    businessDate: '2026-01-13',
    amount: 1,
    targetAmount: 1,
    note: '我以早起的人的身份完成了每天读一页书的第1次，离目标更近了一点点',
    restDay: false,
    mode: 'normal',
    createdAt: '2026-01-13T10:00:00.000Z',
    ...partial,
  }
}

describe('空数据', () => {
  it('从未行动：全零 / 无达成率 / 无打卡语 / 右盘下沉（向往更重）', () => {
    const scale = computeScaleData([], [])
    expect(scale.actionDays).toBe(0)
    expect(scale.actionCount).toBe(0)
    expect(scale.totalAmount).toBe(0)
    expect(scale.unit).toBe('次')
    expect(scale.achievedRate).toBeNull()
    expect(scale.leftValue).toBe(0)
    expect(scale.rightValue).toBe(DESIRE_BASELINE_DAYS)
    expect(scale.tiltDeg).toBeLessThan(0)
    expect(scale.globalPercent).toBe(GLOBAL_PERCENT_MIN)
    expect(scale.latestNote).toBeNull()
  })
})

describe('行动天数（身份一致性口径）', () => {
  it('同日多条记录只算 1 天（按业务日去重）', () => {
    const scale = computeScaleData([], [
      makeCheckin({ businessDate: '2026-01-13' }),
      makeCheckin({ id: 'c2', businessDate: '2026-01-13' }),
    ])
    expect(scale.actionDays).toBe(1)
    expect(scale.actionCount).toBe(2)
  })

  it('跨天记录累计天数', () => {
    const scale = computeScaleData([], [
      makeCheckin({ businessDate: '2026-01-11' }),
      makeCheckin({ id: 'c2', businessDate: '2026-01-12' }),
      makeCheckin({ id: 'c3', businessDate: '2026-01-13' }),
    ])
    expect(scale.actionDays).toBe(3)
  })

  it('休息日不计入行动天数与次数', () => {
    const scale = computeScaleData([], [
      makeCheckin({ businessDate: '2026-01-12' }),
      makeCheckin({ id: 'c2', businessDate: '2026-01-13', restDay: true, amount: 0, targetAmount: 1 }),
    ])
    expect(scale.actionDays).toBe(1)
    expect(scale.actionCount).toBe(1)
  })
})

describe('目标达成率与总量', () => {
  it('达标（完成量 >= 目标量）计入达成，未达标不计', () => {
    const scale = computeScaleData([], [
      makeCheckin({ amount: 1, targetAmount: 1 }), // 达标
      makeCheckin({ id: 'c2', businessDate: '2026-01-12', amount: 0, targetAmount: 1 }), // 未达标
      makeCheckin({ id: 'c3', businessDate: '2026-01-11', amount: 2, targetAmount: 1 }), // 超额也算达标
    ])
    expect(scale.achievedRate).toBe(67) // 2/3
  })

  it('总量来自全部习惯 totalAmount 之和', () => {
    const habits = [
      makeHabit({ id: 'h1', totalAmount: 12 }),
      makeHabit({ id: 'h2', totalAmount: 30 }),
    ]
    expect(computeScaleData(habits, []).totalAmount).toBe(42)
  })

  it('N4：单位不一致回退「次」（避免多单位混用）；无习惯默认「次」', () => {
    const habits = [
      makeHabit({ id: 'h1', unit: '个' }),
      makeHabit({ id: 'h2', unit: '页' }),
    ]
    expect(computeScaleData(habits, []).unit).toBe('次')
    expect(computeScaleData([], []).unit).toBe('次')
  })

  it('N4：全部习惯单位一致时用该单位', () => {
    const habits = [
      makeHabit({ id: 'h1', unit: '个' }),
      makeHabit({ id: 'h2', unit: '个' }),
    ]
    expect(computeScaleData(habits, []).unit).toBe('个')
  })

  it('N4：空白单位忽略不计，剩余单位一致时用该单位', () => {
    const habits = [
      makeHabit({ id: 'h1', unit: '' }),
      makeHabit({ id: 'h2', unit: '个' }),
    ]
    expect(computeScaleData(habits, []).unit).toBe('个')
  })
})

describe('天平倾斜', () => {
  it('行动满向往基准：天平平衡（0 度）', () => {
    const checkins = Array.from({ length: DESIRE_BASELINE_DAYS }, (_, i) =>
      makeCheckin({
        id: `c${i}`,
        businessDate: `2026-01-${String(i + 7).padStart(2, '0')}`,
      }),
    )
    const scale = computeScaleData([], checkins)
    expect(scale.leftValue).toBe(DESIRE_BASELINE_DAYS)
    expect(scale.tiltDeg).toBe(0)
  })

  it('行动超过基准：左盘下沉（倾斜为正）', () => {
    const checkins = Array.from({ length: DESIRE_BASELINE_DAYS + 2 }, (_, i) =>
      makeCheckin({
        id: `c${i}`,
        businessDate: `2026-01-${String(i + 7).padStart(2, '0')}`,
      }),
    )
    const scale = computeScaleData([], checkins)
    expect(scale.tiltDeg).toBeGreaterThan(0)
  })

  it('行动不足基准：右盘下沉，且倾斜角钳制在最大值内', () => {
    const scale = computeScaleData([], [])
    expect(scale.tiltDeg).toBe(-TILT_MAX_DEG)
  })
})

describe('全球 X%（示例数据）', () => {
  it('达成率越高「超过越多玩家」，且始终落在区间内', () => {
    const low = computeScaleData([], [makeCheckin({ amount: 0, targetAmount: 1 })])
    const high = computeScaleData([], [
      makeCheckin({ amount: 1, targetAmount: 1 }),
      makeCheckin({ id: 'c2', businessDate: '2026-01-12', amount: 1, targetAmount: 1 }),
    ])
    expect(low.globalPercent).toBeGreaterThanOrEqual(GLOBAL_PERCENT_MIN)
    expect(high.globalPercent).toBeGreaterThan(low.globalPercent)
    expect(high.globalPercent).toBeLessThanOrEqual(GLOBAL_PERCENT_MAX)
  })
})

describe('最近打卡语', () => {
  it('取 createdAt 最新的行动记录，休息日忽略', () => {
    const scale = computeScaleData([], [
      makeCheckin({ note: '较早的记录', createdAt: '2026-01-12T10:00:00.000Z' }),
      makeCheckin({
        id: 'c2',
        businessDate: '2026-01-13',
        note: '最新的记录',
        createdAt: '2026-01-13T10:00:00.000Z',
      }),
      makeCheckin({
        id: 'c3',
        businessDate: '2026-01-14',
        note: '休息日记录（应忽略）',
        restDay: true,
        amount: 0,
        createdAt: '2026-01-14T10:00:00.000Z',
      }),
    ])
    expect(scale.latestNote).toBe('最新的记录')
  })
})

describe('R-4：最近 7 天行动率', () => {
  it('近 7 天（含今天）行动天数 / 7；不传 today 为 null', () => {
    const checkins = [
      makeCheckin({ businessDate: '2026-01-07' }),
      makeCheckin({ id: 'c2', businessDate: '2026-01-08' }),
      makeCheckin({ id: 'c3', businessDate: '2026-01-09' }),
      makeCheckin({ id: 'c4', businessDate: '2026-01-10' }),
      makeCheckin({ id: 'c5', businessDate: '2026-01-11' }),
      makeCheckin({ id: 'c6', businessDate: '2026-01-12' }),
    ]
    // today=01-13：近 7 天 = 01-07..01-13，6 天有行动 → 86%
    expect(computeScaleData([], checkins, '2026-01-13').weeklyActionRate).toBe(86)
    // 不传 today → null
    expect(computeScaleData([], checkins).weeklyActionRate).toBeNull()
  })

  it('今天未行动也计入分母（含漏卡）', () => {
    const checkins = [
      makeCheckin({ businessDate: '2026-01-10' }),
      makeCheckin({ id: 'c2', businessDate: '2026-01-11' }),
    ]
    // today=01-13：近 7 天 = 01-07..01-13；01-10、01-11 行动 → 2/7 = 29%
    expect(computeScaleData([], checkins, '2026-01-13').weeklyActionRate).toBe(29)
  })
})


describe('R10b-2 多习惯：仪表盘汇总口径（行动天数/总量）合并全部习惯', () => {
  it('行动天数 = 任意习惯有打卡的天数（去重，跨习惯同天只算一天）', () => {
    const habits = [
      makeHabit({ id: 'h1', name: '阅读' }),
      makeHabit({ id: 'h2', name: '俯卧撑' }),
    ]
    const checkins = [
      makeCheckin({ id: 'c1', habitId: 'h1', businessDate: '2026-01-10' }),
      makeCheckin({ id: 'c2', habitId: 'h2', businessDate: '2026-01-10' }), // 同日第二习惯
      makeCheckin({ id: 'c3', habitId: 'h2', businessDate: '2026-01-11' }),
    ]
    const scale = computeScaleData(habits, checkins)
    expect(scale.actionDays).toBe(2) // 01-10、01-11，同日去重
    expect(scale.actionCount).toBe(3)
  })

  it('总量 = 全部习惯 totalAmount 之和（换习惯不缩水）', () => {
    const habits = [
      makeHabit({ id: 'h1', totalAmount: 12 }),
      makeHabit({ id: 'h2', totalAmount: 30 }),
      makeHabit({ id: 'h3', totalAmount: 8 }),
    ]
    expect(computeScaleData(habits, []).totalAmount).toBe(50)
  })
})
