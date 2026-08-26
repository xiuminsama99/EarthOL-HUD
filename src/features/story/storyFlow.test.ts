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
      ['休息', '最低版本', '未达标', '超额', '达标'],
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
})
