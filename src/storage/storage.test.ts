import { afterEach, describe, expect, it } from 'vitest'
import {
  CURRENT_VERSION,
  EarthStorage,
  STORAGE_KEY,
  emptyData,
  migrations,
} from './storage'
import type { HabitState } from '../engine/types'

function makeBackend() {
  const store = new Map<string, string>()
  return {
    backend: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
    },
    store,
  }
}

function makeHabit(over: Partial<HabitState> = {}): HabitState {
  return {
    id: 'h1',
    name: '测试习惯',
    direction: 'positive',
    baseAmount: 10,
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
    createdAt: '2026-08-25',
    ...over,
  }
}

describe('EarthStorage 数据层', () => {
  afterEach(() => {
    delete migrations[0]
  })

  it('空存储返回默认空快照', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    expect(s.read()).toEqual(emptyData())
  })

  it('写入后读取 roundtrip', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    s.update((d) => ({ ...d, profile: { id: 'p1', identityStatement: null, vision: null, antivision: null, badHabitDesc: null, annualGoal: null, auditScores: null, personaName: null, schedule: 'day', lastScheduleSwitchAt: null, onboardedAt: null, createdAt: '2026-08-25T00:00:00Z' } }))
    const read = s.read()
    expect(read.profile?.id).toBe('p1')
    expect(read.habits).toEqual([])
  })

  it('update 是读-改-写原子原语（多次累积）', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    s.update((d) => ({ ...d, habits: [makeHabit()] }))
    s.update((d) => ({ ...d, habits: [...d.habits, makeHabit({ id: 'h2', baseAmount: 20 })] }))
    expect(s.listHabits().length).toBe(2)
  })

  it('损坏 JSON 兜底为空快照', () => {
    const { backend, store } = makeBackend()
    store.set(STORAGE_KEY, '{oops-not-json')
    const s = new EarthStorage(backend)
    expect(s.read()).toEqual(emptyData())
  })

  it('非法结构兜底为空快照', () => {
    const { backend, store } = makeBackend()
    store.set(STORAGE_KEY, JSON.stringify({ version: 1, data: { profile: 'not-an-object', habits: 'nope' } }))
    const s = new EarthStorage(backend)
    expect(s.read()).toEqual(emptyData())
  })

  it('旧版本数据走迁移钩子升级', () => {
    const { backend, store } = makeBackend()
    // 模拟 v0 旧格式（无 envelope），注册 v0→v1 迁移钩子补上缺失字段
    store.set(STORAGE_KEY, JSON.stringify({ profile: null, habits: [makeHabit()] }))
    migrations[0] = (prev) => {
      const p = prev as { profile?: unknown; habits?: unknown }
      return { profile: p.profile ?? null, habits: p.habits ?? [], checkins: [], pets: [], assets: [], savingsAccounts: [], bills: [] }
    }
    const s = new EarthStorage(backend)
    const data = s.read()
    expect(data.habits).toHaveLength(1)
    expect(data.checkins).toEqual([])
  })

  it('当前版本数据不做迁移直接读取', () => {
    const { backend, store } = makeBackend()
    store.set(STORAGE_KEY, JSON.stringify({ version: CURRENT_VERSION, data: { profile: null, habits: [], checkins: [], pets: [], assets: [], savingsAccounts: [], bills: [] } }))
    const s = new EarthStorage(backend)
    expect(s.read()).toEqual(emptyData())
  })

  it('updateProfile 首次调用创建档案，再次调用打补丁且 id 不变', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    const created = s.updateProfile({})
    expect(created.schedule).toBe('day')
    const patched = s.updateProfile({ schedule: 'night', identityStatement: '我是健康的人' })
    expect(patched.id).toBe(created.id)
    expect(patched.schedule).toBe('night')
    expect(s.getProfile()?.identityStatement).toBe('我是健康的人')
  })

  it('习惯 CRUD：增改查删', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    s.upsertHabit(makeHabit())
    expect(s.getHabit('h1')?.baseAmount).toBe(10)
    s.upsertHabit(makeHabit({ baseAmount: 12 }))
    expect(s.getHabit('h1')?.baseAmount).toBe(12)
    expect(s.listHabits()).toHaveLength(1)
    s.removeHabit('h1')
    expect(s.getHabit('h1')).toBeNull()
  })

  it('打卡记录：写入并按习惯过滤', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    const base = { amount: 5, targetAmount: 5, note: '今天我以玩家的身份读了 5 页', restDay: false, mode: 'normal' as const, createdAt: '2026-08-25T00:00:00Z' }
    s.addCheckin({ id: 'c1', habitId: 'h1', businessDate: '2026-08-25', ...base })
    s.addCheckin({ id: 'c2', habitId: 'h2', businessDate: '2026-08-25', ...base })
    expect(s.listCheckins()).toHaveLength(2)
    expect(s.listCheckins('h1')).toHaveLength(1)
    expect(s.listCheckins('h1')[0]?.id).toBe('c1')
  })

  it('reset 清空全部数据', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    s.updateProfile({})
    s.upsertHabit(makeHabit())
    s.reset()
    expect(s.read()).toEqual(emptyData())
  })

  it('A4：旧数据习惯缺 actionCount 时读回默认 0（旧 localStorage 数据可用）', () => {
    const { backend, store } = makeBackend()
    const legacy = makeHabit() as unknown as Record<string, unknown>
    delete legacy.actionCount
    store.set(
      STORAGE_KEY,
      JSON.stringify({
        version: CURRENT_VERSION,
        data: {
          profile: null,
          habits: [legacy],
          checkins: [],
          pets: [],
          assets: [],
          savingsAccounts: [],
          bills: [],
        },
      }),
    )
    const s = new EarthStorage(backend)
    expect(s.listHabits()[0]?.actionCount).toBe(0)
    expect(s.listHabits()[0]?.name).toBe('测试习惯') // 其余字段原样保留
  })

  it('R5：旧数据习惯缺 unit 时读回默认「次」（旧 localStorage 数据可用）', () => {
    const { backend, store } = makeBackend()
    const legacy = makeHabit() as unknown as Record<string, unknown>
    delete legacy.unit
    store.set(
      STORAGE_KEY,
      JSON.stringify({
        version: CURRENT_VERSION,
        data: {
          profile: null,
          habits: [legacy],
          checkins: [],
          pets: [],
          assets: [],
          savingsAccounts: [],
          bills: [],
        },
      }),
    )
    const s = new EarthStorage(backend)
    expect(s.listHabits()[0]?.unit).toBe('次')
    expect(s.listHabits()[0]?.name).toBe('测试习惯') // 其余字段原样保留
  })

  it('A4：已含 actionCount 的数据原样读回', () => {
    const { backend, store } = makeBackend()
    store.set(
      STORAGE_KEY,
      JSON.stringify({
        version: CURRENT_VERSION,
        data: {
          profile: null,
          habits: [makeHabit({ actionCount: 7 })],
          checkins: [],
          pets: [],
          assets: [],
          savingsAccounts: [],
          bills: [],
        },
      }),
    )
    const s = new EarthStorage(backend)
    expect(s.listHabits()[0]?.actionCount).toBe(7)
  })

  it('B1：旧档案缺 lastScheduleSwitchAt 时读回 null（旧 localStorage 数据可用）', () => {
    const { backend, store } = makeBackend()
    const legacyProfile = {
      id: 'p1',
      identityStatement: '我是健康的人',
      vision: null,
      antivision: null,
      badHabitDesc: null,
      personaName: null,
      schedule: 'day',
      onboardedAt: '2026-08-25T00:00:00Z',
      createdAt: '2026-08-25T00:00:00Z',
    }
    store.set(
      STORAGE_KEY,
      JSON.stringify({
        version: CURRENT_VERSION,
        data: {
          profile: legacyProfile,
          habits: [],
          checkins: [],
          pets: [],
          assets: [],
          savingsAccounts: [],
          bills: [],
        },
      }),
    )
    const s = new EarthStorage(backend)
    expect(s.getProfile()?.lastScheduleSwitchAt).toBeNull()
    expect(s.getProfile()?.annualGoal).toBeNull() // R1：旧档案缺 annualGoal 读回 null
    expect(s.getProfile()?.identityStatement).toBe('我是健康的人') // 其余字段原样保留
  })

  it('B1：已含 lastScheduleSwitchAt 的档案原样读回', () => {
    const { backend, store } = makeBackend()
    store.set(
      STORAGE_KEY,
      JSON.stringify({
        version: CURRENT_VERSION,
        data: {
          profile: {
            id: 'p1',
            identityStatement: null,
            vision: null,
            antivision: null,
            badHabitDesc: null,
            personaName: null,
            schedule: 'night',
            lastScheduleSwitchAt: '2026-08-25T12:00:00+08:00',
            onboardedAt: null,
            createdAt: '2026-08-25T00:00:00Z',
          },
          habits: [],
          checkins: [],
          pets: [],
          assets: [],
          savingsAccounts: [],
          bills: [],
        },
      }),
    )
    const s = new EarthStorage(backend)
    expect(s.getProfile()?.lastScheduleSwitchAt).toBe('2026-08-25T12:00:00+08:00')
  })

  it('R2：旧档案缺 auditScores 时读回 null（旧 localStorage 数据可用）', () => {
    const { backend, store } = makeBackend()
    const legacyProfile = {
      id: 'p1',
      identityStatement: '我是健康的人',
      vision: null,
      antivision: null,
      badHabitDesc: null,
      annualGoal: null,
      personaName: null,
      schedule: 'day',
      onboardedAt: '2026-08-25T00:00:00Z',
      createdAt: '2026-08-25T00:00:00Z',
    }
    store.set(
      STORAGE_KEY,
      JSON.stringify({
        version: CURRENT_VERSION,
        data: {
          profile: legacyProfile,
          habits: [],
          checkins: [],
          pets: [],
          assets: [],
          savingsAccounts: [],
          bills: [],
        },
      }),
    )
    const s = new EarthStorage(backend)
    expect(s.getProfile()?.auditScores).toBeNull()
    expect(s.getProfile()?.identityStatement).toBe('我是健康的人') // 其余字段原样保留
  })

  it('R2：已含合法 auditScores 的档案原样读回', () => {
    const { backend, store } = makeBackend()
    store.set(
      STORAGE_KEY,
      JSON.stringify({
        version: CURRENT_VERSION,
        data: {
          profile: {
            id: 'p1',
            identityStatement: null,
            vision: null,
            antivision: null,
            badHabitDesc: null,
            annualGoal: null,
            auditScores: { body: 3, growth: 6, social: 8, wealth: 5 },
            personaName: null,
            schedule: 'day',
            lastScheduleSwitchAt: null,
            onboardedAt: null,
            createdAt: '2026-08-25T00:00:00Z',
          },
          habits: [],
          checkins: [],
          pets: [],
          assets: [],
          savingsAccounts: [],
          bills: [],
        },
      }),
    )
    const s = new EarthStorage(backend)
    expect(s.getProfile()?.auditScores).toEqual({ body: 3, growth: 6, social: 8, wealth: 5 })
  })

  it('R2：非法 auditScores（越界/缺维度）整块兜底为 null', () => {
    const { backend, store } = makeBackend()
    store.set(
      STORAGE_KEY,
      JSON.stringify({
        version: CURRENT_VERSION,
        data: {
          profile: {
            id: 'p1',
            identityStatement: null,
            vision: null,
            antivision: null,
            badHabitDesc: null,
            annualGoal: null,
            auditScores: { body: 0, growth: 6, social: 8, wealth: 5 },
            personaName: null,
            schedule: 'day',
            lastScheduleSwitchAt: null,
            onboardedAt: null,
            createdAt: '2026-08-25T00:00:00Z',
          },
          habits: [],
          checkins: [],
          pets: [],
          assets: [],
          savingsAccounts: [],
          bills: [],
        },
      }),
    )
    const s = new EarthStorage(backend)
    expect(s.getProfile()?.auditScores).toBeNull()
  })

  it('R4：旧数据缺 mode 字段 → 读回规范化默认 normal', () => {
    const { backend } = makeBackend()
    // 直接写一份缺 mode 的旧数据（v2 时代的打卡记录形状）
    backend.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: CURRENT_VERSION,
        data: {
          profile: null,
          habits: [],
          checkins: [
            {
              id: 'c1',
              habitId: 'h1',
              businessDate: '2026-08-25',
              amount: 5,
              targetAmount: 5,
              note: '旧数据',
              restDay: false,
              createdAt: '2026-08-25T00:00:00Z',
            },
          ],
          pets: [],
          assets: [],
          savingsAccounts: [],
          bills: [],
        },
      }),
    )
    const s = new EarthStorage(backend)
    const rec = s.listCheckins()[0]
    expect(rec.mode).toBe('normal') // 旧数据默认 normal
  })

  it('R4：minimal 记录保持 mode=minimal 不被规范化覆盖', () => {
    const { backend } = makeBackend()
    backend.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: CURRENT_VERSION,
        data: {
          profile: null,
          habits: [],
          checkins: [
            {
              id: 'c1',
              habitId: 'h1',
              businessDate: '2026-08-25',
              amount: 1,
              targetAmount: 5,
              note: '最低版本',
              restDay: false,
              mode: 'minimal',
              createdAt: '2026-08-25T00:00:00Z',
            },
          ],
          pets: [],
          assets: [],
          savingsAccounts: [],
          bills: [],
        },
      }),
    )
    const s = new EarthStorage(backend)
    expect(s.listCheckins()[0]?.mode).toBe('minimal')
  })
})
