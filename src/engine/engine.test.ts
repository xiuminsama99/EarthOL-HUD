/**
 * 微习惯引擎规则表测试（唯一测试接缝）
 *
 * 只断言输入 → 输出的外部行为，不测实现细节。
 * 规则来源：.scratch/earthol-hud/issues/01-habit-engine.md
 */
import { describe, expect, it } from 'vitest'
import {
  FORMED_DAYS,
  checkIn,
  getDailyTarget,
  lockCap,
  missedDays,
  resolveBusinessDate,
} from './engine'
import type { HabitState } from './types'

/** 构造默认习惯状态（正向、基准 1、未锁死、从未打卡） */
function habit(overrides: Partial<HabitState> = {}): HabitState {
  return {
    id: 'h1',
    name: '测试习惯',
    direction: 'positive',
    baseAmount: 1,
    cap: null,
    progressStep: 0,
    totalAmount: 0,
    consistencyDays: 0,
    formationDays: 0,
    isFormed: false,
    vacationCoins: 0,
    lastCheckinDate: null,
    createdAt: '2026-01-01',
    ...overrides,
  }
}

/** 默认注入时刻（本地时区 2026-01-13 10:00） */
const NOW = new Date(2026, 0, 13, 10, 0)

describe('规则 1：正向习惯按等差数列递增', () => {
  it('第 N 天目标量 = 起始基准 + N，每日只多做一个', () => {
    const cases = [
      { step: 0, expected: 1 }, // 第 0 天 = 基准
      { step: 1, expected: 2 },
      { step: 7, expected: 8 },
      { step: 30, expected: 31 },
    ]
    for (const { step, expected } of cases) {
      expect(getDailyTarget(habit({ progressStep: step }), '2026-01-13')).toBe(expected)
    }
  })

  it('打卡推进一步后，次日目标 +1', () => {
    const first = checkIn({ habit: habit(), now: NOW, schedule: 'day', amount: 1, note: '今天我以早起的人的身份，6 点起床' })
    expect(first.status).toBe('checked-in')
    expect(first.habit.progressStep).toBe(1)
    expect(getDailyTarget(first.habit, '2026-01-14')).toBe(2)
  })
})

describe('规则 2：反向习惯按等差数列递减', () => {
  it('第 N 天目标量 = 起始基准 - N，每日只多减一点', () => {
    const cases = [
      { step: 0, expected: 10 },
      { step: 1, expected: 9 },
      { step: 6, expected: 4 },
    ]
    for (const { step, expected } of cases) {
      expect(getDailyTarget(habit({ direction: 'negative', baseAmount: 10, progressStep: step }), '2026-01-13')).toBe(expected)
    }
  })

  it('递减不低于 0（不会出现负目标）', () => {
    expect(getDailyTarget(habit({ direction: 'negative', baseAmount: 3, progressStep: 5 }), '2026-01-13')).toBe(0)
  })
})

describe('规则 3：自认上限后目标量锁死', () => {
  it('锁死后目标恒等于 cap，不再随天数变化', () => {
    const locked = lockCap(habit({ baseAmount: 1, progressStep: 10 }), 5)
    expect(getDailyTarget(locked, '2026-01-13')).toBe(5)
    // 再打卡推进后目标仍为 5
    const next = checkIn({ habit: locked, now: NOW, schedule: 'day', amount: 5, note: '今日达标' })
    expect(next.status).toBe('checked-in')
    expect(next.targetAmount).toBe(5)
    expect(next.habit.progressStep).toBe(10) // 锁死后不再推进
    expect(getDailyTarget(next.habit, '2026-01-14')).toBe(5)
  })
})

