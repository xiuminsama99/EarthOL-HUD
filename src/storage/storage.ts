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
 */
import type {
  Asset,
  AuditScores,
  Bill,
  CheckinRecord,
  EarthData,
  Pet,
  PlayerProfile,
  SavingsAccount,
} from './types'
import type { HabitState } from '../engine/types'

export const STORAGE_KEY = 'earthol-hud:data'
export const CURRENT_VERSION = 2

/** 空数据快照（全新安装起点 / 损坏兜底） */
export function emptyData(): EarthData {
  return {
    profile: null,
    habits: [],
    checkins: [],
    pets: [],
    assets: [],
    savingsAccounts: [],
    bills: [],
  }
}

/**
 * 版本迁移钩子：key 为源版本号，value 为升级函数（接收旧数据，返回新数据）。
 * 1 为当前版本，暂无历史迁移；未来版本演进时在此登记。
 */
export const migrations: Record<number, (prev: unknown) => unknown> = {
  // 1→2：工单 03 档案新增正愿景/反愿景/坏习惯描述/完成引导时间
  1: (prev) => {
    const d = (prev ?? {}) as Record<string, unknown>
    const profile = (d.profile ?? null) as Record<string, unknown> | null
    return {
      ...d,
      profile: profile
        ? {
            ...profile,
            vision: profile.vision ?? null,
            antivision: profile.antivision ?? null,
            badHabitDesc: profile.badHabitDesc ?? null,
            annualGoal: profile.annualGoal ?? null,
            auditScores: profile.auditScores ?? null,
            onboardedAt: profile.onboardedAt ?? null,
          }
        : null,
    }
  },
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 习惯规范化：缺失字段补默认值。
 * 关键兜底：旧数据（v2 及更早）无 actionCount → 默认 0（A4 修复后字段补全，旧 localStorage 数据仍可用）。
 */
function normalizeHabit(h: unknown): HabitState {
  const x = (h ?? {}) as Partial<HabitState>
  return {
    id: typeof x.id === 'string' ? x.id : crypto.randomUUID(),
    name: typeof x.name === 'string' ? x.name : '',
    direction: x.direction === 'negative' ? 'negative' : 'positive',
    baseAmount: typeof x.baseAmount === 'number' && x.baseAmount >= 0 ? x.baseAmount : 1,
    /** R5：旧数据缺 unit 默认「次」（年度效果展示兜底） */
    unit: typeof x.unit === 'string' && x.unit.trim() !== '' ? x.unit : '次',
    cap: typeof x.cap === 'number' ? x.cap : null,
    progressStep: typeof x.progressStep === 'number' ? x.progressStep : 0,
    totalAmount: typeof x.totalAmount === 'number' ? x.totalAmount : 0,
    consistencyDays: typeof x.consistencyDays === 'number' ? x.consistencyDays : 0,
    formationDays: typeof x.formationDays === 'number' ? x.formationDays : 0,
    isFormed: x.isFormed === true,
    vacationCoins: typeof x.vacationCoins === 'number' ? x.vacationCoins : 0,
    lastCheckinDate: typeof x.lastCheckinDate === 'string' ? x.lastCheckinDate : null,
    actionCount:
      typeof x.actionCount === 'number' && Number.isFinite(x.actionCount) && x.actionCount >= 0
        ? x.actionCount
        : 0,
    createdAt: typeof x.createdAt === 'string' ? x.createdAt : '',
  }
}

/** 打卡记录规范化（R4）：缺失 mode 的旧数据默认 'normal'，其余字段类型兜底 */
function normalizeCheckin(c: unknown): CheckinRecord {
  const x = (c ?? {}) as Partial<CheckinRecord>
  return {
    id: typeof x.id === 'string' ? x.id : crypto.randomUUID(),
    habitId: typeof x.habitId === 'string' ? x.habitId : '',
    businessDate: typeof x.businessDate === 'string' ? x.businessDate : '',
    amount: typeof x.amount === 'number' ? x.amount : 0,
    targetAmount: typeof x.targetAmount === 'number' ? x.targetAmount : 0,
    note: typeof x.note === 'string' ? x.note : '',
    restDay: x.restDay === true,
    mode: x.mode === 'minimal' ? 'minimal' : 'normal',
    createdAt: typeof x.createdAt === 'string' ? x.createdAt : '',
  }
}

/** 校验快照结构；非法返回 null（触发兜底） */
function validateData(value: unknown): EarthData | null {
  if (!isRecord(value)) return null
  const d = value as Partial<EarthData>
  if (d.profile !== null && !isRecord(d.profile)) return null
  if (!Array.isArray(d.habits)) return null
  if (!Array.isArray(d.checkins)) return null
  if (!Array.isArray(d.pets)) return null
  if (!Array.isArray(d.assets)) return null
  if (!Array.isArray(d.savingsAccounts)) return null
  if (!Array.isArray(d.bills)) return null
  return {
    profile: d.profile ? normalizeProfile(d.profile as Record<string, unknown>) : null,
    habits: (d.habits as unknown[]).map(normalizeHabit),
    checkins: (d.checkins as unknown[]).map(normalizeCheckin),
    pets: d.pets as Pet[],
    assets: d.assets as Asset[],
    savingsAccounts: d.savingsAccounts as SavingsAccount[],
    bills: d.bills as Bill[],
  }
}

/**
 * 审计分数规范化：四维均须为 1-10 整数，任一非法整块丢弃（返回 null）。
 */
function normalizeAuditScores(v: unknown): AuditScores | null {
  if (!isRecord(v)) return null
  const keys = ['body', 'growth', 'social', 'wealth'] as const
  const out: number[] = []
  for (const k of keys) {
    const n = (v as Record<string, unknown>)[k]
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 10) return null
    out.push(n)
  }
  return { body: out[0], growth: out[1], social: out[2], wealth: out[3] }
}

/** 档案规范化：缺失字段补默认值，保证读出的 profile 字段齐全 */
function normalizeProfile(p: Record<string, unknown>): PlayerProfile {
  return {
    id: typeof p.id === 'string' ? p.id : crypto.randomUUID(),
    identityStatement:
      typeof p.identityStatement === 'string' ? p.identityStatement : null,
    vision: typeof p.vision === 'string' ? p.vision : null,
    antivision: typeof p.antivision === 'string' ? p.antivision : null,
    badHabitDesc: typeof p.badHabitDesc === 'string' ? p.badHabitDesc : null,
    annualGoal: typeof p.annualGoal === 'string' ? p.annualGoal : null,
    auditScores: normalizeAuditScores(p.auditScores),
    personaName: typeof p.personaName === 'string' ? p.personaName : null,
    schedule: p.schedule === 'night' ? 'night' : 'day',
    lastScheduleSwitchAt:
      typeof p.lastScheduleSwitchAt === 'string' ? p.lastScheduleSwitchAt : null,
    petReminderEnabled: p.petReminderEnabled === true,
    petReminderTime:
      typeof p.petReminderTime === 'string' && /^\d{2}:\d{2}$/.test(p.petReminderTime)
        ? p.petReminderTime
        : '20:00',
    lastPetReminderDate:
      typeof p.lastPetReminderDate === 'string' ? p.lastPetReminderDate : null,
    onboardedAt: typeof p.onboardedAt === 'string' ? p.onboardedAt : null,
    createdAt:
      typeof p.createdAt === 'string'
        ? p.createdAt
        : new Date().toISOString(),
  }
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
