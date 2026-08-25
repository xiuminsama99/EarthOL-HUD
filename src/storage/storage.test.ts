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
    cap: null,
    progressStep: 0,
    totalAmount: 0,
    consistencyDays: 0,
    formationDays: 0,
    isFormed: false,
    vacationCoins: 0,
    lastCheckinDate: null,
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
    s.update((d) => ({ ...d, profile: { id: 'p1', identityStatement: null, personaName: null, schedule: 'day', createdAt: '2026-08-25T00:00:00Z' } }))
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
    const base = { amount: 5, targetAmount: 5, note: '今天我以玩家的身份读了 5 页', restDay: false, createdAt: '2026-08-25T00:00:00Z' }
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
})