describe('规则 4：连续未打卡 N 天后归来，目标回退 N 步且不退零', () => {
  it('缺勤 2 天归来，目标从原位置回退 2 步', () => {
    const h = habit({ progressStep: 10, lastCheckinDate: '2026-01-10' })
    // 2026-01-13 归来：gap=3, missed=2 → step 10-2=8 → 目标 1+8=9
    expect(missedDays(h, '2026-01-13')).toBe(2)
    expect(getDailyTarget(h, '2026-01-13')).toBe(9)
  })

  it('回退永不越过起点（触底仍为基准，不退零）', () => {
    const h = habit({ progressStep: 2, lastCheckinDate: '2026-01-10' })
    // 缺勤 9 天：step = max(0, 2-9) = 0 → 目标 = 基准 1
    expect(getDailyTarget(h, '2026-01-20')).toBe(1)
  })

  it('从未打卡：无缺勤，目标 = 基准', () => {
    expect(missedDays(habit(), '2026-01-13')).toBe(0)
    expect(getDailyTarget(habit(), '2026-01-13')).toBe(1)
  })

  it('隔日连续打卡：不视为缺勤', () => {
    const h = habit({ progressStep: 5, lastCheckinDate: '2026-01-12' })
    expect(missedDays(h, '2026-01-13')).toBe(0)
    expect(getDailyTarget(h, '2026-01-13')).toBe(6)
  })
})

describe('规则 5：超额 → 警告 + 超额量累计为假期币', () => {
  it('完成量超出目标：产出「不建议」警告，超额量入假期币，养成值不涨', () => {
    const h = habit({ progressStep: 2 }) // 目标 3
    const r = checkIn({ habit: h, now: NOW, schedule: 'day', amount: 8, note: '今天状态爆棚多做点' })
    expect(r.status).toBe('checked-in')
    expect(r.targetAmount).toBe(3)
    expect(r.overAmount).toBe(5)
    expect(r.vacationCoinsDelta).toBe(5)
    expect(r.habit.vacationCoins).toBe(5)
    expect(r.warning).toEqual({ kind: 'overachievement', message: '不建议，离目标更远' })
    expect(r.habit.totalAmount).toBe(8)
    expect(r.habit.consistencyDays).toBe(0) // 突击不涨养成值
  })

  it('恰好达标：无超额、无警告、不产币', () => {
    const r = checkIn({ habit: habit({ progressStep: 2 }), now: NOW, schedule: 'day', amount: 3, note: '今日达标' })
    expect(r.warning).toBeUndefined()
    expect(r.overAmount).toBe(0)
    expect(r.vacationCoinsDelta).toBe(0)
    expect(r.habit.vacationCoins).toBe(0)
  })
})

describe('规则 6：假期币可抵扣休息日', () => {
  it('休息日消耗 1 币：不计缺勤、不触发动态扣减、状态其余不变', () => {
    const h = habit({ progressStep: 5, vacationCoins: 3, formationDays: 4, lastCheckinDate: '2026-01-12' })
    const r = checkIn({ habit: h, now: NOW, schedule: 'day', amount: 0, note: '今天休息', restDay: true })
    expect(r.status).toBe('rest-day')
    expect(r.habit.vacationCoins).toBe(2)
    expect(r.habit.progressStep).toBe(5) // 不推进
    expect(r.habit.formationDays).toBe(4) // 不中断
    expect(r.habit.lastCheckinDate).toBe('2026-01-13') // 休息日记入已处理日
    // 次日归来不被视作缺勤（修复前：休息日未记录日期，隔天判缺勤）
    expect(missedDays(r.habit, '2026-01-14')).toBe(0)
    // 连休两天后再归来（1/13、1/14 均休息）：同样不判缺勤
    const r2 = checkIn({ habit: r.habit, now: new Date(2026, 0, 14, 10, 0), schedule: 'day', amount: 0, note: '再休一天', restDay: true })
    expect(r2.status).toBe('rest-day')
    expect(missedDays(r2.habit, '2026-01-15')).toBe(0)
  })

  it('假期币不足时休息被拒绝，状态不变', () => {
    const h = habit({ vacationCoins: 0 })
    const r = checkIn({ habit: h, now: NOW, schedule: 'day', amount: 0, note: '今天休息', restDay: true })
    expect(r.status).toBe('rejected')
    expect(r.reason).toBe('insufficient-vacation-coins')
    expect(r.habit).toBe(h)
  })
})

