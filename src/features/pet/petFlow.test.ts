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

  it('漏卡低落：缺勤归来打卡 -4，休息日不变', () => {
    expect(nextMood(60, 'checkin-backoff')).toBe(56)
    expect(nextMood(60, 'rest-day')).toBe(60)
  })

  it('clamp 边界：不越过 0 与 100', () => {
    expect(nextMood(1, 'checkin-backoff')).toBe(MOOD_MIN)
    expect(nextMood(98, 'checkin-extra')).toBe(MOOD_MAX)
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
