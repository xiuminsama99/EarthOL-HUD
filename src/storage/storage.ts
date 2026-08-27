/**
 * localStorage 数据层（地球online玩家控制台，工单 02 本地版）
 *
 * 设计：
 * - 单 key 快照持久化（earthol-hud:data），写入时整体原子替换
 * - 版本号 + 顺序迁移钩子：读到旧版本数据时逐版升级到当前版本
 * - 防损坏兜底：JSON 损坏 / 结构非法时返回默认空数据，不抛异常
 * - 全部写操作收敛到 update()（读-改-写原语），上层派生便捷 CRUD
 *
 * BaaS（Supabase）后置时以本层为接口面替换实现。
 *
 * 本文件只承载**读写层**（StorageBackend / defaultBackend / EarthStorage / 单例）。
 * schema 相关（normalize/validate/serialize/parse/常量）→ `./schema`；
 * 版本迁移（migrations）→ `./migrations`。
 * 通过重导出桶把 `./storage` 保持为兼容所有既有 import（含测试）的入口。
 */
import type {
  Asset,
  AppSettings,
  Bill,
  CheckinRecord,
  EarthData,
  Pet,
  PlayerProfile,
  SavingsAccount,
} from './types'
import type { HabitState } from '../engine/types'
import { STORAGE_KEY, CURRENT_VERSION, emptyData, validateData, isRecord } from './schema'
import { migrations } from './migrations'

// ---- 重导出桶：保持 `./storage` 兼容既有 import 与 storage.test 依赖 ----
export * from './schema'
export { migrations } from './migrations'

export interface StorageBackend {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const defaultBackend: StorageBackend = {
  getItem: (key) => {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value)
    } catch {
      // 隐私模式 / 配额超限：静默失败，内存态保持可用
    }
  },
}

export class EarthStorage {
  private backend: StorageBackend

  constructor(backend: StorageBackend = defaultBackend) {
    this.backend = backend
  }

