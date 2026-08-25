/**
 * 引导问卷流程测试（工单 03）
 *
 * 覆盖：完成引导写入档案字段回读、身份必填/长度校验、正反愿景与坏习惯上限、
 * 老用户跳过判定、storage 版本迁移（v1 数据读出新字段补 null）。
 */
import { describe, expect, it } from 'vitest'
import { EarthStorage, STORAGE_KEY, CURRENT_VERSION } from '../../storage/storage'
import type { AuditScores, PlayerProfile } from '../../storage/types'
import {
  AUDIT_SUGGESTIONS,
  isOnboarded,
  isValidAuditScores,
  lowestAuditDimension,
  submitOnboarding,
  updateIdentityAndGoal,
} from './onboardingFlow'

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
    annualGoal: null,
    auditScores: null,
    personaName: null,
    schedule: 'day',
    lastScheduleSwitchAt: null,
    petReminderEnabled: false,
    petReminderTime: '20:00',
    lastPetReminderDate: null,
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
  annualGoal: '把身体练回二十岁的样子',
  auditScores: null as AuditScores | null,
}

describe('R9 主界面编辑身份/年度主线（P1-2：兑现「之后也能随时补充」承诺）', () => {
  it('保存：身份与年度主线更新，其余字段不受影响', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    submitOnboarding(
      { storage: s },
      { ...validInput, identityStatement: '我是健康的人', annualGoal: '把身体练回二十岁的样子' },
    )
    const before = s.getProfile()!
    const result = updateIdentityAndGoal(
      { storage: s },
      { identityStatement: '我是早起的人', annualGoal: '跑完第一个马拉松' },
    )
    expect(result.error).toBeNull()
    const after = s.getProfile()!
    expect(after.identityStatement).toBe('我是早起的人')
    expect(after.annualGoal).toBe('跑完第一个马拉松')
    // 其余字段原样保留（vision/antivision/badHabitDesc/auditScores 不变）
    expect(after.vision).toBe(before.vision)
    expect(after.antivision).toBe(before.antivision)
    expect(after.badHabitDesc).toBe(before.badHabitDesc)
    expect(after.auditScores).toEqual(before.auditScores)
    expect(after.schedule).toBe(before.schedule)
  })

  it('身份宣言必填：空白拒绝且不落库', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    submitOnboarding({ storage: s }, validInput)
    const result = updateIdentityAndGoal(
      { storage: s },
      { identityStatement: '   ', annualGoal: '任意目标' },
    )
    expect(result.error).toContain('不能为空')
    expect(s.getProfile()?.identityStatement).toBe('我是健康的人') // 未改动
  })

  it('身份宣言超长（>40 字）/ 年度主线超长（>100 字）拒绝且不落库', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    submitOnboarding({ storage: s }, validInput)
    expect(
      updateIdentityAndGoal({ storage: s }, { identityStatement: '我'.repeat(41), annualGoal: '' }).error,
    ).toContain('最长 40 字')
    expect(
      updateIdentityAndGoal({ storage: s }, { identityStatement: '我是健康的人', annualGoal: '长'.repeat(101) }).error,
    ).toContain('最长 100 字')
    expect(s.getProfile()?.identityStatement).toBe('我是健康的人')
    expect(s.getProfile()?.annualGoal).toBe(validInput.annualGoal)
  })

  it('年度主线清空：归一为 null（允许删除年度目标）', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    submitOnboarding({ storage: s }, { ...validInput, annualGoal: '把身体练回二十岁的样子' })
    const result = updateIdentityAndGoal(
      { storage: s },
      { identityStatement: '我是健康的人', annualGoal: '   ' },
    )
    expect(result.error).toBeNull()
    expect(s.getProfile()?.annualGoal).toBeNull()
    expect(s.getProfile()?.identityStatement).toBe('我是健康的人')
  })
})

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
    expect(profile?.annualGoal).toBe('把身体练回二十岁的样子')
    expect(profile?.auditScores).toBeNull()
    expect(profile?.onboardedAt).not.toBeNull()
  })

  it('人生审计：四维分数写入档案并可回读', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    const result = submitOnboarding(
      { storage: s },
      {
        ...validInput,
        auditScores: { body: 3, growth: 6, social: 8, wealth: 5 },
      },
    )
    expect(result.error).toBeNull()
    expect(s.getProfile()?.auditScores).toEqual({ body: 3, growth: 6, social: 8, wealth: 5 })
  })

  it('人生审计：跳过（null）不影响提交，auditScores 为 null', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    const result = submitOnboarding({ storage: s }, { ...validInput, auditScores: null })
    expect(result.error).toBeNull()
    expect(s.getProfile()?.auditScores).toBeNull()
  })

  it('人生审计：越界分值被拒绝（0 / 11 / 小数）', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    expect(
      submitOnboarding(
        { storage: s },
        { ...validInput, auditScores: { body: 0, growth: 5, social: 5, wealth: 5 } },
      ).error,
    ).toContain('人生审计')
    expect(
      submitOnboarding(
        { storage: s },
        { ...validInput, auditScores: { body: 11, growth: 5, social: 5, wealth: 5 } },
      ).error,
    ).toContain('人生审计')
    expect(
      submitOnboarding(
        { storage: s },
        { ...validInput, auditScores: { body: 5.5, growth: 5, social: 5, wealth: 5 } },
      ).error,
    ).toContain('人生审计')
    expect(s.getProfile()).toBeNull()
  })

  it('isValidAuditScores：null 通过，四维 1-10 整数通过，其余拒绝', () => {
    expect(isValidAuditScores(null)).toBe(true)
    expect(isValidAuditScores({ body: 1, growth: 10, social: 5, wealth: 7 })).toBe(true)
    expect(isValidAuditScores({ body: 0, growth: 5, social: 5, wealth: 5 })).toBe(false)
    expect(isValidAuditScores({ body: 5, growth: 5, social: 5, wealth: 11 })).toBe(false)
    expect(isValidAuditScores({ body: 5, growth: 5, social: 5.5, wealth: 5 })).toBe(false)
  })

  it('lowestAuditDimension：返回最低分维度；并列取第一个（body → growth → social → wealth）', () => {
    expect(lowestAuditDimension({ body: 3, growth: 6, social: 8, wealth: 5 })).toEqual({
      key: 'body',
      label: '身体',
      score: 3,
    })
    expect(lowestAuditDimension({ body: 8, growth: 2, social: 5, wealth: 6 })).toEqual({
      key: 'growth',
      label: '成长',
      score: 2,
    })
    expect(lowestAuditDimension({ body: 8, growth: 6, social: 4, wealth: 6 })).toEqual({
      key: 'social',
      label: '人际',
      score: 4,
    })
    expect(lowestAuditDimension({ body: 8, growth: 6, social: 6, wealth: 1 })).toEqual({
      key: 'wealth',
      label: '财富',
      score: 1,
    })
    // 并列：body 与 growth 同为 3，取第一个 body
    expect(lowestAuditDimension({ body: 3, growth: 3, social: 7, wealth: 9 }).key).toBe('body')
    // 并列：social 与 wealth 同为 2，取 social
    expect(lowestAuditDimension({ body: 9, growth: 8, social: 2, wealth: 2 }).key).toBe('social')
  })

  it('AUDIT_SUGGESTIONS：四个维度都有建议文案，且与标签维度一一对应', () => {
    const keys = Object.keys(AUDIT_SUGGESTIONS).sort()
    expect(keys).toEqual(['body', 'growth', 'social', 'wealth'])
    for (const tip of Object.values(AUDIT_SUGGESTIONS)) {
      expect(tip.length).toBeGreaterThan(0)
    }
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

  it('年度主线可选：空串归一为 null，不影响提交', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    const result = submitOnboarding(
      { storage: s },
      { identityStatement: '我是早起的人', vision: '', antivision: '', badHabitDesc: '', annualGoal: '   ', auditScores: null },
    )
    expect(result.error).toBeNull()
    expect(s.getProfile()?.annualGoal).toBeNull()
  })

  it('年度主线超长（>100 字）被拒绝', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    const result = submitOnboarding(
      { storage: s },
      { ...validInput, annualGoal: '长'.repeat(101) },
    )
    expect(result.error).toContain('最长 100 字')
    expect(s.getProfile()).toBeNull()
  })

  it('可选字段填空字符串归一为 null', () => {
    const { backend } = makeBackend()
    const s = new EarthStorage(backend)
    const result = submitOnboarding(
      { storage: s },
      { identityStatement: '我是早起的人', vision: '  ', antivision: '', badHabitDesc: '', annualGoal: '', auditScores: null },
    )
    expect(result.error).toBeNull()
    const profile = s.getProfile()
    expect(profile?.identityStatement).toBe('我是早起的人')
    expect(profile?.vision).toBeNull()
    expect(profile?.antivision).toBeNull()
    expect(profile?.badHabitDesc).toBeNull()
    expect(profile?.annualGoal).toBeNull()
    expect(profile?.auditScores).toBeNull()
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
    expect(profile?.auditScores).toBeNull()
    expect(profile?.schedule).toBe('day')
    // read 只在内存迁移，不落盘；下次 update 时才写回当前版本
    expect((JSON.parse(store.get(STORAGE_KEY)!) as { version: number }).version).toBe(1)
    s.updateProfile({}) // 触发一次写
    expect((JSON.parse(store.get(STORAGE_KEY)!) as { version: number }).version).toBe(CURRENT_VERSION)
  })
})
