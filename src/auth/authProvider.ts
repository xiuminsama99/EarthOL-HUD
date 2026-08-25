/**
 * 登录地基（地球online玩家控制台，工单 02 本地版）
 *
 * 定义 AuthProvider 接口（后置 Supabase / 微信登录时替换实现），
 * 本地版 LocalAuthProvider 无外部依赖，直接基于数据层的玩家档案。
 */
import { EarthStorage } from '../storage/storage'

export type AuthMethod = 'local' | 'wechat' | 'phone'

export interface PlayerSession {
  playerId: string | null
  method: AuthMethod
}

export interface AuthProvider {
  /** 当前登录会话（未登录时 playerId 为 null） */
  getSession(): PlayerSession
  /** 登录：本地版确保玩家档案存在 */
  signIn(): Promise<PlayerSession>
  signOut(): PlayerSession
}

export class LocalAuthProvider implements AuthProvider {
  private storage: EarthStorage

  constructor(storage: EarthStorage) {
    this.storage = storage
  }

  getSession(): PlayerSession {
    const profile = this.storage.getProfile()
    return { playerId: profile?.id ?? null, method: 'local' }
  }

  async signIn(): Promise<PlayerSession> {
    const profile = this.storage.updateProfile({})
    return { playerId: profile.id, method: 'local' }
  }

  signOut(): PlayerSession {
    // 本地版无服务端会话，保留档案（产品数据属于玩家）
    return this.getSession()
  }
}

/** 应用级单例 */
export const authProvider: AuthProvider = new LocalAuthProvider(new EarthStorage())
