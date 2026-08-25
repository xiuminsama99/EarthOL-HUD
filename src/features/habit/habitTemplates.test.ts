/**
 * 习惯模板库与年度效果换算测试（R5）
 */
import { describe, expect, it } from 'vitest'
import type { HabitDirection } from '../../engine/types'
import { HABIT_TEMPLATES, UNIT_OPTIONS, yearlyEffect } from './habitTemplates'

const DIRECTIONS: readonly HabitDirection[] = ['positive', 'negative']

describe('习惯模板库', () => {
  it('模板 id 唯一，字段齐全，方向合法，基准为正整数', () => {
    const ids = HABIT_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(HABIT_TEMPLATES.length).toBeGreaterThanOrEqual(5)
    for (const t of HABIT_TEMPLATES) {
      expect(t.label.trim().length).toBeGreaterThan(0)
      expect(DIRECTIONS).toContain(t.direction)
      expect(Number.isInteger(t.baseAmount)).toBe(true)
      expect(t.baseAmount).toBeGreaterThanOrEqual(1)
      expect(t.unit.trim().length).toBeGreaterThan(0)
      expect(t.tip.trim().length).toBeGreaterThan(0)
    }
  })

  it('同时覆盖养成与戒除方向（微习惯法两种形态都有模板）', () => {
    expect(HABIT_TEMPLATES.some((t) => t.direction === 'positive')).toBe(true)
    expect(HABIT_TEMPLATES.some((t) => t.direction === 'negative')).toBe(true)
  })

  it('单位选项非空无重复，且所有模板单位都在选项内', () => {
    expect(UNIT_OPTIONS.length).toBeGreaterThan(0)
    expect(new Set(UNIT_OPTIONS).size).toBe(UNIT_OPTIONS.length)
    for (const t of HABIT_TEMPLATES) {
      expect(UNIT_OPTIONS).toContain(t.unit)
    }
  })
})

describe('yearlyEffect 年度累计效果', () => {
  it('按目标量换算 365 天累计', () => {
    expect(yearlyEffect(1, '个')).toBe('365 天累计 365 个')
    expect(yearlyEffect(5, '个')).toBe('365 天累计 1825 个')
    expect(yearlyEffect(100, '步')).toBe('365 天累计 36500 步')
  })

  it('大数目标不溢出（上限 100 万基准场景）', () => {
    expect(yearlyEffect(1_000_000, '元')).toBe('365 天累计 365000000 元')
  })

  it('非法输入兜底为 0，单位空串兜底为「次」', () => {
    expect(yearlyEffect(0, '次')).toBe('365 天累计 0 次')
    expect(yearlyEffect(-1, '个')).toBe('365 天累计 0 个')
    expect(yearlyEffect(Number.NaN, '个')).toBe('365 天累计 0 个')
    expect(yearlyEffect(Number.POSITIVE_INFINITY, '个')).toBe('365 天累计 0 个')
    expect(yearlyEffect(5, '   ')).toBe('365 天累计 1825 次')
  })
})
