/**
 * 领养宠物流程逻辑（工单 04）
 *
 * 宠物是产品的「情感锚点」：品种选择 → 起名 → 持久化到宠物档案。
 * 心情（0-100）由打卡事件驱动（MVP 简单规则表，引擎外扩展，后续工单可换）。
 * UI 组件只做品种选择与文案编排，不承载校验规则。
 *
 * 依赖注入：storage 由调用方传入，测试注入 Map backend 的 EarthStorage。
 */
import type { EarthStorage } from '../../storage/storage'
import type { Pet } from '../../storage/types'

/** 宠物品种（MVP 三种起步：猫 / 狗 / 小恐龙） */
export interface PetBreed {
  id: string
  label: string
  /** 一句话性格文案（展示在品种选择卡上） */
  tagline: string
}

export const PET_BREEDS: PetBreed[] = [
  { id: 'cat', label: '猫', tagline: '优雅的独行侠，偶尔蹭蹭你' },
  { id: 'dog', label: '狗', tagline: '永远摇尾巴的忠诚伙伴' },
  { id: 'dino', label: '小恐龙', tagline: '小小的身体，大大的勇气' },
]

export const MOOD_MAX = 100
export const MOOD_MIN = 0
/** 心情分段文案（0-100），纯函数供 UI 复用（R10b-4：低于 40 用「想你了」低落文案） */
export function moodLabel(mood: number, name = ''): string {
  if (mood >= 80) return '元气满满'
  if (mood >= 50) return '心情不错'
  if (mood >= 40) return '一般般'
  if (mood < 40 && name) return `${name}有点想你`
  return '有点低落'
}

/** 领养初始心情 */
export const MOOD_INITIAL = 60

/** 打卡事件（驱动心情变化的唯一入口） */
export type PetMoodEvent =
  | 'checkin' // 正常达标打卡
  | 'checkin-extra' // 超额（做得更多）
  | 'checkin-backoff' // 缺勤归来打卡（R10b-4：回归是开心，不再低落）
  | 'rest-day' // 假期币休息日

/** 心情规则表（R10b-4：缺勤归来改为 +6，比日常 +4 略高，体现「你回来了」） */
const MOOD_DELTAS: Record<PetMoodEvent, number> = {
  'checkin': 4,
  'checkin-extra': 6,
  'checkin-backoff': 6,
  'rest-day': 0,
}

/** 心情转移函数（纯函数，可独立测试） */
export function nextMood(current: number, event: PetMoodEvent): number {
  const delta = MOOD_DELTAS[event]
  return Math.max(MOOD_MIN, Math.min(MOOD_MAX, current + delta))
}

// ---- R10b-4 A-1：心情衰减（连漏卡「想你」但不惩罚归零） ----
/** 每漏一天扣除的心情 */
export const MOOD_DECAY_PER_DAY = 2
/** 连漏心情衰减封顶（不归零，符合「不惩罚」哲学） */
export const MOOD_DECAY_CAP = 20

/** 计算连漏衰减后的心情（纯函数）：漏 N 天扣 N*2，封顶 -20，不越过 MOOD_MIN */
export function moodAfterDecay(current: number, missedDays: number): number {
  const decay = Math.min(Math.max(0, missedDays) * MOOD_DECAY_PER_DAY, MOOD_DECAY_CAP)
  return Math.max(MOOD_MIN, current - decay)
}

/** 摸头互动每天一次，心情 +MOOD_PET_DELTA */
export const MOOD_PET_DELTA = 2
export const PET_PET_ERROR = '它今天已经蹭过你手心了'

export interface PetDeps {
  storage: Pick<EarthStorage, 'listPets' | 'upsertPet'>
}

export interface AdoptInput {
  /** 品种 id（PET_BREEDS 之一） */
  breed: string
  name: string
}

export interface AdoptResult {
  pet: Pet | null
  error: string | null
}

