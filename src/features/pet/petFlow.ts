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
/** 心情分段文案（0-100），纯函数供 UI 复用 */
export function moodLabel(mood: number): string {
  if (mood >= 80) return '元气满满'
  if (mood >= 50) return '心情不错'
  if (mood >= 20) return '一般般'
  return '有点低落'
}

/** 领养初始心情 */
export const MOOD_INITIAL = 60

/** 打卡事件（驱动心情变化的唯一入口） */
export type PetMoodEvent =
  | 'checkin' // 正常达标打卡
  | 'checkin-extra' // 超额（做得更多）
  | 'checkin-backoff' // 缺勤归来打卡（漏卡低落）
  | 'rest-day' // 假期币休息日

/** 心情规则表（MVP 简单规则；后续可换成状态镜像 / 更平滑的曲线） */
const MOOD_DELTAS: Record<PetMoodEvent, number> = {
  'checkin': 4,
  'checkin-extra': 6,
  'checkin-backoff': -4,
  'rest-day': 0,
}

/** 心情转移函数（纯函数，可独立测试） */
export function nextMood(current: number, event: PetMoodEvent): number {
  const delta = MOOD_DELTAS[event]
  return Math.max(MOOD_MIN, Math.min(MOOD_MAX, current + delta))
}

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
