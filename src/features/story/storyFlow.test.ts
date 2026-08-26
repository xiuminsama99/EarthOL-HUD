/**
 * 「我的故事」时间线测试（工单 16 R10b-4 B）
 *
 * 覆盖：状态分类、按日倒序聚合、统计口径、习惯名映射、
 * 当天条编辑 / 删除守卫（仅当天、历史只读）。
 */
import { describe, expect, it } from 'vitest'
import { EarthStorage } from '../../storage/storage'
import type { CheckinRecord } from '../../storage/types'
import {
  buildStoryTimeline,
  classifyStatus,
  editTodayNote,
  deleteTodayCheckin,
  buildMonthlySummary,
  STORY_STATUS_COLOR,
} from './storyFlow'

function makeDeps() {
  const store = new Map<string, string>()
  const storage = new EarthStorage({
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value)
    },
  })
  return { storage, store }
}

function seedCheckin(over: Partial<CheckinRecord> = {}): CheckinRecord {
  return {
    id: crypto.randomUUID(),
    habitId: 'h1',
    businessDate: '2026-08-27',
    amount: 3,
    targetAmount: 3,
    note: '今天以健康的人的身份行动了：俯卧撑 · 第 3 次',
    restDay: false,
    mode: 'normal',
    createdAt: new Date().toISOString(),
    ...over,
  }
}

describe('classifyStatus 状态分类', () => {
  it('达标：完成量 = 目标', () => {
    expect(
      classifyStatus({ amount: 3, targetAmount: 3, restDay: false, mode: 'normal' } as CheckinRecord),
    ).toBe('达标')
  })
  it('未达标：完成量 < 目标', () => {
    expect(
      classifyStatus({ amount: 2, targetAmount: 3, restDay: false, mode: 'normal' } as CheckinRecord),
    ).toBe('未达标')
  })
  it('超额：完成量 > 目标', () => {
    expect(
      classifyStatus({ amount: 5, targetAmount: 3, restDay: false, mode: 'normal' } as CheckinRecord),
    ).toBe('超额')
  })
  it('休息', () => {
    expect(classifyStatus({ restDay: true } as CheckinRecord)).toBe('休息')
  })
  it('最低版本', () => {
    expect(
      classifyStatus({ restDay: false, mode: 'minimal' } as CheckinRecord),
    ).toBe('最低版本')
  })
})

describe('buildStoryTimeline 聚合', () => {
  const name = () => '俯卧撑'

  it('按业务日倒序分组，同日多个记录并列', () => {
    const checkins = [
      { ...seedCheckin(), id: 'a', habitId: 'h1', businessDate: '2026-08-26', note: '昨天', targetAmount: 2, amount: 2 },
      { ...seedCheckin(), id: 'b', habitId: 'h1', businessDate: '2026-08-27', note: '今天', targetAmount: 3, amount: 3 },
      { ...seedCheckin(), id: 'c', habitId: 'h2', businessDate: '2026-08-27', note: '今天第二个', targetAmount: 1, amount: 1 },
      { ...seedCheckin(), id: 'd', habitId: 'h1', businessDate: '2026-08-25', note: '前天', restDay: true, targetAmount: 0, amount: 0 },
    ]
    const tl = buildStoryTimeline(checkins, name)
    expect(tl.days.map((d) => d.businessDate)).toEqual(['2026-08-27', '2026-08-26', '2026-08-25'])
    expect(tl.days[0].entries.map((e) => e.id).sort()).toEqual(['b', 'c'])
    expect(tl.days[0].entries.map((e) => e.status).sort()).toEqual(['达标', '达标'])
  })

  it('统计：总天数、总打卡次数、休息券次数', () => {
    const checkins = [
      { ...seedCheckin(), id: 'a', businessDate: '2026-08-27' },
      { ...seedCheckin(), id: 'b', businessDate: '2026-08-26' },
      { ...seedCheckin(), id: 'c', businessDate: '2026-08-26', restDay: true, amount: 0, targetAmount: 0 },
      { ...seedCheckin(), id: 'd', businessDate: '2026-08-25' },
    ]
    const tl = buildStoryTimeline(checkins, name)
    expect(tl.totalDays).toBe(3)
    expect(tl.totalCheckins).toBe(4)
    expect(tl.restUses).toBe(1)
    // 全部状态色都有映射
    expect(Object.keys(STORY_STATUS_COLOR).sort()).toEqual(
      ['休息', '戒除坚持', '最低版本', '未达标', '超额', '达标'],
    )
  })

  it('习惯名映射用于每条记录', () => {
    const checkins = [{ ...seedCheckin(), id: 'a', habitId: 'h9' }]
    const tl = buildStoryTimeline(checkins, (id) => (id === 'h9' ? '喝水' : '未知'))
    expect(tl.days[0].entries[0].habitName).toBe('喝水')
  })
})