/** 领养：校验品种与名字 → 建宠物档案（初始心情 MOOD_INITIAL）→ 持久化 */
export function adoptPet(deps: PetDeps, input: AdoptInput): AdoptResult {
  const breed = PET_BREEDS.find((b) => b.id === input.breed)
  if (!breed) {
    return { pet: null, error: '请选择一个宠物品种' }
  }
  const name = input.name.trim()
  if (name.length === 0) {
    return { pet: null, error: '给它起个名字吧，它会记住的' }
  }
  if (name.length > 20) {
    return { pet: null, error: '名字最长 20 字' }
  }
  const pet: Pet = {
    id: crypto.randomUUID(),
    breed: breed.id,
    name,
    mood: MOOD_INITIAL,
    lastMoodSettleDate: null,
    lastPettedDate: null,
    createdAt: new Date().toISOString(),
  }
  deps.storage.upsertPet(pet)
  return { pet, error: null }
}

/** 当前宠物（第一只即主宠物；未领养返回 null） */
export function getPet(deps: PetDeps): Pet | null {
  return deps.storage.listPets()[0] ?? null
}

/** 是否已领养（App 路由跳转判定） */
export function hasPet(deps: PetDeps): boolean {
  return getPet(deps) !== null
}

/** 打卡事件驱动心情：读当前宠物 → 算新心情 → 写回；无宠物时安全返回 null */
export function recordPetMood(deps: PetDeps, event: PetMoodEvent): Pet | null {
  const pet = getPet(deps)
  if (!pet) return null
  const next: Pet = { ...pet, mood: nextMood(pet.mood, event) }
  deps.storage.upsertPet(next)
  return next
}

// ---- R10b-4：心情衰减结算 + 摸头互动 + 成长形态标志 ----

/** YYYY-MM-DD 之间的日历日差（b - a），通用日期工具 */
function calendarDaysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  const ta = Date.UTC(ay, am - 1, ad)
  const tb = Date.UTC(by, bm - 1, bd)
  return Math.round((tb - ta) / 86_400_000)
}

export interface PetDecayResult {
  pet: Pet | null
  /** 本次结算的漏卡天数（>0 表示有衰减发生） */
  settledDays: number
}

/**
 * 心情衰减结算（每天打开主界面时调用一次，幂等）。
 * 距上次结算（lastMoodSettleDate）超过 1 天（即完整漏了一天）才衰减：
 * 每漏一天 moodAfterDecay -2，封顶 -20，不归零；更新 lastMoodSettleDate 为今日。
 * 第一天（尚未结算过）仅记录结算日，不衰减（避免领养当天无端掉心情）。
 */
export function settlePetMoodDecay(deps: PetDeps, businessDate: string): PetDecayResult {
  const pet = getPet(deps)
  if (!pet) return { pet: null, settledDays: 0 }
  const last = pet.lastMoodSettleDate ?? null
  if (!last) {
    const first: Pet = { ...pet, lastMoodSettleDate: businessDate }
    deps.storage.upsertPet(first)
    return { pet: first, settledDays: 0 }
  }
  // 完整漏卡天数 = 两个业务日之间差 - 1（当天未结算不算漏；同一天/昨天均不衰减）
  const missedDays = Math.max(0, calendarDaysBetween(last, businessDate) - 1)
  const next: Pet = {
    ...pet,
    mood: moodAfterDecay(pet.mood, missedDays),
    lastMoodSettleDate: businessDate,
  }
  deps.storage.upsertPet(next)
  return { pet: next, settledDays: missedDays }
}

/** 摸摸头互动：每天一次，心情 +2；当天已互动被拒（不消耗、状态不变） */
export function petPet(deps: PetDeps, businessDate: string): { pet: Pet | null; error: string | null } {
  const pet = getPet(deps)
  if (!pet) return { pet: null, error: '还没有宠物伙伴' }
  if (pet.lastPettedDate === businessDate) {
    return { pet, error: PET_PET_ERROR }
  }
  const next: Pet = {
    ...pet,
    mood: Math.max(MOOD_MIN, Math.min(MOOD_MAX, pet.mood + MOOD_PET_DELTA)),
    lastPettedDate: businessDate,
  }
  deps.storage.upsertPet(next)
  return { pet: next, error: null }
}
