/**
 * 微习惯引擎规则表测试（唯一测试接缝）
 *
 * 只断言输入 → 输出的外部行为，不测实现细节。
 * 规则来源：.scratch/earthol-hud/issues/01-habit-engine.md
 */
import { describe, expect, it } from 'vitest'
import {
  ANNUAL_PROJECTION_DAYS,
  FORMATION_THRESHOLD,
  buildAutoNote,
  checkIn,
  getDailyTarget,
  lockCap,
  missedDays,
  projectAnnual,
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
    unit: '次',
    cap: null,
    progressStep: 0,
    totalAmount: 0,
    consistencyDays: 0,
    formationDateList: [],
    formationDays: 0,
    isFormed: false,
    vacationCoins: 0,
    lastCheckinDate: null,
    actionCount: 0,
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
    // B3：入币上限 = 当日目标量 → 超额 5 中只转 3 币
    expect(r.vacationCoinsDelta).toBe(3)
    expect(r.habit.vacationCoins).toBe(3)
    expect(r.warning).toEqual({ kind: 'overachievement', message: '储蓄日：多做一点，进度冻结不惩罚' })
    expect(r.habit.totalAmount).toBe(8)
    expect(r.habit.consistencyDays).toBe(0) // 突击不涨养成值
  })

  it('B3：超额量超过当日目标 2 倍以上，入币仍不超过目标量（防刷币）', () => {
    const h = habit({ progressStep: 2 }) // 目标 3
    const r = checkIn({ habit: h, now: NOW, schedule: 'day', amount: 100, note: '疯狂超额' })
    expect(r.status).toBe('checked-in')
    expect(r.overAmount).toBe(97) // 警告仍显示真实超额量
    expect(r.vacationCoinsDelta).toBe(3) // 币上限 = 目标 3
    expect(r.habit.vacationCoins).toBe(3)
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
  it('突击完成等差数列总和：总量计入、养成值不涨，窗口冻结（不清零）', () => {
    // 窗口已有 2 个达标日（01-11、01-12），今日目标 3，突击做 100 → 未达标、窗口冻结、总量涨
    const h = habit({ progressStep: 2, totalAmount: 20, consistencyDays: 5, formationDateList: ['2026-01-11', '2026-01-12'] }) // 目标 3
    const r = checkIn({ habit: h, now: NOW, schedule: 'day', amount: 100, note: '一口气补上' })
    expect(r.habit.totalAmount).toBe(120) // 总量涨
    expect(r.habit.consistencyDays).toBe(5) // 养成值不涨
    expect(r.habit.formationDateList).toEqual(['2026-01-11', '2026-01-12']) // 冻结不清零
    expect(r.habit.formationDays).toBe(2)
  })

  it('每日达标：总量与养成值都涨，窗口追加达标日', () => {
    const h = habit({ progressStep: 2, totalAmount: 20, consistencyDays: 5, formationDateList: ['2026-01-11', '2026-01-12'] }) // 目标 3
    const r = checkIn({ habit: h, now: NOW, schedule: 'day', amount: 3, note: '今日达标' })
    expect(r.habit.totalAmount).toBe(23)
    expect(r.habit.consistencyDays).toBe(6)
    expect(r.habit.formationDays).toBe(3)
    expect(r.habit.formationDateList).toEqual(['2026-01-11', '2026-01-12', '2026-01-13'])
  })

  it('不足完成：总量涨、养成值不涨，窗口冻结', () => {
    const h = habit({ progressStep: 2, consistencyDays: 5, formationDateList: ['2026-01-12'] }) // 目标 3
    const r = checkIn({ habit: h, now: NOW, schedule: 'day', amount: 1, note: '只做了一点' })
    expect(r.habit.totalAmount).toBe(1)
    expect(r.habit.consistencyDays).toBe(5)
    expect(r.habit.formationDateList).toEqual(['2026-01-12']) // 冻结不清零
    expect(r.habit.formationDays).toBe(1)
  })
})

