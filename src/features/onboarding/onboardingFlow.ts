/**
 * 引导问卷与身份设定流程逻辑（工单 03）
 *
 * 纯逻辑层：输入校验 → 写入玩家档案（身份宣言 / 正反愿景 / 坏习惯描述）。
 * UI 组件只做步骤编排与文案展示，不承载校验规则。
 *
 * 依赖注入：storage 由调用方传入，测试注入 Map backend 的 EarthStorage。
 */
import type { EarthStorage } from '../../storage/storage'
import type { PlayerProfile } from '../../storage/types'

export interface OnboardingInput {
  /** 身份宣言「我是___」（必填，正愿景核心） */
  identityStatement: string
  /** 正愿景展开描述（可选补充） */
  vision: string
  /** 反愿景：「5 年后什么都不改，我的一个普通周二会怎样」 */
  antivision: string
  /** 最想改掉的一个坏习惯 / 想养成的第一个好习惯（可选，MVP 手动描述） */
  badHabitDesc: string
}

export interface OnboardingDeps {
  storage: Pick<EarthStorage, 'getProfile' | 'updateProfile'>
}

export interface OnboardingResult {
  profile: PlayerProfile | null
  error: string | null
}

/** 已引导判定：档案存在且身份宣言非空即视为已完成引导（老用户跳过） */
export function isOnboarded(profile: PlayerProfile | null): boolean {
  return profile !== null && profile.identityStatement !== null && profile.identityStatement.trim().length > 0
}

/**
 * 提交引导：校验 → 写入档案。
 * 全部字段可空只保留空字符串场景：身份宣言必填，其余可选（空串归一为 null）。
 */
export function submitOnboarding(
  deps: OnboardingDeps,
  input: OnboardingInput,
): OnboardingResult {
  const identity = input.identityStatement.trim()
  if (identity.length === 0) {
    return { profile: null, error: '身份宣言不能为空：告诉我你想成为什么样的人' }
  }
  if (identity.length > 40) {
    return { profile: null, error: '身份宣言最长 40 字，一句话说清楚' }
  }
  if (input.vision.trim().length > 500) {
    return { profile: null, error: '正愿景描述最长 500 字' }
  }
  if (input.antivision.trim().length > 500) {
    return { profile: null, error: '反愿景描述最长 500 字' }
  }
  if (input.badHabitDesc.trim().length > 300) {
    return { profile: null, error: '坏习惯描述最长 300 字' }
  }

  const profile = deps.storage.updateProfile({
    identityStatement: identity,
    vision: input.vision.trim() || null,
    antivision: input.antivision.trim() || null,
    badHabitDesc: input.badHabitDesc.trim() || null,
    onboardedAt: new Date().toISOString(),
  })
  return { profile, error: null }
}
