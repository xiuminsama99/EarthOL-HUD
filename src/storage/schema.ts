/**
 * 数据 schema 层：领域模型规范化 + 版本常量 + 序列化/解析（工单 02 本地版）
 *
 * 职责（从原 storage.ts 拆出）：
 * - 版本常量：STORAGE_KEY / CURRENT_VERSION / DEFAULT_SETTINGS
 * - 空数据快照：emptyData
 * - 序列化/解析：serializeData / parseData / ParseErrorCode
 * - schema 表达式：normalizeHabit/Checkin/Settings/Profile/AuditScores + validateData + isRecord
 *
 * 纯函数层：无副作用、无 IO（localStorage 不在此），可独立测试。
 * BaaS（Supabase）后置时以本层为数据形状规范（schema）的接口面。
 */
import type {
  Asset,
  AppSettings,
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

/** 应用级设置的默认值（缺失字段 / 旧数据兜底） */
export const DEFAULT_SETTINGS: AppSettings = {
  soundOn: true,
}

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
    settings: { ...DEFAULT_SETTINGS },
  }
}

/** 导入解析错误码（R10b-5）：供 UI 反馈与测试断言 */
export type ParseErrorCode = 'invalid-json' | 'wrong-version' | 'invalid-structure'

/**
 * 序列化完整数据为可下载的存档 JSON（含版本 envelope，保留未来迁移升级能力）。
 * 与本层持久化格式一致：{ version, data }。
 */
export function serializeData(data: EarthData): string {
  return JSON.stringify({ version: CURRENT_VERSION, data }, null, 2)
}

/**
 * 解析导入的存档 JSON。
 * - 损坏 JSON → 'invalid-json'
 * - 版本缺失/超前/落后于当前 → 'wrong-version'（拒绝跨版本导入，避免脏数据）
 * - 结构非法（validateData 返回 null）→ 'invalid-structure'
 * 合法则返回规范化后的数据（字段兜底由 validateData 保证）。
 */
export function parseData(json: string): { data: EarthData | null; error: ParseErrorCode | null } {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { data: null, error: 'invalid-json' }
  }
  if (!isRecord(parsed) || typeof parsed.version !== 'number') {
    return { data: null, error: 'wrong-version' }
  }
  if (parsed.version !== CURRENT_VERSION) {
    return { data: null, error: 'wrong-version' }
  }
  const validated = validateData(parsed.data)
  if (!validated) {
    return { data: null, error: 'invalid-structure' }
  }
  return { data: validated, error: null }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
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
    /** R-1 窗口制养成：旧数据无 formationDateList → 空数组（窗口从打卡起重新计；isFormed 保留） */
    formationDateList: Array.isArray(x.formationDateList) ? x.formationDateList : [],
    formationDays: typeof x.formationDays === 'number' ? x.formationDays : 0,
    isFormed: x.isFormed === true,
    vacationCoins: typeof x.vacationCoins === 'number' ? x.vacationCoins : 0,
    /** BUG-1：旧数据无 streakDays → 默认 0（连续计数从下次打卡起重新计） */
    streakDays: typeof x.streakDays === 'number' ? x.streakDays : 0,
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
    mode: x.mode === 'minimal' ? 'minimal' : x.mode === 'quit-maintain' ? 'quit-maintain' : 'normal',
    habitBefore:
      x.habitBefore && typeof x.habitBefore === 'object'
        ? (x.habitBefore as HabitState)
        : undefined,
    createdAt: typeof x.createdAt === 'string' ? x.createdAt : '',
  }
}

/** 应用设置规范化：缺失字段补默认值（旧数据兜底） */
function normalizeSettings(s: unknown): AppSettings {
  const x = (s ?? {}) as Partial<AppSettings>
  return {
    soundOn: x.soundOn !== false,
  }
}

/** 校验快照结构；非法返回 null（触发兜底） */
export function validateData(value: unknown): EarthData | null {
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
    settings: normalizeSettings(d.settings),
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
