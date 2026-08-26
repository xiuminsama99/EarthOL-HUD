/**
 * 领养宠物流程测试（工单 04）
 *
 * 覆盖：品种校验（≥3 种含猫/狗/小恐龙）、起名（必填/长度）、档案持久化回读、
 * hasPet 领养判定、心情规则表（打卡涨/漏卡低落/clamp 边界）、
 * 无宠物时心情记录安全返回。
 */
import { describe, expect, it } from 'vitest'
import { EarthStorage } from '../../storage/storage'
import {
  MOOD_INITIAL,
  MOOD_MAX,
  MOOD_MIN,
  PET_BREEDS,
  adoptPet,
  getPet,
  hasPet,
  nextMood,
  recordPetMood,
  moodAfterDecay,
  settlePetMoodDecay,
  petPet,
  MOOD_DECAY_CAP,
  MOOD_PET_DELTA,
  PET_PET_ERROR,
  moodLabel,
} from './petFlow'

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

function adoptPetHelper(storage: EarthStorage, over: Partial<{ breed: string; name: string }> = {}) {
  return adoptPet({ storage }, { breed: 'cat', name: '糯米', ...over })
}

describe('PET_BREEDS 品种清单', () => {
  it('至少 3 种且含猫 / 狗 / 小恐龙', () => {
    expect(PET_BREEDS.length).toBeGreaterThanOrEqual(3)
    const ids = PET_BREEDS.map((b) => b.id)
    expect(ids).toContain('cat')
    expect(ids).toContain('dog')
    expect(ids).toContain('dino')
  })
})

describe('adoptPet 领养流程', () => {
  it('领养成功：品种 + 名字写入档案，初始心情 60，可回读', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    const result = adoptPet({ storage: s }, { breed: 'cat', name: ' 糯米 ' })
    expect(result.error).toBeNull()
    const pet = result.pet!
    expect(pet.breed).toBe('cat')
    expect(pet.name).toBe('糯米')
    expect(pet.mood).toBe(MOOD_INITIAL)
    // 持久化回读
    const reread = getPet({ storage: s })
    expect(reread?.id).toBe(pet.id)
    expect(reread?.breed).toBe('cat')
    expect(reread?.name).toBe('糯米')
  })

  it('未选品种被拒绝', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    const result = adoptPet({ storage: s }, { breed: 'dragon', name: '小火' })
    expect(result.error).toContain('请选择一个宠物品种')
    expect(s.listPets()).toHaveLength(0)
  })

  it('名字必填：空白名字被拒绝', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    expect(adoptPetHelper(s, { name: '   ' }).error).toContain('起个名字')
    expect(s.listPets()).toHaveLength(0)
  })

  it('名字超长（>20 字）被拒绝', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    expect(adoptPetHelper(s, { name: '长'.repeat(21) }).error).toContain('最长 20 字')
    expect(s.listPets()).toHaveLength(0)
  })

  it('hasPet：未领养 false，领养后 true', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    expect(hasPet({ storage: s })).toBe(false)
    adoptPetHelper(s)
    expect(hasPet({ storage: s })).toBe(true)
  })
})

describe('nextMood 心情规则表', () => {
  it('打卡涨心情：正常 +4，超额 +6', () => {
    expect(nextMood(60, 'checkin')).toBe(64)
    expect(nextMood(60, 'checkin-extra')).toBe(66)
  })

  it('漏卡归来是开心（R10b-4）：+6 而非低落', () => {
    expect(nextMood(60, 'checkin-backoff')).toBe(66)
  })

  it('休息日不变', () => {
    expect(nextMood(60, 'rest-day')).toBe(60)
  })

  it('clamp 边界：不越过 0 与 100', () => {
    expect(nextMood(1, 'checkin-backoff')).toBe(7)
    expect(nextMood(98, 'checkin-extra')).toBe(MOOD_MAX)
  })
})

describe('moodAfterDecay 连漏衰减（R10b-4，不惩罚归零）', () => {
  it('漏 3 天扣 6：60 - 3*2 = 54', () => {
    expect(moodAfterDecay(60, 3)).toBe(54)
  })

  it('衰减按天线性，封顶 -cap', () => {
    expect(moodAfterDecay(60, 1)).toBe(58)
    expect(moodAfterDecay(60, 0)).toBe(60)
    // 远超封顶：50 天 / 100 天都只扣 20
    expect(moodAfterDecay(60, 50)).toBe(60 - MOOD_DECAY_CAP)
    expect(moodAfterDecay(60, 100)).toBe(60 - MOOD_DECAY_CAP)
  })

  it('不越过 0（不惩罚归零）', () => {
    expect(moodAfterDecay(5, 50)).toBe(MOOD_MIN)
    expect(moodAfterDecay(0, 50)).toBe(MOOD_MIN)
  })
})