describe('规则 7：总量与养成值分离', () => {
  it('突击完成等差数列总和：总量计入、养成值不涨', () => {
    const h = habit({ progressStep: 2, totalAmount: 20, consistencyDays: 5, formationDays: 5 }) // 目标 3
    const r = checkIn({ habit: h, now: NOW, schedule: 'day', amount: 100, note: '一口气补上' })
    expect(r.habit.totalAmount).toBe(120) // 总量涨
    expect(r.habit.consistencyDays).toBe(5) // 养成值不涨
    expect(r.habit.formationDays).toBe(0) // 突击日中断养成连续
  })

  it('每日持续执行：总量与养成值都涨', () => {
    const h = habit({ progressStep: 2, totalAmount: 20, consistencyDays: 5, formationDays: 5 }) // 目标 3
    const r = checkIn({ habit: h, now: NOW, schedule: 'day', amount: 3, note: '今日达标' })
    expect(r.habit.totalAmount).toBe(23)
    expect(r.habit.consistencyDays).toBe(6)
    expect(r.habit.formationDays).toBe(6)
  })

  it('不足完成：总量涨、养成值不涨', () => {
    const h = habit({ progressStep: 2, consistencyDays: 5, formationDays: 5 }) // 目标 3
    const r = checkIn({ habit: h, now: NOW, schedule: 'day', amount: 1, note: '只做了一点' })
    expect(r.habit.totalAmount).toBe(1)
    expect(r.habit.consistencyDays).toBe(5)
    expect(r.habit.formationDays).toBe(0) // 未达标日中断
  })
})

describe('规则 8：21 天养成线，中途中断重计', () => {
  it(`连续 ${FORMED_DAYS} 天按等差数列执行 → 标记为已养成`, () => {
    const h = habit({ progressStep: 20, formationDays: FORMED_DAYS - 1, consistencyDays: FORMED_DAYS - 1, lastCheckinDate: '2026-01-12' })
    const r = checkIn({ habit: h, now: NOW, schedule: 'day', amount: getDailyTarget(h, '2026-01-13'), note: '第 21 天' })
    expect(r.status).toBe('checked-in')
    expect(r.habit.formationDays).toBe(FORMED_DAYS)
    expect(r.habit.isFormed).toBe(true)
    expect(r.formed).toBe(true)
  })

  it('缺勤中断：养成计数重新开始（与总量无关）', () => {
    const h = habit({ progressStep: 10, formationDays: 10, consistencyDays: 10, totalAmount: 55, lastCheckinDate: '2026-01-10' })
    // 2026-01-13 归来，缺勤 2 天
    const r = checkIn({ habit: h, now: NOW, schedule: 'day', amount: getDailyTarget(h, '2026-01-13'), note: '我回来了' })
    expect(r.habit.formationDays).toBe(1) // 重计为第 1 天
    expect(r.habit.consistencyDays).toBe(11) // 累计一致性不受中断影响
    expect(r.habit.totalAmount).toBe(55 + getDailyTarget(h, '2026-01-13'))
  })

  it('缺勤期间养成值清零，未达标日也不推进', () => {
    const h = habit({ formationDays: 7, lastCheckinDate: '2026-01-10' })
    const r = checkIn({ habit: h, now: NOW, schedule: 'day', amount: 0, note: '今天完全没做' })
    expect(r.habit.formationDays).toBe(0)
  })
})