describe('editTodayNote / deleteTodayCheckin 当天守卫', () => {
  it('编辑当天记录成功', () => {
    const { storage } = makeDeps()
    const c = seedCheckin()
    storage.addCheckin(c)
    const r = editTodayNote({ storage }, c.id, '2026-08-27', '  新文案  ')
    expect(r.ok).toBe(true)
    expect(storage.listCheckins()[0].note).toBe('新文案')
  })

  it('编辑非当天记录被拒绝（历史只读）', () => {
    const { storage } = makeDeps()
    const c = seedCheckin()
    storage.addCheckin(c)
    const r = editTodayNote({ storage }, c.id, '2026-08-26', '想改昨天')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('只能修改今天的记录')
    expect(storage.listCheckins()[0].note).toBe(c.note)
  })

  it('编辑空文案被拒', () => {
    const { storage } = makeDeps()
    const c = seedCheckin()
    storage.addCheckin(c)
    const r = editTodayNote({ storage }, c.id, '2026-08-27', '   ')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('不能为空')
  })

  it('删除当天记录成功，记录被移除', () => {
    const { storage } = makeDeps()
    const c = seedCheckin()
    storage.addCheckin(c)
    const r = deleteTodayCheckin({ storage }, c.id, '2026-08-27')
    expect(r.ok).toBe(true)
    expect(storage.listCheckins()).toHaveLength(0)
  })

  it('删除非当天记录被拒（历史只读，记录保留）', () => {
    const { storage } = makeDeps()
    const c = seedCheckin()
    storage.addCheckin(c)
    const r = deleteTodayCheckin({ storage }, c.id, '2026-08-26')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('只能删除今天的记录')
    expect(storage.listCheckins()).toHaveLength(1)
  })

  it('记录不存在时报错', () => {
    const { storage } = makeDeps()
    expect(editTodayNote({ storage }, 'missing', '2026-08-27', 'x').error).toContain('不存在')
    expect(deleteTodayCheckin({ storage }, 'missing', '2026-08-27').error).toContain('不存在')
  })

  it('BUG-2：删除当天记录并回滚打卡前习惯快照（可重新打卡）', () => {
    const { storage } = makeDeps()
    const before: import('../../engine/types').HabitState = {
      id: 'h1',
      name: '俯卧撑',
      direction: 'positive',
      baseAmount: 1,
      unit: '次',
      cap: null,
      progressStep: 3,
      totalAmount: 6,
      consistencyDays: 3,
      formationDateList: ['2026-08-25'],
      formationDays: 1,
      isFormed: false,
      vacationCoins: 2,
      streakDays: 2,
      lastCheckinDate: '2026-08-26',
      actionCount: 3,
      createdAt: '2026-08-20',
    }
    storage.upsertHabit(before)
    // 模拟：今天打卡后 → 习惯状态已推进（快照仍为 before）
    const after: import('../../engine/types').HabitState = {
      ...before,
      progressStep: 4,
      totalAmount: 9,
      actionCount: 4,
      lastCheckinDate: '2026-08-27',
    }
    storage.upsertHabit(after)
    storage.addCheckin({ ...seedCheckin(), habitBefore: before })

    const r = deleteTodayCheckin({ storage }, storage.listCheckins()[0].id, '2026-08-27')
    expect(r.ok).toBe(true)
    expect(storage.listCheckins()).toHaveLength(0)
    // 习惯状态回到打卡前快照
    const habit = storage.getHabit('h1')!
    expect(habit.progressStep).toBe(3)
    expect(habit.totalAmount).toBe(6)
    expect(habit.actionCount).toBe(3)
    expect(habit.lastCheckinDate).toBe('2026-08-26')
    expect(habit.vacationCoins).toBe(2)
  })

  it('BUG-2：旧数据无 habitBefore 时仅移除记录，不报错', () => {
    const { storage } = makeDeps()
    storage.addCheckin(seedCheckin())
    const r = deleteTodayCheckin({ storage }, storage.listCheckins()[0].id, '2026-08-27')
    expect(r.ok).toBe(true)
    expect(storage.listCheckins()).toHaveLength(0)
  })
})

describe('buildMonthlySummary 本月统计（P2-1）', () => {
  it('聚合本月行动天数 / 打卡次数 / 总量 / 行动率', () => {
    const checkins = [
      { ...seedCheckin(), id: 'a', businessDate: '2026-08-01', amount: 2, targetAmount: 2 },
      { ...seedCheckin(), id: 'b', businessDate: '2026-08-02', amount: 3, targetAmount: 3 },
      { ...seedCheckin(), id: 'c', businessDate: '2026-08-02', restDay: true, amount: 0, targetAmount: 0 },
      { ...seedCheckin(), id: 'd', businessDate: '2026-07-30', amount: 9, targetAmount: 9 }, // 上月，不计
    ]
    const s = buildMonthlySummary(checkins, '2026-08-27')
    expect(s).not.toBeNull()
    expect(s!.month).toBe('2026-08')
    expect(s!.actionDays).toBe(2) // 8-01、8-02（休息日不计入行动）
    expect(s!.checkins).toBe(3)
    expect(s!.totalAmount).toBe(5)
    // 本月已过 27 天，行动 2 天 → 行动率 ≈ 7%
    expect(s!.actionRate).toBe(Math.round((2 / 27) * 100))
    expect(s!.restUses).toBe(1)
  })

  it('本月无行动 → actionRate 为 null', () => {
    const s = buildMonthlySummary([], '2026-08-27')
    expect(s!.actionDays).toBe(0)
    expect(s!.actionRate).toBeNull()
  })

  it('非法 today → 返回 null', () => {
    expect(buildMonthlySummary([], 'bad')).toBeNull()
  })
})