describe('settlePetMoodDecay 结算', () => {
  it('首次结算只记录日期，不衰减（领养当天无端掉心情）', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    adoptPetHelper(s)
    const r = settlePetMoodDecay({ storage: s }, '2026-08-27')
    expect(r.settledDays).toBe(0)
    expect(r.pet?.mood).toBe(MOOD_INITIAL)
    expect(getPet({ storage: s })?.lastMoodSettleDate).toBe('2026-08-27')
  })

  it('连漏 3 天结算扣 6（日期差 4 → 漏 3 天）', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    adoptPetHelper(s)
    settlePetMoodDecay({ storage: s }, '2026-08-20')
    const r = settlePetMoodDecay({ storage: s }, '2026-08-24')
    expect(r.settledDays).toBe(3)
    expect(r.pet?.mood).toBe(MOOD_INITIAL - 6)
  })

  it('同一天/隔一天不衰减（未完整漏一天）', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    adoptPetHelper(s)
    settlePetMoodDecay({ storage: s }, '2026-08-20')
    const same = settlePetMoodDecay({ storage: s }, '2026-08-20')
    expect(same.settledDays).toBe(0)
    const next = settlePetMoodDecay({ storage: s }, '2026-08-21')
    expect(next.settledDays).toBe(0)
  })

  it('无宠物时安全返回 null', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    const r = settlePetMoodDecay({ storage: s }, '2026-08-27')
    expect(r.pet).toBeNull()
    expect(r.settledDays).toBe(0)
  })
})

describe('petPet 摸摸头（R10b-4，每天一次）', () => {
  it('第一次摸头 +2', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    adoptPetHelper(s)
    const r = petPet({ storage: s }, '2026-08-27')
    expect(r.error).toBeNull()
    expect(r.pet?.mood).toBe(MOOD_INITIAL + MOOD_PET_DELTA)
    expect(getPet({ storage: s })?.lastPettedDate).toBe('2026-08-27')
  })

  it('同一天第二次被拒，心情不变', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    adoptPetHelper(s)
    petPet({ storage: s }, '2026-08-27')
    const r = petPet({ storage: s }, '2026-08-27')
    expect(r.error).toBe(PET_PET_ERROR)
    expect(r.pet?.mood).toBe(MOOD_INITIAL + MOOD_PET_DELTA)
  })

  it('第二天可再摸（重置）', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    adoptPetHelper(s)
    petPet({ storage: s }, '2026-08-27')
    const r = petPet({ storage: s }, '2026-08-28')
    expect(r.error).toBeNull()
    expect(r.pet?.mood).toBe(MOOD_INITIAL + MOOD_PET_DELTA * 2)
  })

  it('无宠物时安全返回错误', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    expect(petPet({ storage: s }, '2026-08-27').error).toBe('还没有宠物伙伴')
  })
})

describe('moodLabel 心情文案（R10b-4）', () => {
  it('低于 40 且带名字时显示「XX有点想你」', () => {
    expect(moodLabel(39, '糯米')).toBe('糯米有点想你')
    expect(moodLabel(20, '糯米')).toBe('糯米有点想你')
  })

  it('低于 40 无名字时回退「有点低落」', () => {
    expect(moodLabel(20)).toBe('有点低落')
  })

  it('高分段文案不变', () => {
    expect(moodLabel(90)).toBe('元气满满')
    expect(moodLabel(60)).toBe('心情不错')
    expect(moodLabel(45)).toBe('一般般')
  })
})

describe('recordPetMood 打卡联动', () => {
  it('打卡后心情写入档案并可回读', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    adoptPetHelper(s)
    const updated = recordPetMood({ storage: s }, 'checkin-extra')
    expect(updated?.mood).toBe(MOOD_INITIAL + 6)
    expect(getPet({ storage: s })?.mood).toBe(MOOD_INITIAL + 6)
  })

  it('无宠物时安全返回 null，不抛异常', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    expect(recordPetMood({ storage: s }, 'checkin')).toBeNull()
  })
})