describe('规则 9：打卡必须附一句话记录', () => {
  it('空记录被拒绝，状态不变', () => {
    const h = habit({ totalAmount: 10 })
    const r = checkIn({ habit: h, now: NOW, schedule: 'day', amount: 1, note: '' })
    expect(r.status).toBe('rejected')
    expect(r.reason).toBe('missing-note')
    expect(r.habit).toBe(h)
    expect(r.habit.totalAmount).toBe(10) // 无副作用
  })

  it('纯空白记录同样被拒绝', () => {
    const r = checkIn({ habit: habit(), now: NOW, schedule: 'day', amount: 1, note: '   ' })
    expect(r.status).toBe('rejected')
    expect(r.reason).toBe('missing-note')
  })

  it('带「今天我以 XX 身份做了 XX」记录则接受', () => {
    const r = checkIn({ habit: habit(), now: NOW, schedule: 'day', amount: 1, note: '今天我以早起的人的身份，6 点起床' })
    expect(r.status).toBe('checked-in')
  })
})

describe('规则 10：作息类型影响「今天」边界', () => {
  it('夜间工作者：凌晨 0:00-4:59 的操作归属昨日', () => {
    expect(resolveBusinessDate(new Date(2026, 0, 13, 0, 0), 'night')).toBe('2026-01-12')
    expect(resolveBusinessDate(new Date(2026, 0, 13, 4, 59), 'night')).toBe('2026-01-12')
  })

  it('夜间工作者：5:00 起归属当日', () => {
    expect(resolveBusinessDate(new Date(2026, 0, 13, 5, 0), 'night')).toBe('2026-01-13')
    expect(resolveBusinessDate(new Date(2026, 0, 13, 23, 59), 'night')).toBe('2026-01-13')
  })

  it('白天工作者：任何时刻归属当日', () => {
    expect(resolveBusinessDate(new Date(2026, 0, 13, 0, 30), 'day')).toBe('2026-01-13')
    expect(resolveBusinessDate(new Date(2026, 0, 13, 12, 0), 'day')).toBe('2026-01-13')
  })

  it('夜间工作者跨边界打卡：凌晨打卡记入昨日，不影响「今天」连续', () => {
    const h = habit({ progressStep: 4, lastCheckinDate: '2026-01-11' })
    const midnight = new Date(2026, 0, 13, 1, 30) // 业务日 01-12
    const r = checkIn({ habit: h, now: midnight, schedule: 'night', amount: getDailyTarget(h, '2026-01-12'), note: '深夜完成' })
    expect(r.status).toBe('checked-in')
    expect(r.habit.lastCheckinDate).toBe('2026-01-12') // 归昨日
    // 当日 08:00 再打卡 → 业务日 01-13，不重复
    const morning = checkIn({ habit: r.habit, now: new Date(2026, 0, 13, 8, 0), schedule: 'night', amount: getDailyTarget(r.habit, '2026-01-13'), note: '早上补今天的' })
    expect(morning.status).toBe('checked-in')
    expect(morning.habit.lastCheckinDate).toBe('2026-01-13')
  })
})

describe('规则 11：注入式时间参数', () => {
  it('引擎不读设备时间：同一状态 + 不同注入时间给出不同业务判定', () => {
    const h = habit({ progressStep: 3, lastCheckinDate: '2026-01-10' })
    // 缺勤天数由注入的 now 决定
    expect(missedDays(h, resolveBusinessDate(new Date(2026, 0, 12, 10, 0), 'day'))).toBe(1)
    expect(missedDays(h, resolveBusinessDate(new Date(2026, 0, 15, 10, 0), 'day'))).toBe(4)
    expect(getDailyTarget(h, '2026-01-15')).toBe(1 + Math.max(0, 3 - 4))
  })
})

describe('防御性领域约束', () => {
  it('同一业务日重复打卡被拒绝，状态不变', () => {
    const first = checkIn({ habit: habit(), now: NOW, schedule: 'day', amount: 1, note: '今日达标' })
    const dup = checkIn({ habit: first.habit, now: NOW, schedule: 'day', amount: 1, note: '再打一次' })
    expect(dup.status).toBe('rejected')
    expect(dup.reason).toBe('already-checked-in')
    expect(dup.habit).toBe(first.habit)
  })
})
