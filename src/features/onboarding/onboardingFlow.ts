/**
 * 引导问卷与身份设定流程逻辑（工单 03）
 *
 * 纯逻辑层：输入校验 → 写入玩家档案（身份宣言 / 正反愿景 / 年度主线 / 坏习惯描述）。
 * UI 组件只做步骤编排与文案展示，不承载校验规则。
 *
 * 依赖注入：storage 由调用方传入，测试注入 Map backend 的 EarthStorage。
 */
import type { EarthStorage } from '../../storage/storage'
import type { AuditScores, PlayerProfile } from '../../storage/types'

export interface OnboardingInput {
  /** 身份宣言「我是___」（必填，正愿景核心） */
  identityStatement: string
  /** 正愿景展开描述（可选补充） */
  vision: string
  /** 反愿景：「5 年后什么都不改，我的一个普通周二会怎样」 */
  antivision: string
  /** 最想改掉的一个坏习惯 / 想养成的第一个好习惯（可选，MVP 手动描述） */
  badHabitDesc: string
  /** 年度主线：以「我是__」的身份，今年最想完成的一件事（三层目标第一层，可选，≤100 字） */
  annualGoal: string
  /** 人生审计四维分数（1-10，可跳过 = null）；最低分板块引导改变方向（R2） */
  auditScores: AuditScores | null
}

export interface OnboardingDeps {
  storage: Pick<EarthStorage, 'getProfile' | 'updateProfile'>
}

/** 主界面编辑身份/年度主线输入（P1-2：兑现引导「之后也能随时补充」承诺） */
export interface IdentityEditInput {
  /** 身份宣言「我是___」（必填，≤40 字） */
  identityStatement: string
  /** 年度主线（可选，≤100 字） */
  annualGoal: string
}

/**
 * 主界面编辑身份宣言 + 年度主线（P1-2）。
 * 复用引导的校验口径（身份必填 ≤40 字、年度主线 ≤100 字），
 * 只更新这两个字段，不动引导产出的其他字段。
 */
export function updateIdentityAndGoal(
  deps: OnboardingDeps,
  input: IdentityEditInput,
): OnboardingResult {
  const identity = input.identityStatement.trim()
  if (identity.length === 0) {
    return { profile: null, error: '身份宣言不能为空：告诉我你想成为什么样的人' }
  }
  if (identity.length > 40) {
    return { profile: null, error: '身份宣言最长 40 字，一句话说清楚' }
  }
  if (input.annualGoal.trim().length > 100) {
    return { profile: null, error: '年度主线最长 100 字，一句话说清楚' }
  }
  const profile = deps.storage.updateProfile({
    identityStatement: identity,
    annualGoal: input.annualGoal.trim() || null,
  })
  return { profile, error: null }
}

export interface OnboardingResult {
  profile: PlayerProfile | null
  error: string | null
}

/** 已引导判定：档案存在且身份宣言非空即视为已完成引导（老用户跳过） */
export function isOnboarded(profile: PlayerProfile | null): boolean {
  return profile !== null && profile.identityStatement !== null && profile.identityStatement.trim().length > 0
}

/** 审计维度元数据：key 顺序即并列时的优先级（body → growth → social → wealth） */
export const AUDIT_DIMENSION_LABELS: Record<keyof AuditScores, string> = {
  body: '身体',
  growth: '成长',
  social: '人际',
  wealth: '财富',
}

/** 最低分板块 → 坏习惯步骤建议文案（引导衔接，R2） */
export const AUDIT_SUGGESTIONS: Record<keyof AuditScores, string> = {
  body: '你的身体分最低，运动类习惯会最见效',
  growth: '你的成长分最低，学习或阅读类习惯会最见效',
  social: '你的人际分最低，社交或表达类习惯会最见效',
  wealth: '你的财富分最低，存钱或记账类习惯会最见效',
}

export interface AuditDimension {
  key: keyof AuditScores
  label: string
  score: number
}

/**
 * 最低分维度判定（R2）：并列取第一个（按 AUDIT_DIMENSION_LABELS 顺序）。
 * 返回 { key, label, score } 供 UI 提示「你的最低分板块是：__」。
 */
export function lowestAuditDimension(scores: AuditScores): AuditDimension {
  const keys = Object.keys(AUDIT_DIMENSION_LABELS) as (keyof AuditScores)[]
  let lowest = keys[0]
  for (const k of keys) {
    if (scores[k] < scores[lowest]) lowest = k
  }
  return { key: lowest, label: AUDIT_DIMENSION_LABELS[lowest], score: scores[lowest] }
}

/** 审计分数校验：null（跳过）或四维均为 1-10 整数 */
export function isValidAuditScores(scores: AuditScores | null): boolean {
  if (scores === null) return true
  const values = [scores.body, scores.growth, scores.social, scores.wealth]
  return values.every((n) => Number.isInteger(n) && n >= 1 && n <= 10)
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
  if (input.annualGoal.trim().length > 100) {
    return { profile: null, error: '年度主线最长 100 字，一句话说清楚' }
  }
  if (!isValidAuditScores(input.auditScores)) {
    return { profile: null, error: '人生审计请为每个维度选择 1-10 的分值' }
  }

  const profile = deps.storage.updateProfile({
    identityStatement: identity,
    vision: input.vision.trim() || null,
    antivision: input.antivision.trim() || null,
    badHabitDesc: input.badHabitDesc.trim() || null,
    annualGoal: input.annualGoal.trim() || null,
    auditScores: input.auditScores,
    onboardedAt: new Date().toISOString(),
  })
  return { profile, error: null }
}
