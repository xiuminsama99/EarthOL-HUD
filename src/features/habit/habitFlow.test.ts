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
import type { CheckinResult, HabitState } from '../../engine/types'
import {
  createHabit,
  performCheckin,
  planToday,
  setCap,
  buildOverachievementNotice,
  buildCheckinResultNotice,
  isZeroTarget,
  deleteHabit,
  renameHabit,
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

  it('R5：单位默认「次」，可自定义，空串/超长拒绝', () => {
    const { deps } = makeDeps()
    const base = {
      name: 'x',
      direction: 'positive' as const,
      baseAmount: 1,
      cap: null,
      createdAt: BUSINESS_DATE,
    }
    expect(createHabit(deps, base).habit?.unit).toBe('次')
    expect(createHabit(deps, { ...base, name: 'y', unit: '个' }).habit?.unit).toBe('个')
    expect(createHabit(deps, { ...base, name: 'z', unit: '   ' }).error).toContain('单位')
    expect(createHabit(deps, { ...base, name: 'w', unit: '超长单位超长单位超长字' }).error).toContain('单位')
  })

  it('A3：业务日未解析（非法 createdAt）时拒绝建习惯，不落库', () => {
    const { deps, storage } = makeDeps()
    const r = createHabit(deps, {
      name: '阅读',
      direction: 'positive',
      baseAmount: 1,
      cap: null,
      createdAt: '',
    })
    expect(r.error).toContain('时间')
    expect(r.habit).toBeNull()
    expect(storage.listHabits().length).toBe(0)
    const bad = createHabit(deps, {
      name: '阅读',
      direction: 'positive',
      baseAmount: 1,
      cap: null,
      createdAt: 'not-a-date',
    })
    expect(bad.error).toContain('时间')
    expect(storage.listHabits().length).toBe(0)
  })

  it('A4：建习惯即 actionCount=0，首次打卡后为 1', () => {
    const { deps, storage } = makeDeps()
    const { habit } = createHabit(deps, {
      name: '阅读',
      direction: 'positive',
      baseAmount: 1,
      cap: null,
      createdAt: BUSINESS_DATE,
    })
    expect(readHabit(storage).actionCount).toBe(0)
    void performCheckin(deps, habit!, NOW, 'day', { amount: 1 })
    expect(readHabit(storage).actionCount).toBe(1)
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
      tomorrowTarget: 3,
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

  it('A2：正向习惯明日目标 +1', () => {
    const { deps } = makeDeps()
    const { habit } = createHabit(deps, {
      name: '阅读',
      direction: 'positive',
      baseAmount: 2,
      cap: null,
      createdAt: BUSINESS_DATE,
    })
    expect(planToday(habit!, BUSINESS_DATE).tomorrowTarget).toBe(3)
  })

  it('A2：反向习惯明日目标递减，触底 0 不再为负', () => {
    const { deps, storage } = makeDeps()
    const { habit } = createHabit(deps, {
      name: '少吃一口',
      direction: 'negative',
      baseAmount: 10,
      cap: null,
      createdAt: BUSINESS_DATE,
    })
    const advanced: HabitState = { ...habit!, progressStep: 5 } // 今日目标 5
    storage.upsertHabit(advanced)
    expect(planToday(advanced, BUSINESS_DATE).tomorrowTarget).toBe(4)
    const bottom: HabitState = { ...habit!, progressStep: 10 } // 今日目标 0
    storage.upsertHabit(bottom)
    const plan = planToday(bottom, BUSINESS_DATE)
    expect(plan.target).toBe(0)
    expect(plan.tomorrowTarget).toBe(0) // 触底不再出现负数
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

  it('超额打卡：产生「不建议」警告、超额入币（上限=目标量）、养成值不涨', () => {
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
    expect(outcome.result.overAmount).toBe(7) // 警告仍显示真实超额量
    const saved = readHabit(storage)
    // B3：入币上限 = 当日目标量 1 → 超额 7 中只转 1 币
    expect(saved.vacationCoins).toBe(1)
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

describe('锁死 / 可调上限（动态调节条）', () => {
  it('正向习惯锁死合法上限：目标固定，后续打卡不再推进进度', () => {
    const { deps, storage } = makeDeps()
    const { habit } = createHabit(deps, {
      name: '阅读',
      direction: 'positive',
      baseAmount: 1,
      cap: null,
      createdAt: BUSINESS_DATE,
    })
    const r = setCap(deps, habit!, 5)
    expect(r.error).toBeNull()
    const saved = readHabit(storage)
    expect(saved.cap).toBe(5)
    expect(planToday(saved, '2026-01-13').target).toBe(5)
    // 锁死后打卡：进度不推进，目标恒为 cap
    const outcome = performCheckin(deps, saved, NOW, 'day', { amount: 5 })
    expect(outcome.result.targetAmount).toBe(5)
    expect(readHabit(storage).progressStep).toBe(0)
  })

  it('可调锁死：锁死后可调高 / 调低 / 调回基准（2026-08 产品反馈）', () => {
    const { deps, storage } = makeDeps()
    const { habit } = createHabit(deps, {
      name: '阅读',
      direction: 'positive',
      baseAmount: 3,
      cap: null,
      createdAt: BUSINESS_DATE,
    })
    const r1 = setCap(deps, habit!, 8)
    expect(r1.error).toBeNull()
    expect(readHabit(storage).cap).toBe(8)
    // 调高
    const r2 = setCap(deps, readHabit(storage), 12)
    expect(r2.error).toBeNull()
    expect(readHabit(storage).cap).toBe(12)
    // 调低（≥ 基准 3）
    const r3 = setCap(deps, readHabit(storage), 4)
    expect(r3.error).toBeNull()
    expect(readHabit(storage).cap).toBe(4)
    // 调回基准（起点档，边界允许）
    const r4 = setCap(deps, readHabit(storage), 3)
    expect(r4.error).toBeNull()
    expect(readHabit(storage).cap).toBe(3)
    // 调整不影响已积累的养成值 / 总量
    expect(readHabit(storage).totalAmount).toBe(0)
    expect(readHabit(storage).consistencyDays).toBe(0)
  })

  it('正向习惯上限低于起始基准被拒绝（不落库）', () => {
    const { deps, storage } = makeDeps()
    const { habit } = createHabit(deps, {
      name: '阅读',
      direction: 'positive',
      baseAmount: 3,
      cap: null,
      createdAt: BUSINESS_DATE,
    })
    const r = setCap(deps, habit!, 2) // 低于基准 3
    expect(r.error).toContain('不能低于')
    expect(readHabit(storage).cap).toBeNull()
  })

  it('反向习惯上限高于起始基准被拒绝；等于/低于基准合法', () => {
    const { deps, storage } = makeDeps()
    const { habit } = createHabit(deps, {
      name: '少吃一口',
      direction: 'negative',
      baseAmount: 10,
      cap: null,
      createdAt: BUSINESS_DATE,
    })
    expect(setCap(deps, habit!, 12).error).toContain('不能高于') // > 基准
    expect(readHabit(storage).cap).toBeNull()
    // 反向锁死只能更少或持平：8 与 10（=基准）均合法
    const ok = setCap(deps, habit!, 8)
    expect(ok.error).toBeNull()
    expect(readHabit(storage).cap).toBe(8)
    expect(setCap(deps, readHabit(storage), 10).error).toBeNull()
    expect(readHabit(storage).cap).toBe(10)
  })

  it('非整数 / 负数 / 超上限值被拒绝', () => {
    const { deps } = makeDeps()
    const { habit } = createHabit(deps, {
      name: '阅读',
      direction: 'positive',
      baseAmount: 1,
      cap: null,
      createdAt: BUSINESS_DATE,
    })
    expect(setCap(deps, habit!, 0).error).toContain('上限')
    expect(setCap(deps, habit!, 2.5).error).toContain('上限')
    expect(setCap(deps, habit!, 2_000_000).error).toContain('上限')
  })
})

describe('超额提示文案（habitFlow 层统一构建，UX-6 简化）', () => {
  it('保留「超额 X 中 Y 已存为假期币」区分与「不计入养成进度」，去掉技术腔', () => {
    // 超额 5、其中 3 转为假期币、当前共 3 枚（B3 口径：入币上限=当日目标量）
    const notice = buildOverachievementNotice(5, 3, 3)
    expect(notice).toContain('超额 5 中 3 已存为假期币（当前 3 枚）')
    expect(notice).toContain('不计入养成进度')
    expect(notice).not.toContain('不建议') // 技术警告不再出现在用户可见文案
    expect(notice).not.toContain('重新计数') // 技术表述移除
  })
})

describe('UX-1：打卡结果反馈文案（不虚假成功）', () => {
  const baseHabit: HabitState = {
    id: 'h1',
    name: '阅读',
    direction: 'positive',
    baseAmount: 1,
    unit: '次',
    cap: null,
    progressStep: 0,
    totalAmount: 0,
    consistencyDays: 0,
    formationDays: 0,
    isFormed: false,
    vacationCoins: 0,
    lastCheckinDate: null,
    actionCount: 0,
    createdAt: '2026-01-13',
  }
  function result(partial: Partial<CheckinResult>): CheckinResult {
    return {
      status: 'checked-in',
      mode: 'normal',
      note: '',
      habit: baseHabit,
      targetAmount: 5,
      completedAmount: 5,
      overAmount: 0,
      vacationCoinsDelta: 0,
      formed: false,
      ...partial,
    }
  }

  it('达标：庆祝文案', () => {
    expect(buildCheckinResultNotice(result({}))).toBe('今日达标 ✓ 以新身份行动的一天')
  })

  it('未达标：如实告知「做了 X / 目标 Y」并说明不计入养成线', () => {
    expect(buildCheckinResultNotice(result({ completedAmount: 3 }))).toBe(
      '做了 3 / 目标 5，明天继续（未达标当天不计入养成线）',
    )
  })

  it('超额：走超额提示（含假期币与养成进度口径）', () => {
    const notice = buildCheckinResultNotice(
      result({
        completedAmount: 8,
        targetAmount: 5,
        overAmount: 3,
        vacationCoinsDelta: 1,
        warning: { kind: 'overachievement', message: '不建议，离目标更远' },
        habit: { ...baseHabit, vacationCoins: 1 },
      }),
    )
    expect(notice).toContain('超额 3 中 1 已存为假期币（当前 1 枚）')
    expect(notice).toContain('不计入养成进度')
  })
})

describe('UX-7：戒除类习惯触底 0 判定（完成态）', () => {
  const base: HabitState = {
    id: 'h1',
    name: '少吃一口',
    direction: 'negative',
    baseAmount: 3,
    unit: '口',
    cap: null,
    progressStep: 3,
    totalAmount: 0,
    consistencyDays: 0,
    formationDays: 0,
    isFormed: false,
    vacationCoins: 0,
    lastCheckinDate: null,
    actionCount: 0,
    createdAt: '2026-01-13',
  }

  it('反向习惯目标触底 0 → true', () => {
    // 基准 3、进度 3 → 目标 max(0, 3-3)=0
    expect(isZeroTarget(base, '2026-01-13')).toBe(true)
  })

  it('未触底 → false', () => {
    expect(isZeroTarget({ ...base, progressStep: 1 }, '2026-01-13')).toBe(false)
  })

  it('正向习惯目标为 0 的输入不算触底完成（方向必须为戒除）', () => {
    expect(isZeroTarget({ ...base, direction: 'positive', progressStep: 0 }, '2026-01-13')).toBe(false)
  })
})

describe('打卡语自动生成（流程层）', () => {
  it('不传 note：引擎自动生成并落库', () => {
    const { deps, storage } = makeDeps()
    storage.updateProfile({ identityStatement: '早起的人' })
    const { habit } = createHabit(deps, {
      name: '阅读',
      direction: 'positive',
      baseAmount: 1,
      cap: null,
      createdAt: BUSINESS_DATE,
    })
    const outcome = performCheckin(deps, habit!, NOW, 'day', { amount: 1 })
    expect(outcome.result.status).toBe('checked-in')
    expect(outcome.record!.note).toBe('我以早起的人的身份完成了阅读的第1次，离目标更近了一点点')
  })

  it('身份未设置：兜底用习惯名生成', () => {
    const { deps } = makeDeps()
    const { habit } = createHabit(deps, {
      name: '每天读一页书',
      direction: 'positive',
      baseAmount: 1,
      cap: null,
      createdAt: BUSINESS_DATE,
    })
    const outcome = performCheckin(deps, habit!, NOW, 'day', { amount: 1 })
    expect(outcome.result.status).toBe('checked-in')
    expect(outcome.record!.note).toContain('每天读一页书')
    expect(outcome.record!.note).toContain('第1次')
  })

  it('用户编辑覆盖：传 note 用用户文本', () => {
    const { deps } = makeDeps()
    const { habit } = createHabit(deps, {
      name: '阅读',
      direction: 'positive',
      baseAmount: 1,
      cap: null,
      createdAt: BUSINESS_DATE,
    })
    const outcome = performCheckin(deps, habit!, NOW, 'day', { amount: 1, note: '今天状态很好' })
    expect(outcome.record!.note).toBe('今天状态很好')
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

describe('一键打卡（工单 06）', () => {
  it('一键 = 按当日目标达标打卡：无超额警告、自动打卡语、记录落库', () => {
    const { deps, storage } = makeDeps()
    storage.updateProfile({ identityStatement: '早起的人' })
    const { habit } = createHabit(deps, {
      name: '阅读',
      direction: 'positive',
      baseAmount: 2,
      cap: null,
      createdAt: BUSINESS_DATE,
    })
    // 一键打卡的语义：amount 取今日目标（planToday 产物）
    const plan = planToday(habit!, BUSINESS_DATE)
    expect(plan.target).toBe(2)
    const outcome = performCheckin(deps, habit!, NOW, 'day', { amount: plan.target })
    expect(outcome.result.status).toBe('checked-in')
    expect(outcome.result.warning).toBeUndefined()
    expect(outcome.record!.amount).toBe(2)
    expect(outcome.record!.note).toContain('早起的人')
    const saved = readHabit(storage)
    expect(saved.consistencyDays).toBe(1)
    expect(saved.formationDays).toBe(1)
  })

  it('一键后再走超额快捷按钮（同日）被拒绝：两条路径并存不冲突', () => {
    const { deps, storage } = makeDeps()
    const { habit } = createHabit(deps, {
      name: '阅读',
      direction: 'positive',
      baseAmount: 1,
      cap: null,
      createdAt: BUSINESS_DATE,
    })
    const plan = planToday(habit!, BUSINESS_DATE)
    const oneTap = performCheckin(deps, habit!, NOW, 'day', { amount: plan.target })
    expect(oneTap.result.status).toBe('checked-in')
    // 同日再点超额快捷按钮：引擎拒绝重复打卡，不产生第二条记录
    const extra = performCheckin(deps, readHabit(storage), NOW, 'day', {
      amount: plan.target + 2,
    })
    expect(extra.result.status).toBe('rejected')
    expect(extra.result.reason).toBe('already-checked-in')
    expect(storage.listCheckins().length).toBe(1)
  })

  it('一键打卡当日目标随缺勤回退：一键仍按回退后的目标达标', () => {
    const { deps, storage } = makeDeps()
    const { habit } = createHabit(deps, {
      name: '阅读',
      direction: 'positive',
      baseAmount: 1,
      cap: null,
      createdAt: '2026-01-01',
    })
    const advanced: HabitState = {
      ...habit!,
      progressStep: 10,
      lastCheckinDate: '2026-01-10',
    }
    storage.upsertHabit(advanced)
    // 2026-01-13：gap=3 → missed=2 → 目标回退到 9
    const plan = planToday(advanced, BUSINESS_DATE)
    expect(plan.target).toBe(9)
    const outcome = performCheckin(deps, advanced, NOW, 'day', { amount: plan.target })
    expect(outcome.result.status).toBe('checked-in')
    expect(outcome.result.warning).toBeUndefined()
    expect(outcome.record!.amount).toBe(9)
  })
})

describe('B1：作息切换当天禁止再次打卡（防刷卡）', () => {
  it('当日已切换作息 → 打卡被拒（schedule-switched-today），不落库', () => {
    const { deps, storage } = makeDeps()
    storage.updateProfile({ lastScheduleSwitchAt: '2026-01-13T09:00:00+08:00' })
    const { habit } = createHabit(deps, {
      name: '阅读',
      direction: 'positive',
      baseAmount: 1,
      cap: null,
      createdAt: BUSINESS_DATE,
    })
    const outcome = performCheckin(deps, habit!, NOW, 'day', { amount: 1 })
    expect(outcome.result.status).toBe('rejected')
    expect(outcome.result.reason).toBe('schedule-switched-today')
    expect(outcome.record).toBeNull()
    expect(storage.listCheckins().length).toBe(0)
    expect(readHabit(storage).progressStep).toBe(0)
  })

  it('未切换作息：正常打卡不受影响', () => {
    const { deps, storage } = makeDeps()
    const { habit } = createHabit(deps, {
      name: '阅读',
      direction: 'positive',
      baseAmount: 1,
      cap: null,
      createdAt: BUSINESS_DATE,
    })
    const outcome = performCheckin(deps, habit!, NOW, 'day', { amount: 1 })
    expect(outcome.result.status).toBe('checked-in')
    expect(storage.listCheckins().length).toBe(1)
  })

  it('次日可正常打卡（切换发生在昨天不拦截）', () => {
    const { deps, storage } = makeDeps()
    storage.updateProfile({ lastScheduleSwitchAt: '2026-01-12T23:00:00+08:00' })
    const { habit } = createHabit(deps, {
      name: '阅读',
      direction: 'positive',
      baseAmount: 1,
      cap: null,
      createdAt: BUSINESS_DATE,
    })
    const outcome = performCheckin(deps, habit!, NOW, 'day', { amount: 1 })
    expect(outcome.result.status).toBe('checked-in')
    expect(storage.listCheckins().length).toBe(1)
  })
})

describe('B6：习惯删除与改名', () => {
  it('删除：仅删习惯，关联打卡记录保留，列表为空', () => {
    const { deps, storage } = makeDeps()
    const { habit } = createHabit(deps, {
      name: '阅读',
      direction: 'positive',
      baseAmount: 1,
      cap: null,
      createdAt: BUSINESS_DATE,
    })
    void performCheckin(deps, habit!, NOW, 'day', { amount: 1, note: '第一天' })
    expect(storage.listCheckins(habit!.id).length).toBe(1)
    const r = deleteHabit(deps, habit!.id)
    expect(r.ok).toBe(true)
    expect(storage.listHabits().length).toBe(0)
    expect(storage.listCheckins(habit!.id).length).toBe(1) // 记录保留
  })

  it('删除不存在的习惯：报错且不影响其他数据', () => {
    const { deps } = makeDeps()
    const r = deleteHabit(deps, 'nope')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('不存在')
  })

  it('改名：仅改名称字段，其余状态原样保留', () => {
    const { deps, storage } = makeDeps()
    const { habit } = createHabit(deps, {
      name: '阅读',
      direction: 'positive',
      baseAmount: 3,
      cap: 8,
      createdAt: BUSINESS_DATE,
    })
    void performCheckin(deps, habit!, NOW, 'day', { amount: 3, note: '达标' })
    const r = renameHabit(deps, habit!.id, '每天读两页书')
    expect(r.error).toBeNull()
    const saved = readHabit(storage)
    expect(saved.name).toBe('每天读两页书')
    expect(saved.baseAmount).toBe(3)
    expect(saved.cap).toBe(8)
    expect(saved.progressStep).toBe(0) // 创建即锁死：进度不推进（引擎规则 3）
    expect(saved.totalAmount).toBe(3) // 打卡总量保留
  })

  it('改名校验：空名 / 超长 / 不存在均拒绝', () => {
    const { deps, storage } = makeDeps()
    const { habit } = createHabit(deps, {
      name: '阅读',
      direction: 'positive',
      baseAmount: 1,
      cap: null,
      createdAt: BUSINESS_DATE,
    })
    expect(renameHabit(deps, habit!.id, '   ').error).toContain('名称')
    expect(renameHabit(deps, habit!.id, 'x'.repeat(41)).error).toContain('最长')
    expect(renameHabit(deps, 'nope', '合法').error).toContain('不存在')
    expect(readHabit(storage).name).toBe('阅读') // 全部失败不落库
  })
})

describe('R4：最低版本打卡', () => {
  it('performCheckin 透传 minimal：记录 mode=minimal，习惯 actionCount+1 且 progressStep 不动', () => {
    const { deps, storage } = makeDeps()
    createHabit(deps, {
      name: '俯卧撑',
      direction: 'positive',
      baseAmount: 1,
      cap: null,
      createdAt: BUSINESS_DATE,
    })
    const habit = readHabit(storage)
    const outcome = performCheckin(deps, habit, NOW, 'day', { amount: 1, mode: 'minimal' })
    expect(outcome.result.status).toBe('checked-in')
    expect(outcome.result.mode).toBe('minimal')
    expect(outcome.record).not.toBeNull()
    expect(outcome.record!.mode).toBe('minimal')
    expect(outcome.record!.restDay).toBe(false)
    const saved = readHabit(storage)
    expect(saved.actionCount).toBe(1)
    expect(saved.progressStep).toBe(0)
  })

  it('normal 打卡记录 mode=normal', () => {
    const { deps, storage } = makeDeps()
    createHabit(deps, {
      name: '俯卧撑',
      direction: 'positive',
      baseAmount: 1,
      cap: null,
      createdAt: BUSINESS_DATE,
    })
    const outcome = performCheckin(deps, readHabit(storage), NOW, 'day', { amount: 1 })
    expect(outcome.record!.mode).toBe('normal')
  })
})