  /** 读快照；损坏自动兜底为空数据 */
  read(): EarthData {
    const raw = this.backend.getItem(STORAGE_KEY)
    if (raw === null) return emptyData()
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return emptyData()
    }
    let version = 0
    let data: unknown = parsed
    if (isRecord(parsed) && typeof parsed.version === 'number') {
      version = parsed.version
      data = parsed.data
    }
    // 顺序迁移：旧版本数据逐版升级到当前版本
    while (version < CURRENT_VERSION) {
      const migrate = migrations[version]
      if (migrate) data = migrate(data)
      version += 1
    }
    return validateData(data) ?? emptyData()
  }

  /** 原子写：mutator 基于当前快照返回新快照后整体替换 */
  update(mutator: (data: EarthData) => EarthData): EarthData {
    const next = mutator(this.read())
    const envelope = JSON.stringify({ version: CURRENT_VERSION, data: next })
    this.backend.setItem(STORAGE_KEY, envelope)
    return next
  }

  /** 清空全部数据 */
  reset(): void {
    const envelope = JSON.stringify({ version: CURRENT_VERSION, data: emptyData() })
    this.backend.setItem(STORAGE_KEY, envelope)
  }

  /** 整体替换数据快照（R10b-5 导入存档用）；调用方须先经 parseData 校验 */
  replaceAll(data: EarthData): EarthData {
    const envelope = JSON.stringify({ version: CURRENT_VERSION, data })
    this.backend.setItem(STORAGE_KEY, envelope)
    return data
  }

  // ---- 应用设置 ----
  getSettings(): AppSettings {
    return this.read().settings
  }

  /** 打补丁合并设置（缺省保持原值） */
  updateSettings(patch: Partial<AppSettings>): AppSettings {
    const next: AppSettings = { ...this.getSettings(), ...patch }
    this.update((d) => ({ ...d, settings: next }))
    return next
  }

  // ---- 玩家档案 ----
  getProfile(): PlayerProfile | null {
    return this.read().profile
  }

  /** 创建或补丁玩家档案（首次调用自动生成 id 与默认作息） */
  updateProfile(patch: Partial<Omit<PlayerProfile, 'id' | 'createdAt'>>): PlayerProfile {
    const current = this.read().profile
    const profile: PlayerProfile = current ?? {
      id: crypto.randomUUID(),
      identityStatement: null,
      vision: null,
      antivision: null,
      badHabitDesc: null,
      annualGoal: null,
      auditScores: null,
      personaName: null,
      schedule: 'day',
      lastScheduleSwitchAt: null,
      petReminderEnabled: false,
      petReminderTime: '20:00',
      lastPetReminderDate: null,
      onboardedAt: null,
      createdAt: new Date().toISOString(),
    }
    const next: PlayerProfile = { ...profile, ...patch }
    this.update((d) => ({ ...d, profile: next }))
    return next
  }

  // ---- 习惯 ----
  getHabit(id: string): HabitState | null {
    return this.read().habits.find((h) => h.id === id) ?? null
  }

  listHabits(): HabitState[] {
    return this.read().habits
  }

  upsertHabit(habit: HabitState): HabitState {
    this.update((d) => {
      const exists = d.habits.some((h) => h.id === habit.id)
      return {
        ...d,
        habits: exists
          ? d.habits.map((h) => (h.id === habit.id ? habit : h))
          : [...d.habits, habit],
      }
    })
    return habit
  }

  removeHabit(id: string): void {
    this.update((d) => ({ ...d, habits: d.habits.filter((h) => h.id !== id) }))
  }

  // ---- 打卡记录 ----
  addCheckin(record: CheckinRecord): CheckinRecord {
    this.update((d) => ({ ...d, checkins: [...d.checkins, record] }))
    return record
  }

  listCheckins(habitId?: string): CheckinRecord[] {
    const all = this.read().checkins
    return habitId === undefined ? all : all.filter((c) => c.habitId === habitId)
  }

  /** 更新单条打卡记录的 note（R10b-4 我的故事：当天条可编辑，其余字段只读）；返回更新后的记录，未找到返回 null */
  updateCheckinNote(id: string, note: string): CheckinRecord | null {
    let updated: CheckinRecord | null = null
    this.update((d) => ({
      ...d,
      checkins: d.checkins.map((c) => {
        if (c.id !== id) return c
        updated = { ...c, note }
        return updated
      }),
    }))
    return updated
  }

  /** 删除单条打卡记录（R10b-4 我的故事：仅允许删除当天条，历史只读）；返回被删除的记录，未找到返回 null */
  removeCheckin(id: string): CheckinRecord | null {
    let removed: CheckinRecord | null = null
    this.update((d) => {
      const target = d.checkins.find((c) => c.id === id) ?? null
      removed = target
      return { ...d, checkins: d.checkins.filter((c) => c.id !== id) }
    })
    return removed
  }

  // ---- 宠物 / 资产 / 存钱账户 / 账单 ----
  listPets(): Pet[] {
    return this.read().pets
  }

  upsertPet(pet: Pet): Pet {
    this.update((d) => {
      const exists = d.pets.some((p) => p.id === pet.id)
      return { ...d, pets: exists ? d.pets.map((p) => (p.id === pet.id ? pet : p)) : [...d.pets, pet] }
    })
    return pet
  }

  listAssets(): Asset[] {
    return this.read().assets
  }

  upsertAsset(asset: Asset): Asset {
    this.update((d) => {
      const exists = d.assets.some((a) => a.id === asset.id)
      return { ...d, assets: exists ? d.assets.map((a) => (a.id === asset.id ? asset : a)) : [...d.assets, asset] }
    })
    return asset
  }

  listSavingsAccounts(): SavingsAccount[] {
    return this.read().savingsAccounts
  }

  upsertSavingsAccount(account: SavingsAccount): SavingsAccount {
    this.update((d) => {
      const exists = d.savingsAccounts.some((a) => a.id === account.id)
      return {
        ...d,
        savingsAccounts: exists
          ? d.savingsAccounts.map((a) => (a.id === account.id ? account : a))
          : [...d.savingsAccounts, account],
      }
    })
    return account
  }

  addBill(bill: Bill): Bill {
    this.update((d) => ({ ...d, bills: [...d.bills, bill] }))
    return bill
  }

  listBills(): Bill[] {
    return this.read().bills
  }
}

/** 应用级单例（UI 与后续工单统一入口） */
export const earthStorage = new EarthStorage()
