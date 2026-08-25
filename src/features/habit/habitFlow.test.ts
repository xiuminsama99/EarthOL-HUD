/**
 * 习惯打卡流程测试（工单 05）
 *
 * 流程编排层测试：注入 Map backend 的 EarthStorage 与固定时间，
 * 覆盖建习惯 → 看今日目标 → 打卡 → 锁死 → 超额 → 休息日全链路。
 * 引擎规则的输入输出行为已由 engine.test.ts 覆盖，这里只验证编排正确性
 * （校验、持久化、状态回读），不重复断言引擎内部规则。
 */
import { describe, expect, it } from 'vitest'
import { EarthStorage } from '../../storage/storage'
import type { HabitState } from '../../engine/types'
import {
  createHabit,
  performCheckin,
  planToday,
  setCap,
  type CheckinOutcome,
  type HabitDeps,
} from './habitFlow'

function makeDeps(): { deps: HabitDeps; storage: EarthStorage } {
  const store = new Map<string, string>()
  const storage = new EarthStorage({
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value)
    },
  })
  return { deps: { storage }, storage }
}

/** 本地时区 2026-01-13 10:00 */
const NOW = new Date(2026, 0, 13, 10, 0)
const BUSINESS_DATE = '2026-01-13'

function readHabit(storage: EarthStorage): HabitState {
  const list = storage.listHabits()
  expect(list.length).toBe(1)
  return list[0]
}

describe('建习惯', () => {
  it('合法输入创建并持久化，初始状态符合领域约定', () => {
    const { deps, storage } = makeDeps()
    const r = createHabit(deps, {
      name: '每天读一页书',
      direction: 'positive',
      baseAmount: 1,
      cap: null,
      createdAt: BUSINESS_DATE,
    })
    expect(r.error).toBeNull()
    expect(r.habit).not.toBeNull()
    const saved = readHabit(storage)
    expect(saved.name).toBe('每天读一页书')
    expect(saved.direction).toBe('positive')
    expect(saved.baseAmount).toBe(1)
    expect(saved.progressStep).toBe(0)
    expect(saved.cap).toBeNull()
    expect(saved.createdAt).toBe(BUSINESS_DATE)
  })

  it('空名称 / 非法基准 / 非法上限均拒绝且不落库', () => {
    const { deps, storage } = makeDeps()
    const base = {
      name: 'x',
      direction: 'positive' as const,
      baseAmount: 1,
      cap: null,
      createdAt: BUSINESS_DATE,
    }
    expect(createHabit(deps, { ...base, name: '   ' }).error).toContain('名称')
    expect(createHabit(deps, { ...base, baseAmount: 0 }).error).toContain('基准')
    expect(createHabit(deps, { ...base, baseAmount: 1.5 }).error).toContain('基准')
    expect(createHabit(deps, { ...base, cap: 0 }).error).toContain('上限')
    expect(createHabit(deps, { ...base, cap: -1 }).error).toContain('上限')
    expect(storage.listHabits().length).toBe(0)
  })

  it('创建即带可选自认上限（cap 非 null 即锁死）', () => {
    const { deps, storage } = makeDeps()
    const r = createHabit(deps, {
      name: '俯卧撑',
      direction: 'positive',
      baseAmount: 1,
      cap: 5,
      createdAt: BUSINESS_DATE,
    })
    expect(r.error).toBeNull()
    expect(readHabit(storage).cap).toBe(5)
  })
})

describe('今日计划（目标量 + 回退展示）', () => {
  it('新习惯目标 = 基准，无回退', () => {
    const { deps, storage } = makeDeps()
    const { habit } = createHabit(deps, {
      name: '阅读',
      direction: 'positive',
      baseAmount: 2,
      cap: null,
      createdAt: BUSINESS_DATE,
    })
    void storage
    expect(planToday(habit!, BUSINESS_DATE)).toEqual({
      target: 2,
      backoffDays: 0,
      locked: false,
    })
  })

  it('缺勤归来：目标回退并如实上报回退天数（触底时以实际为准）', () => {
    const { deps, storage } = makeDeps()
    const r = createHabit(deps, {
      name: '阅读',
      direction: 'positive',
      baseAmount: 1,
      cap: null,
      createdAt: '2026-01-01',
    })
    const advanced: HabitState = {
      ...r.habit!,
      progressStep: 10,
      lastCheckinDate: '2026-01-10',
    }
    storage.upsertHabit(advanced)
    // 业务日 2026-01-13：gap=3 → missed=2 → 目标回退到 1+8=9
    const plan = planToday(advanced, '2026-01-13')
    expect(plan.target).toBe(9)
    expect(plan.backoffDays).toBe(2)
    // 触底场景：进度 2、缺勤 9 天 → 目标 1，实际只回退 2 步
    const bottom: HabitState = {
      ...r.habit!,
      progressStep: 2,
      lastCheckinDate: '2026-01-10',
    }
    const planBottom = planToday(bottom, '2026-01-20')
    expect(planBottom.target).toBe(1)
    expect(planBottom.backoffDays).toBe(2)
  })
})

