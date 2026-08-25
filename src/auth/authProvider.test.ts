import { describe, expect, it } from 'vitest'
import { EarthStorage } from '../storage/storage'
import { LocalAuthProvider } from './authProvider'

function makeStorage(): EarthStorage {
  const store = new Map<string, string>()
  return new EarthStorage({
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value)
    },
  })
}

describe('LocalAuthProvider', () => {
  it('未登录时 session.playerId 为 null', () => {
    const auth = new LocalAuthProvider(makeStorage())
    expect(auth.getSession().playerId).toBeNull()
    expect(auth.getSession().method).toBe('local')
  })

  it('signIn 创建本地玩家档案并持久化', async () => {
    const storage = makeStorage()
    const auth = new LocalAuthProvider(storage)
    const session = await auth.signIn()
    expect(session.playerId).toBeTruthy()
    expect(session.method).toBe('local')
    expect(auth.getSession().playerId).toBe(session.playerId)
    expect(storage.getProfile()?.id).toBe(session.playerId)
  })

  it('signIn 幂等：已有档案时复用同一 id', async () => {
    const storage = makeStorage()
    const auth = new LocalAuthProvider(storage)
    const first = await auth.signIn()
    const second = await auth.signIn()
    expect(first.playerId).toBe(second.playerId)
    expect(storage.getProfile()?.id).toBe(first.playerId)
  })

  it('signOut 保留档案（本地无服务端会话）', async () => {
    const storage = makeStorage()
    const auth = new LocalAuthProvider(storage)
    await auth.signIn()
    auth.signOut()
    expect(storage.getProfile()).not.toBeNull()
    expect(auth.getSession().playerId).toBeTruthy()
  })
})
