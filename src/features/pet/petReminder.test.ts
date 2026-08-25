/**
 * 宠物提醒逻辑测试（R6）
 *
 * 覆盖：时间格式校验、今日提醒时刻（到点前/到点后/非法/跨日）、
 * shouldRemind 判定矩阵（开关/已打卡/已提醒/未到点/到点）、
 * 文案构建、通知发送（无 Notification 环境 → unsupported）。
 * 全部纯函数注入 now，不触碰真实时钟。
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_REMINDER_TIME,
  buildReminderMessage,
  isValidReminderTime,
  nextReminderAt,
  sendPetReminder,
  shouldRemind,
} from './petReminder'

const pet = { id: 'p1', breed: 'cat', name: '糯米', mood: 60, createdAt: '2026-08-27T00:00:00.000Z' }

describe('isValidReminderTime 时间格式校验', () => {
  it('接受合法 HH:mm', () => {
    expect(isValidReminderTime('20:00')).toBe(true)
    expect(isValidReminderTime('00:00')).toBe(true)
    expect(isValidReminderTime('23:59')).toBe(true)
  })
  it('拒绝非法格式', () => {
    expect(isValidReminderTime('')).toBe(false)
    expect(isValidReminderTime('8:00')).toBe(false)
    expect(isValidReminderTime('24:00')).toBe(false)
    expect(isValidReminderTime('20:60')).toBe(false)
    expect(isValidReminderTime('20-00')).toBe(false)
  })
})

describe('nextReminderAt 今日提醒时刻', () => {
  it('到点前返回今天的提醒时刻', () => {
    const now = new Date(2026, 7, 27, 10, 0, 0)
    const at = nextReminderAt(now, '20:00')
    expect(at!.getHours()).toBe(20)
    expect(at!.getMinutes()).toBe(0)
    expect(at!.getTime()).toBeGreaterThan(now.getTime())
  })
  it('到点后仍返回今天的提醒时刻（用于比较 now >= at）', () => {
    const now = new Date(2026, 7, 27, 22, 30, 0)
    const at = nextReminderAt(now, '20:00')
    expect(at!.getTime()).toBeLessThan(now.getTime())
  })
  it('非法时间返回 null', () => {
    expect(nextReminderAt(new Date(), 'abc')).toBeNull()
  })
})

describe('shouldRemind 提醒判定矩阵', () => {
  const now = new Date(2026, 7, 27, 21, 0, 0) // 21:00 已过默认 20:00
  const profile = { petReminderEnabled: true, petReminderTime: DEFAULT_REMINDER_TIME }

  it('到点 + 未打卡 + 未提醒 → 提醒', () => {
    expect(
      shouldRemind({ now, businessDate: '2026-08-27', checkedToday: false, lastRemindedAt: null, profile }),
    ).toBe(true)
  })
  it('开关关闭 → 不提醒', () => {
    expect(
      shouldRemind({ now, businessDate: '2026-08-27', checkedToday: false, lastRemindedAt: null, profile: { ...profile, petReminderEnabled: false } }),
    ).toBe(false)
  })
  it('档案为空 → 不提醒', () => {
    expect(shouldRemind({ now, businessDate: '2026-08-27', checkedToday: false, lastRemindedAt: null, profile: null })).toBe(false)
  })
  it('今天已打卡 → 不提醒', () => {
    expect(
      shouldRemind({ now, businessDate: '2026-08-27', checkedToday: true, lastRemindedAt: null, profile }),
    ).toBe(false)
  })
  it('今天已提醒过（同一业务日）→ 不提醒', () => {
    expect(
      shouldRemind({ now, businessDate: '2026-08-27', checkedToday: false, lastRemindedAt: '2026-08-27', profile }),
    ).toBe(false)
  })
  it('昨天提醒过（不同业务日）→ 提醒', () => {
    expect(
      shouldRemind({ now, businessDate: '2026-08-27', checkedToday: false, lastRemindedAt: '2026-08-26', profile }),
    ).toBe(true)
  })
  it('未到点 → 不提醒', () => {
    const early = new Date(2026, 7, 27, 10, 0, 0)
    expect(
      shouldRemind({ now: early, businessDate: '2026-08-27', checkedToday: false, lastRemindedAt: null, profile }),
    ).toBe(false)
  })
  it('非法提醒时间 → 不提醒', () => {
    expect(
      shouldRemind({ now, businessDate: '2026-08-27', checkedToday: false, lastRemindedAt: null, profile: { ...profile, petReminderTime: '25:00' } }),
    ).toBe(false)
  })
})

describe('buildReminderMessage 文案', () => {
  it('有身份：文案带入身份宣言', () => {
    const msg = buildReminderMessage(pet, '健康的人')
    expect(msg.title).toBe('糯米')
    expect(msg.body).toContain('亲爱的主人')
    expect(msg.body).toContain('健康的人')
  })
  it('无身份：兜底文案', () => {
    const msg = buildReminderMessage(pet, null)
    expect(msg.body).toContain('更好的自己')
  })
})

describe('sendPetReminder 通知发送', () => {
  it('无 Notification 环境（node 测试）→ unsupported', () => {
    expect(sendPetReminder(pet, null)).toBe('unsupported')
  })
})