describe('打卡流程', () => {
  it('达标打卡：习惯推进、总量/养成值增长、记录落库', () => {
    const { deps, storage } = makeDeps()
    const { habit } = createHabit(deps, {
      name: '阅读',
      direction: 'positive',
      baseAmount: 1,
      cap: null,
      createdAt: BUSINESS_DATE,
    })
    const outcome = performCheckin(deps, habit!, NOW, 'day', {
      amount: 1,
      note: '今天我以早起的人的身份，读了一页书',
    })
    expect(outcome.result.status).toBe('checked-in')
    expect(outcome.result.warning).toBeUndefined()
    expect(outcome.record).not.toBeNull()
    expect(outcome.record!.habitId).toBe(habit!.id)
    expect(outcome.record!.businessDate).toBe(BUSINESS_DATE)
    expect(outcome.record!.note).toContain('读了一页书')

    const saved = readHabit(storage)
    expect(saved.progressStep).toBe(1)
    expect(saved.totalAmount).toBe(1)
    expect(saved.consistencyDays).toBe(1)
    expect(saved.formationDays).toBe(1)
    expect(saved.lastCheckinDate).toBe(BUSINESS_DATE)
  })

  it('无一句话记录被引擎拒绝，不产生任何持久化', () => {
    const { deps, storage } = makeDeps()
    const { habit } = createHabit(deps, {
      name: '阅读',
      direction: 'positive',
      baseAmount: 1,
      cap: null,
      createdAt: BUSINESS_DATE,
    })
    const outcome = performCheckin(deps, habit!, NOW, 'day', {
      amount: 1,
      note: '  ',
    })
    expect(outcome.result.status).toBe('rejected')
    expect(outcome.result.reason).toBe('missing-note')
    expect(outcome.record).toBeNull()
    expect(readHabit(storage).progressStep).toBe(0)
    expect(storage.listCheckins().length).toBe(0)
  })

  it('超额打卡：产生「不建议」警告、超额量入假期币、养成值不涨', () => {
    const { deps, storage } = makeDeps()
    const { habit } = createHabit(deps, {
      name: '阅读',
      direction: 'positive',
      baseAmount: 1,
      cap: null,
      createdAt: BUSINESS_DATE,
    })
    const outcome = performCheckin(deps, habit!, NOW, 'day', {
      amount: 8,
      note: '今天状态爆棚',
    })
    expect(outcome.result.status).toBe('checked-in')
    expect(outcome.result.warning?.kind).toBe('overachievement')
    expect(outcome.result.overAmount).toBe(7)
    const saved = readHabit(storage)
    expect(saved.vacationCoins).toBe(7)
    expect(saved.consistencyDays).toBe(0) // 超额不涨养成值
    expect(saved.totalAmount).toBe(8) // 但总量计入
  })

  it('同日重复打卡被引擎拒绝', () => {
    const { deps, storage } = makeDeps()
    const { habit } = createHabit(deps, {
      name: '阅读',
      direction: 'positive',
      baseAmount: 1,
      cap: null,
      createdAt: BUSINESS_DATE,
    })
    void performCheckin(deps, habit!, NOW, 'day', { amount: 1, note: '第一次' })
    const again = performCheckin(deps, readHabit(storage), NOW, 'day', {
      amount: 1,
      note: '第二次',
    })
    expect(again.result.status).toBe('rejected')
    expect(again.result.reason).toBe('already-checked-in')
  })

  it('休息日抵扣：假期币 -1，不计缺勤、不推进', () => {
    const { deps, storage } = makeDeps()
    const { habit } = createHabit(deps, {
      name: '阅读',
      direction: 'positive',
      baseAmount: 1,
      cap: null,
      createdAt: BUSINESS_DATE,
    })
    const rich: HabitState = { ...habit!, vacationCoins: 3 }
    storage.upsertHabit(rich)
    const outcome: CheckinOutcome = performCheckin(deps, rich, NOW, 'day', {
      amount: 0,
      note: '今天我选择休息恢复（假期币抵扣）',
      restDay: true,
    })
    expect(outcome.result.status).toBe('rest-day')
    expect(outcome.record!.restDay).toBe(true)
    const saved = readHabit(storage)
    expect(saved.vacationCoins).toBe(2)
    expect(saved.progressStep).toBe(0)
    expect(saved.lastCheckinDate).toBe(BUSINESS_DATE) // 记为「有打卡」，次日不判缺勤
  })

  it('无币休息被拒绝', () => {
    const { deps } = makeDeps()
    const { habit } = createHabit(deps, {
      name: '阅读',
      direction: 'positive',
      baseAmount: 1,
      cap: null,
      createdAt: BUSINESS_DATE,
    })
    const outcome = performCheckin(deps, habit!, NOW, 'day', {
      amount: 0,
      note: '想休息',
      restDay: true,
    })
    expect(outcome.result.status).toBe('rejected')
    expect(outcome.result.reason).toBe('insufficient-vacation-coins')
  })

  it('夜间工作者凌晨打卡归属昨日（作息边界走引擎）', () => {
    const { deps, storage } = makeDeps()
    const { habit } = createHabit(deps, {
      name: '阅读',
      direction: 'positive',
      baseAmount: 1,
      cap: null,
      createdAt: '2026-01-12',
    })
    // 2026-01-13 凌晨 2 点，夜间作息 → 业务日应为 2026-01-12
    const lateNight = new Date(2026, 0, 13, 2, 0)
    const outcome = performCheckin(deps, habit!, lateNight, 'night', {
      amount: 1,
      note: '凌晨收尾昨日任务',
    })
    expect(outcome.result.status).toBe('checked-in')
    expect(outcome.record!.businessDate).toBe('2026-01-12')
    expect(readHabit(storage).lastCheckinDate).toBe('2026-01-12')
  })
})