describe('规则 8：21 天滑动窗口养成制（R-1：达标 ≥14 天养成，冻结不惩罚）', () => {
  it(`窗口内达标满 ${FORMATION_THRESHOLD} 天 → 已养成`, () => {
    const dates = ['2025-12-31', '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10', '2026-01-11', '2026-01-12']
    const h = habit({ progressStep: 20, consistencyDays: dates.length, formationDateList: dates, lastCheckinDate: '2026-01-12' })
    const r = checkIn({ habit: h, now: NOW, schedule: 'day', amount: getDailyTarget(h, '2026-01-13'), note: '第 14 天' })
    expect(r.status).toBe('checked-in')
    expect(r.habit.formationDays).toBe(14)
    expect(r.habit.isFormed).toBe(true)
    expect(r.formed).toBe(true)
  })

  it('未达标日不清零已有窗口（冻结）', () => {
    const h = habit({ progressStep: 10, formationDateList: ['2026-01-11', '2026-01-12'], consistencyDays: 2, lastCheckinDate: '2026-01-12' })
    const r = checkIn({ habit: h, now: NOW, schedule: 'day', amount: getDailyTarget(h, '2026-01-13') + 5, note: '今天多做点' })
    expect(r.status).toBe('checked-in')
    expect(r.habit.formationDays).toBe(2) // 冻结不清零
    expect(r.habit.consistencyDays).toBe(2)
  })

  it('缺勤归来：窗口保留已有达标日，只追加今日达标（不清零）', () => {
    const h = habit({ progressStep: 10, formationDateList: ['2026-01-10', '2026-01-11', '2026-01-12'], consistencyDays: 10, totalAmount: 55, lastCheckinDate: '2026-01-10' })
    // 2026-01-13 归来，缺勤 2 天（01-11、01-12 本应打卡但缺勤）
    const r = checkIn({ habit: h, now: NOW, schedule: 'day', amount: getDailyTarget(h, '2026-01-13'), note: '我回来了' })
    expect(r.habit.formationDays).toBe(4) // 保留 3 个 + 今日达标 = 4
    expect(r.habit.consistencyDays).toBe(11) // 累计一致性不受中断影响
    expect(r.habit.totalAmount).toBe(55 + getDailyTarget(h, '2026-01-13'))
  })

  it('缺勤只清窗口外的旧达标日（窗口自然滑动）', () => {
    // 达标日 01-01（距今日 12 天）仍在窗口内；造一个更老的 12-20（距今日 24 天）被窗口剔除
    const h = habit({ formationDateList: ['2025-12-20'], lastCheckinDate: '2026-01-10' })
    const r = checkIn({ habit: h, now: NOW, schedule: 'day', amount: 0, note: '今天完全没做' })
    expect(r.habit.formationDateList).toEqual([]) // 老达标日被窗口剔除
    expect(r.habit.formationDays).toBe(0)
  })

  it('养成后不被单个未达标/超额日撤销（isFormed 保持）', () => {
    // 13 个达标日（含 01-12） + 今日 01-13 达标 = 14 → 养成；随后未达标一天仍保持已养成
    const dates = ['2025-12-31', '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10', '2026-01-11', '2026-01-12']
    const formed = checkIn({ habit: habit({ progressStep: 20, formationDateList: dates, lastCheckinDate: '2026-01-12' }), now: NOW, schedule: 'day', amount: getDailyTarget(habit({ progressStep: 20, formationDateList: dates, lastCheckinDate: '2026-01-12' }), '2026-01-13'), note: '养成' })
    expect(formed.habit.isFormed).toBe(true)
    // 次日未达标（做 1 < 目标 22）
    const next = checkIn({ habit: formed.habit, now: new Date(2026, 0, 14, 10, 0), schedule: 'day', amount: 1, note: '状态差' })
    expect(next.status).toBe('checked-in')
    expect(next.habit.isFormed).toBe(true) // 已养成保持
    expect(next.habit.formationDays).toBe(14) // 冻结，不清零（窗口内仍有 14 个达标日）
  })
})

describe('R-2：连续达标 7 天赠 1 张休息券', () => {
  it('连续达标第 7 天 → +1 券（达成日当天发放）', () => {
    const dates = ['2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10', '2026-01-11', '2026-01-12']
    const h = habit({ progressStep: 6, formationDateList: dates, lastCheckinDate: '2026-01-12' })
    const r = checkIn({ habit: h, now: NOW, schedule: 'day', amount: getDailyTarget(h, '2026-01-13'), note: '第 7 天' })
    expect(r.status).toBe('checked-in')
    expect(r.vacationCoinsDelta).toBe(0) // 达标日无超额币
    expect(r.habit.vacationCoins).toBe(1) // 连续 7 天赠 1 券
    expect(r.habit.formationDays).toBe(7)
  })

  it('未满 7 天不赠券（连续断档则重计）', () => {
    const h = habit({ progressStep: 3, formationDateList: ['2026-01-10', '2026-01-11'], lastCheckinDate: '2026-01-11' })
    const r = checkIn({ habit: h, now: NOW, schedule: 'day', amount: getDailyTarget(h, '2026-01-13'), note: '断档后归来' })
    expect(r.status).toBe('checked-in')
    expect(r.vacationCoinsDelta).toBe(0)
    expect(r.habit.vacationCoins).toBe(0)
  })
})

