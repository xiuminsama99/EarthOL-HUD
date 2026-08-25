/**
 * 引导问卷流程测试（工单 03）
 *
 * 覆盖：完成引导写入档案字段回读、身份必填/长度校验、正反愿景与坏习惯上限、
 * 老用户跳过判定、storage 版本迁移（v1 数据读出新字段补 null）。
 */
import { describe, expect, it } from 'vitest'
import { EarthStorage, STORAGE_KEY, CURRENT_VERSION } from '../../storage/storage'
import type { PlayerProfile } from '../../storage/types'
import { isOnboarded, submitOnboarding } from './onboardingFlow'

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

/** 已引导档案（老用户） */
function onboardedProfile(over: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    id: 'p1',
    identityStatement: '我是健康的人',
    vision: null,
    antivision: null,
    badHabitDesc: null,
    personaName: null,
    schedule: 'day',
    onboardedAt: '2026-08-26T00:00:00Z',
    createdAt: '2026-08-26T00:00:00Z',
    ...over,
  }
}

const validInput = {
  identityStatement: '我是健康的人',
  vision: '每天精力充沛，爬山不喘',
  antivision: '5 年后还在凌晨两点刷手机',
  badHabitDesc: '熬夜刷手机到一两点',
}

describe('onboardingFlow 引导流程', () => {
  it('完成引导：全部字段写入档案并可回读', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    const result = submitOnboarding({ storage: s }, validInput)
    expect(result.error).toBeNull()
    const profile = s.getProfile()
    expect(profile?.identityStatement).toBe('我是健康的人')
    expect(profile?.vision).toBe('每天精力充沛，爬山不喘')
    expect(profile?.antivision).toBe('5 年后还在凌晨两点刷手机')
    expect(profile?.badHabitDesc).toBe('熬夜刷手机到一两点')
    expect(profile?.onboardedAt).not.toBeNull()
  })

  it('身份宣言必填：空白输入被拒绝', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    const result = submitOnboarding({ storage: s }, { ...validInput, identityStatement: '   ' })
    expect(result.error).toContain('不能为空')
    expect(s.getProfile()).toBeNull()
  })

  it('身份宣言超长（>40 字）被拒绝', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    const result = submitOnboarding(
      { storage: s },
      { ...validInput, identityStatement: '我'.repeat(41) },
    )
    expect(result.error).toContain('最长 40 字')
    expect(s.getProfile()).toBeNull()
  })

  it('正愿景 / 反愿景超长（>500 字）被拒绝', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    expect(
      submitOnboarding({ storage: s }, { ...validInput, vision: '长'.repeat(501) }).error,
    ).toContain('最长 500 字')
    expect(
      submitOnboarding({ storage: s }, { ...validInput, antivision: '长'.repeat(501) }).error,
    ).toContain('最长 500 字')
    expect(s.getProfile()).toBeNull()
  })

  it('可选字段填空字符串归一为 null', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    const result = submitOnboarding(
      { storage: s },
      { identityStatement: '我是早起的人', vision: '  ', antivision: '', badHabitDesc: '' },
    )
    expect(result.error).toBeNull()
    const profile = s.getProfile()
    expect(profile?.identityStatement).toBe('我是早起的人')
    expect(profile?.vision).toBeNull()
    expect(profile?.antivision).toBeNull()
    expect(profile?.badHabitDesc).toBeNull()
  })

  it('isOnboarded：无档案 / 空身份 → 未引导（走引导）；有身份 → 已引导（跳过）', () => {
    expect(isOnboarded(null)).toBe(false)
    expect(isOnboarded(onboardedProfile({ identityStatement: null }))).toBe(false)
    expect(isOnboarded(onboardedProfile({ identityStatement: '   ' }))).toBe(false)
    expect(isOnboarded(onboardedProfile())).toBe(true)
  })

  it('storage v1→v2 迁移：旧档案读出时新字段补 null，原字段保留', () => {
    const { backend, store } = makeBackend()
    // 模拟 v1 格式（工单 03 之前的档案，无 vision/antivision/badHabitDesc/onboardedAt）
    store.set(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        data: {
          profile: {
            id: 'p1',
            identityStatement: '我是健康的人',
            personaName: null,
            schedule: 'day',
            createdAt: '2026-08-25T00:00:00Z',
          },
          habits: [],
          checkins: [],
          pets: [],
          assets: [],
          savingsAccounts: [],
          bills: [],
        },
      }),
    )
    const s = new EarthStorage(backend)
    const profile = s.getProfile()
    expect(profile?.identityStatement).toBe('我是健康的人')
    expect(profile?.vision).toBeNull()
    expect(profile?.antivision).toBeNull()
    expect(profile?.badHabitDesc).toBeNull()
    expect(profile?.onboardedAt).toBeNull()
    expect(profile?.schedule).toBe('day')
    // read 只在内存迁移，不落盘；下次 update 时才写回当前版本
    expect((JSON.parse(store.get(STORAGE_KEY)!) as { version: number }).version).toBe(1)
    s.updateProfile({}) // 触发一次写
    expect((JSON.parse(store.get(STORAGE_KEY)!) as { version: number }).version).toBe(CURRENT_VERSION)
  })
})