describe('锁死（动态调节条）', () => {
  it('正向习惯锁死合法上限：目标固定，后续打卡不再推进进度', () => {
    const { deps, storage } = makeDeps()
    const { habit } = createHabit(deps, {
      name: '阅读',
      direction: 'positive',
      baseAmount: 1,
      cap: null,
      createdAt: BUSINESS_DATE,
    })
    const r = setCap(deps, habit!, BUSINESS_DATE, 5)
    expect(r.error).toBeNull()
    const saved = readHabit(storage)
    expect(saved.cap).toBe(5)
    expect(planToday(saved, '2026-01-13').target).toBe(5)
    // 锁死后打卡：进度不推进，目标恒为 cap
    const outcome = performCheckin(deps, saved, NOW, 'day', { amount: 5, note: '已达上限' })
    expect(outcome.result.targetAmount).toBe(5)
    expect(readHabit(storage).progressStep).toBe(0)
  })

  it('正向习惯上限低于今日目标被拒绝', () => {
    const { deps, storage } = makeDeps()
    const { habit } = createHabit(deps, {
      name: '阅读',
      direction: 'positive',
      baseAmount: 3,
      cap: null,
      createdAt: BUSINESS_DATE,
    })
    const advanced: HabitState = { ...habit!, progressStep: 4 }
    storage.upsertHabit(advanced)
    const r = setCap(deps, advanced, BUSINESS_DATE, 5) // 今日目标 7，5 会倒退
    expect(r.error).toContain('不能低于')
    expect(readHabit(storage).cap).toBeNull()
  })

  it('反向习惯上限高于今日目标被拒绝', () => {
    const { deps, storage } = makeDeps()
    const { habit } = createHabit(deps, {
      name: '少吃一口',
      direction: 'negative',
      baseAmount: 10,
      cap: null,
      createdAt: BUSINESS_DATE,
    })
    const advanced: HabitState = { ...habit!, progressStep: 3 }
    storage.upsertHabit(advanced)
    // 今日目标 7；cap 8 会倒退（反向只能更少）
    expect(setCap(deps, advanced, BUSINESS_DATE, 8).error).toContain('不能高于')
    // cap 6 合法
    const ok = setCap(deps, advanced, BUSINESS_DATE, 6)
    expect(ok.error).toBeNull()
    expect(readHabit(storage).cap).toBe(6)
  })

  it('非整数 / 负数上限被拒绝', () => {
    const { deps } = makeDeps()
    const { habit } = createHabit(deps, {
      name: '阅读',
      direction: 'positive',
      baseAmount: 1,
      cap: null,
      createdAt: BUSINESS_DATE,
    })
    expect(setCap(deps, habit!, BUSINESS_DATE, 0).error).toContain('上限')
    expect(setCap(deps, habit!, BUSINESS_DATE, 2.5).error).toContain('上限')
  })
})

describe('打卡记录可回读', () => {
  it('历史记录按习惯过滤', () => {
    const { deps, storage } = makeDeps()
    const { habit } = createHabit(deps, {
      name: '阅读',
      direction: 'positive',
      baseAmount: 1,
      cap: null,
      createdAt: BUSINESS_DATE,
    })
    void performCheckin(deps, habit!, NOW, 'day', { amount: 1, note: '第一天' })
    void performCheckin(deps, readHabit(storage), new Date(2026, 0, 14, 10, 0), 'day', {
      amount: 1,
      note: '第二天',
    })
    const records = storage.listCheckins(habit!.id)
    expect(records.length).toBe(2)
    expect(records[0].businessDate).toBe('2026-01-13')
    expect(records[1].businessDate).toBe('2026-01-14')
  })
})