describe('R-3：戒除习惯触底 0 直接养成', () => {
  it('反向习惯目标推进到 0 当天 → 已养成 ✓ ', () => {
    const h = habit({ direction: 'negative', baseAmount: 6, progressStep: 5 }) // 目标 1；打完此次推至 0
    const r = checkIn({ habit: h, now: NOW, schedule: 'day', amount: getDailyTarget(h, '2026-01-13'), note: '最后一减' })
    expect(r.status).toBe('checked-in')
    // 目标 = base - step = 6 - (5+1) = 0
    expect(r.habit.progressStep).toBe(6)
    expect(r.habit.isFormed).toBe(true)
    expect(r.formed).toBe(true)
  })

  it('未触底（目标仍 > 0）不养成', () => {
    const h = habit({ direction: 'negative', baseAmount: 10, progressStep: 2 })
    const r = checkIn({ habit: h, now: NOW, schedule: 'day', amount: getDailyTarget(h, '2026-01-13'), note: '持续减少' })
    expect(r.status).toBe('checked-in')
    expect(r.habit.isFormed).toBe(false)
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

describe('规则 3 扩展：可调锁死（2026-08 产品反馈）', () => {
  it('锁死后可重复调用 lockCap 调整上限：调高 / 调低 / 调回起点档', () => {
    let h = lockCap(habit({ baseAmount: 3, progressStep: 10 }), 10)
    expect(getDailyTarget(h, '2026-01-13')).toBe(10)
    h = lockCap(h, 15) // 调高
    expect(h.cap).toBe(15)
    expect(getDailyTarget(h, '2026-01-13')).toBe(15)
    h = lockCap(h, 4) // 调低（仍 ≥ 基准 3）
    expect(h.cap).toBe(4)
    expect(getDailyTarget(h, '2026-01-13')).toBe(4)
    h = lockCap(h, 3) // 调回基准（起点档，边界允许）
    expect(getDailyTarget(h, '2026-01-13')).toBe(3)
  })

  it('调整 cap 只改 cap 字段，不影响已积累的养成值 / 总量', () => {
    const h = lockCap(
      habit({
        baseAmount: 3,
        progressStep: 10,
        totalAmount: 55,
        consistencyDays: 9,
        formationDays: 9,
      }),
      12,
    )
    const adjusted = lockCap(h, 8)
    expect(adjusted.cap).toBe(8)
    expect(adjusted.totalAmount).toBe(55)
    expect(adjusted.consistencyDays).toBe(9)
    expect(adjusted.formationDays).toBe(9)
    expect(adjusted.progressStep).toBe(10)
    expect(adjusted.isFormed).toBe(false)
  })
})

describe('打卡语自动生成（2026-08 产品反馈）', () => {
  it('未传 note：自动生成基础打卡语（首日 N=1）', () => {
    const r = checkIn({ habit: habit(), now: NOW, schedule: 'day', amount: 1, identity: '早起的人' })
    expect(r.status).toBe('checked-in')
    expect(r.note).toBe('今天以早起的人的身份行动了：测试习惯 · 第1次，离向往的自己又近了一点点')
  })

  it('第 N 日：N 随真实打卡成功次数（actionCount）增长', () => {
    const h = habit({ actionCount: 3, progressStep: 3, lastCheckinDate: '2026-01-12' })
    const r = checkIn({
      habit: h,
      now: NOW,
      schedule: 'day',
      amount: getDailyTarget(h, '2026-01-13'),
      identity: '早起的人',
    })
    expect(r.status).toBe('checked-in')
    expect(r.note).toContain('第4次')
  })

  it('超额：自动并入「还多做了 X 单位」', () => {
    const h = habit({ actionCount: 2, progressStep: 2 }) // 今日目标 3
    const r = checkIn({ habit: h, now: NOW, schedule: 'day', amount: 8, identity: '早起的人' })
    expect(r.status).toBe('checked-in')
    expect(r.note).toContain('第3次')
    expect(r.note).toContain('还多做了5次')
  })

  it('身份缺失：兜底用习惯名', () => {
    const r = checkIn({ habit: habit({ name: '每天读一页书' }), now: NOW, schedule: 'day', amount: 1 })
    expect(r.status).toBe('checked-in')
    expect(r.note).toContain('每天读一页书')
    expect(r.note).toContain('第1次')
  })

  it('用户编辑覆盖：传非空 note 使用用户文本', () => {
    const r = checkIn({ habit: habit(), now: NOW, schedule: 'day', amount: 1, note: '今天读了 3 页，很爽' })
    expect(r.status).toBe('checked-in')
    expect(r.note).toBe('今天读了 3 页，很爽')
  })

  it('用户显式传空白字符串仍拒绝（missing-note），result.note 为空串', () => {
    const r = checkIn({ habit: habit(), now: NOW, schedule: 'day', amount: 1, note: '   ' })
    expect(r.status).toBe('rejected')
    expect(r.reason).toBe('missing-note')
    expect(r.note).toBe('')
  })

  it('休息日未传 note：自动生成休息文案', () => {
    const h = habit({ vacationCoins: 2, lastCheckinDate: '2026-01-12' })
    const r = checkIn({
      habit: h,
      now: NOW,
      schedule: 'day',
      amount: 0,
      restDay: true,
      identity: '早起的人',
    })
    expect(r.status).toBe('rest-day')
    expect(r.note).toContain('休息')
    expect(r.note).toContain('早起的人')
  })

  it('buildAutoNote 直接断言：首日 / 第 N 日 / 超额 / 身份兜底', () => {
    expect(buildAutoNote(habit({ name: '俯卧撑', actionCount: 0 }), '健康的人')).toBe(
      '今天以健康的人的身份行动了：俯卧撑 · 第1次，离向往的自己又近了一点点',
    )
    expect(buildAutoNote(habit({ name: '俯卧撑', actionCount: 5 }), '健康的人')).toBe(
      '今天以健康的人的身份行动了：俯卧撑 · 第5次，离向往的自己又近了一点点',
    )
    expect(buildAutoNote(habit({ name: '俯卧撑', actionCount: 3 }), null, 2)).toBe(
      '今天以俯卧撑的身份行动了：俯卧撑 · 第3次，还多做了2次，离向往的自己又近了一点点',
    )
  })
})


describe('A4：打卡语次数 = 真实执行次数（actionCount，独立于 progressStep）', () => {
  it('锁死后 progressStep 冻结但打卡语次数继续累计', () => {
    const locked = lockCap(habit({ baseAmount: 1, actionCount: 6, progressStep: 6, lastCheckinDate: '2026-01-12' }), 5)
    const r = checkIn({ habit: locked, now: NOW, schedule: 'day', amount: 5, identity: '早起的人' })
    expect(r.status).toBe('checked-in')
    expect(r.habit.progressStep).toBe(6) // 锁死不推进
    expect(r.habit.actionCount).toBe(7) // 但真实执行次数照涨
    expect(r.note).toContain('第7次')
  })

  it('缺勤回退不影响真实执行次数', () => {
    const h = habit({ progressStep: 10, actionCount: 3, lastCheckinDate: '2026-01-10' })
    const r = checkIn({
      habit: h,
      now: NOW,
      schedule: 'day',
      amount: getDailyTarget(h, '2026-01-13'),
      identity: '早起的人',
    })
    expect(r.status).toBe('checked-in')
    expect(r.habit.actionCount).toBe(4)
    expect(r.note).toContain('第4次') // 真实第 4 次
  })

  it('休息日不累计 actionCount', () => {
    const h = habit({ vacationCoins: 2, actionCount: 5, lastCheckinDate: '2026-01-12' })
    const r = checkIn({ habit: h, now: NOW, schedule: 'day', amount: 0, restDay: true })
    expect(r.status).toBe('rest-day')
    expect(r.habit.actionCount).toBe(5)
  })

  it('rejected 不动 actionCount', () => {
    const h = habit({ actionCount: 4, lastCheckinDate: '2026-01-12' })
    const r = checkIn({ habit: h, now: NOW, schedule: 'day', amount: 1, note: '' })
    expect(r.status).toBe('rejected')
    expect(r.habit.actionCount).toBe(4)
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

// B2：固定业务时区，与设备时区无关（防改设备时区作弊）
describe('B2：业务日固定按业务时区计算', () => {
  it('同一网络时刻（UTC 构造）不同业务时区 → 各按其时区得到正确业务日', () => {
    // 2026-01-12T16:30Z = Asia/Shanghai 01-13 00:30 / Asia/Tokyo 01-13 01:30 / UTC 01-12 16:30
    const instant = new Date('2026-01-12T16:30:00Z')
    expect(resolveBusinessDate(instant, 'day', 'Asia/Shanghai')).toBe('2026-01-13')
    expect(resolveBusinessDate(instant, 'night', 'Asia/Shanghai')).toBe('2026-01-12')
    expect(resolveBusinessDate(instant, 'day', 'Asia/Tokyo')).toBe('2026-01-13')
    expect(resolveBusinessDate(instant, 'day', 'UTC')).toBe('2026-01-12')
  })

  it('默认业务时区 Asia/Shanghai：夜间边界（凌晨 0-4:59 归昨日）按业务时区小时判定', () => {
    // 01-12T16:00Z = Shanghai 01-13 00:00 → 夜间归昨日 01-12
    expect(resolveBusinessDate(new Date('2026-01-12T16:00:00Z'), 'night')).toBe('2026-01-12')
    // 01-12T21:00Z = Shanghai 01-13 05:00 → 归属当日 01-13
    expect(resolveBusinessDate(new Date('2026-01-12T21:00:00Z'), 'night')).toBe('2026-01-13')
  })

  it('业务日计算与设备本地时区无关：同一 Date 对象任何设备时区结果相同', () => {
    // Date 由 UTC 字符串构造，其绝对时刻固定；resolveBusinessDate 只用 timeZone 参数
    const instant = new Date('2026-01-13T00:00:00Z')
    expect(resolveBusinessDate(instant, 'day')).toBe('2026-01-13')
    expect(resolveBusinessDate(instant, 'night')).toBe('2026-01-13')
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

describe('R4：最低版本（minimal mode）', () => {
  it('保底行动：actionCount+1、总量累计，但 progressStep/养成线/一致性均不动', () => {
    const h = habit({
      progressStep: 5,
      formationDays: 9,
      consistencyDays: 9,
      totalAmount: 20,
      actionCount: 8,
      lastCheckinDate: '2026-01-12',
    })
    const r = checkIn({ habit: h, now: NOW, schedule: 'day', amount: 1, mode: 'minimal' })
    expect(r.status).toBe('checked-in')
    expect(r.mode).toBe('minimal')
    expect(r.habit.actionCount).toBe(9) // 行动日 +1
    expect(r.habit.totalAmount).toBe(21) // 如实累计
    expect(r.habit.progressStep).toBe(5) // 不推进（明日目标不变）
    expect(r.habit.formationDays).toBe(9) // 保持：不推进也不归零
    expect(r.habit.consistencyDays).toBe(9) // 不涨
    expect(r.habit.vacationCoins).toBe(0) // 无币
    expect(r.habit.lastCheckinDate).toBe('2026-01-13')
    expect(r.warning).toBeUndefined() // 无超额警告
    expect(r.overAmount).toBe(0)
    expect(r.vacationCoinsDelta).toBe(0)
    expect(r.formed).toBe(false)
  })

  it('打卡语自动生成（最低版本文案），身份未设置时兜底用习惯名', () => {
    const h = habit({ progressStep: 5, actionCount: 8, lastCheckinDate: '2026-01-12' })
    const r = checkIn({ habit: h, now: NOW, schedule: 'day', amount: 1, mode: 'minimal' })
    expect(r.note).toContain('状态不太好也没关系，做了一点点')
    expect(r.note).toContain('测试习惯')
  })

  it('身份宣言存在时打卡语用身份', () => {
    const h = habit({ lastCheckinDate: '2026-01-12' })
    const r = checkIn({ habit: h, now: NOW, schedule: 'day', amount: 1, mode: 'minimal', identity: '健康的人' })
    expect(r.note).toContain('今天也算行动了')
    expect(r.note).toContain('健康的人')
  })

  it('同日防重：minimal 后当天不能再打卡（normal 或 minimal 均拒绝）', () => {
    const first = checkIn({ habit: habit({ lastCheckinDate: '2026-01-12' }), now: NOW, schedule: 'day', amount: 1, mode: 'minimal' })
    expect(first.status).toBe('checked-in')
    const dup = checkIn({ habit: first.habit, now: NOW, schedule: 'day', amount: 1 })
    expect(dup.status).toBe('rejected')
    expect(dup.reason).toBe('already-checked-in')
  })

  it('normal 打卡后当天不能再走 minimal（防重一致）', () => {
    const first = checkIn({ habit: habit(), now: NOW, schedule: 'day', amount: 1, note: '今日达标' })
    const dup = checkIn({ habit: first.habit, now: NOW, schedule: 'day', amount: 1, mode: 'minimal' })
    expect(dup.status).toBe('rejected')
    expect(dup.reason).toBe('already-checked-in')
  })

  it('次日恢复达标：养成窗口从保持的位置继续推进（不丢进度）', () => {
    const minimal = checkIn({
      habit: habit({ progressStep: 5, formationDateList: ['2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10', '2026-01-11'], lastCheckinDate: '2026-01-12' }),
      now: NOW,
      schedule: 'day',
      amount: 1,
      mode: 'minimal',
    })
    // 次日（2026-01-14）达标打卡：目标 = 基准 1 + step 5 = 6
    const next = checkIn({
      habit: minimal.habit,
      now: new Date(2026, 0, 14, 10, 0),
      schedule: 'day',
      amount: 6,
    })
    expect(next.status).toBe('checked-in')
    expect(next.habit.formationDays).toBe(10) // minimal 不动窗口，次日达标追加 1 个新日（01-03..01-11 共 9 个 + 01-14）
  })

  it('restDay 优先：restDay=true 且 mode=minimal 时走休息分支（不记行动日）', () => {
    const h = habit({ vacationCoins: 2, actionCount: 5, lastCheckinDate: '2026-01-12' })
    const r = checkIn({ habit: h, now: NOW, schedule: 'day', amount: 1, mode: 'minimal', restDay: true })
    expect(r.status).toBe('rest-day')
    expect(r.mode).toBe('normal')
    expect(r.habit.actionCount).toBe(5)
    expect(r.habit.vacationCoins).toBe(1)
  })

  it('minimal 不产生缺勤回退：次日目标从原位置继续', () => {
    const h = habit({ progressStep: 5, lastCheckinDate: '2026-01-12' })
    const r = checkIn({ habit: h, now: NOW, schedule: 'day', amount: 1, mode: 'minimal' })
    expect(r.status).toBe('checked-in')
    expect(getDailyTarget(r.habit, '2026-01-14')).toBe(1 + 5) // 基准 1 + step 5，未回退未推进
  })

  it('rejected（note 为空串）时透出请求的 mode', () => {
    const h = habit({ lastCheckinDate: '2026-01-12' })
    const r = checkIn({ habit: h, now: NOW, schedule: 'day', amount: 1, mode: 'minimal', note: '   ' })
    expect(r.status).toBe('rejected')
    expect(r.mode).toBe('minimal')
  })
})

describe('年度投影 projectAnnual（工单 13：一年之约）', () => {
  it('base=1 无上限：idealAnnual = 1+2+…+365 等差和 = 66795', () => {
    const h = habit({ direction: 'positive', baseAmount: 1, createdAt: '2026-01-01' })
    const p = projectAnnual(h, '2026-01-01')
    expect(p.dayIndex).toBe(1)
    expect(p.idealAnnual).toBe(66795)
    expect(p.achievedTotal).toBe(0)
    expect(p.todayTarget).toBe(1)
  })

  it('cap=30（锁死）：理想/预计恒为 cap×365（无递增段，因为锁死即每天恒 cap）', () => {
    const h = habit({ direction: 'positive', baseAmount: 1, cap: 30, createdAt: '2026-01-01' })
    const p = projectAnnual(h, '2026-01-01')
    expect(p.idealAnnual).toBe(30 * 365)
    expect(p.todayTarget).toBe(30)
  })

  it('第 30 天中途：projected = 已累计 + 按今日目标轨迹到第 365 天', () => {
    // 已打卡 30 天累计 1+…+30 = 465；今日目标 31？第 30 天目标 = base1 + step29 = 30
    // 设 progressStep=29（今日目标 30），已累计 465；剩余天数 = 365 - 30 + 1 = 336
    // 轨迹：明日 31 … 第 365 天 365。sum = 30*(365+30)/2 - ... 用 /2 手算避免浮点
    const todayTarget = getDailyTarget(habit({ progressStep: 29 }), '2026-01-30')
    expect(todayTarget).toBe(30)
    const h = habit({ direction: 'positive', baseAmount: 1, progressStep: 29, totalAmount: 465, createdAt: '2026-01-01' })
    const p = projectAnnual(h, '2026-01-30')
    expect(p.dayIndex).toBe(30)
    // 剩余 336 天，起点 30 递增：30 + 31 + … + (30+335) = 336*(30 + 365)/2
    const remaining = 365 - 30 + 1
    const future = (remaining * (30 + (30 + remaining - 1))) / 2
    expect(p.projectedAnnual).toBe(465 + future)
    expect(p.achievedTotal).toBe(465)
    expect(p.idealAnnual).toBe(66795) // 愿景恒定不受中途影响
  })

  it('漏卡回退：todayTarget 变小，projectedAnnual 下降（< 未漏卡场景）', () => {
    // 全勤第 30 天：progressStep=29，今日目标 30
    const onTrack = habit({ progressStep: 29, totalAmount: 465, createdAt: '2026-01-01' })
    const pOnTrack = projectAnnual(onTrack, '2026-01-30')
    // 漏 2 天归来：lastCheckinDate=01-27，gap=3 → missed=2 → step 29-2=27 → 今日目标 28
    const backoff = habit({ progressStep: 29, totalAmount: 460, lastCheckinDate: '2026-01-27', createdAt: '2026-01-01' })
    const pBackoff = projectAnnual(backoff, '2026-01-30')
    expect(getDailyTarget(backoff, '2026-01-30')).toBe(28)
    expect(pBackoff.todayTarget).toBe(28)
    expect(pBackoff.projectedAnnual).toBeLessThan(pOnTrack.projectedAnnual)
    // 泄漏回退后仍然巨大（愿景视角）：与 ideal 量级相仿
    expect(pBackoff.projectedAnnual).toBeGreaterThan(60000)
  })

  it('dayIndex 边界：第 1 天 / 跨年仍正确', () => {
    const d1 = projectAnnual(habit({ createdAt: '2026-01-01' }), '2026-01-01')
    expect(d1.dayIndex).toBe(1)
    const d300 = projectAnnual(habit({ createdAt: '2026-01-01' }), '2026-10-27')
    expect(d300.dayIndex).toBe(300)
  })

  it('戒除（反向）习惯：用「省出」口径。ideal/projected 恒 0（不出现"做了 66795 个"的反语义）', () => {
    const h = habit({ direction: 'negative', baseAmount: 5, progressStep: 3, totalAmount: 0, createdAt: '2026-01-01' })
    const p = projectAnnual(h, '2026-01-13')
    expect(p.idealAnnual).toBe(0)
    expect(p.projectedAnnual).toBe(0)
    expect(p.achievedTotal).toBe(0)
    expect(p.todayTarget).toBe(getDailyTarget(h, '2026-01-13'))
  })

  it('已养成 / 超额历史不影响投影正确性（只读累计量）', () => {
    const h = habit({ isFormed: true, formationDays: 21, totalAmount: 1000, progressStep: 10, createdAt: '2026-01-01' })
    const p = projectAnnual(h, '2026-01-30')
    expect(p.idealAnnual).toBe(66795) // 愿景不变
    expect(p.achievedTotal).toBe(1000)
    const remaining = 365 - 30 + 1
    const future = (remaining * (getDailyTarget(h, '2026-01-30') + (getDailyTarget(h, '2026-01-30') + remaining - 1))) / 2
    expect(p.projectedAnnual).toBe(1000 + future)
  })

  it('迁移：旧数据（createdAt 非合法业务日）不崩，dayIndex 兜底为 1', () => {
    const h = habit({ createdAt: '' })
    const p = projectAnnual(h, '2026-01-13')
    expect(p.dayIndex).toBe(1)
    expect(p.idealAnnual).toBe(66795)
  })

  it('锁死 cap：理想/预计都按恒定值计算', () => {
    const h = lockCap(habit({ baseAmount: 1, createdAt: '2026-01-01' }), 10)
    const p = projectAnnual(h, '2026-01-01')
    expect(p.idealAnnual).toBe(10 * ANNUAL_PROJECTION_DAYS) // 每天 10，365 天
    expect(p.todayTarget).toBe(10)
  })
})
