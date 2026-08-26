/**
 * 一年之约面板（工单 13）
 *
 * 把等差数列的复利力量可视化：理想年度总量（愿景大数）+ 已累计进度条 +
 * 小目标（今日量）/ 上限（cap）副行；泄漏回退时给激励性提示（不惩罚）。
 *
 * 薄壳组件：数字与文案全部来自引擎投影（projectAnnual）与 habitFlow 的
 * buildAnnualPanelCopy，本组件零领域规则，只做展示与进度条计算。
 */
import type { HabitState } from '../../engine/types'
import { projectAnnual } from '../../engine/engine'
import { yearlyEffect } from './habitTemplates'
import { buildAnnualPanelCopy } from './habitFlow'

interface Props {
  habit: HabitState
  businessDate: string
}

export function AnnualGoalPanel({ habit, businessDate }: Props) {
  const projection = projectAnnual(habit, businessDate)
  const copy = buildAnnualPanelCopy(
    projection,
    habit,
    yearlyEffect(
      projection.todayTarget,
      habit.unit,
      habit.direction,
      habit.cap !== null,
    ),
  )

  // 进度百分比（正向习惯才有进度条）；理想为 0 时避免除零
  const progressPercent =
    copy.progressLabel !== null && projection.idealAnnual > 0
      ? Math.min(100, Math.round((projection.achievedTotal / projection.idealAnnual) * 100))
      : null

  return (
    <section
      style={{
        border: '1px solid #2c2c4a',
        borderRadius: 12,
        padding: '14px 16px',
        marginBottom: 16,
        background: 'linear-gradient(135deg, #1b1b33 0%, #241a3e 100%)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 16 }}>🏆</span>
        <span style={{ fontSize: 13, color: '#8b8ba3', fontWeight: 600 }}>一年之约</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#5a5a74' }}>
          {habit.direction === 'positive' ? '每天只多一点点' : '每天少做一点点'}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.1, color: '#7ee0a8' }}>
          {copy.headline}
        </span>
        <span style={{ fontSize: 12, color: '#8b8ba3' }}>坚持一年</span>
      </div>

      {copy.progressLabel !== null && progressPercent !== null && (
        <>
          <div
            style={{
              height: 8,
              borderRadius: 999,
              background: '#2c2c4a',
              overflow: 'hidden',
              marginBottom: 4,
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progressPercent}%`,
                borderRadius: 999,
                background: 'linear-gradient(90deg, #7c5cff, #7ee0a8)',
              }}
            />
          </div>
          <div style={{ fontSize: 12, color: '#8b8ba3', marginBottom: 4 }}>
            {copy.progressLabel} · 已走 {progressPercent}%
          </div>
        </>
      )}

      <div style={{ fontSize: 12, color: '#a9a9c4', marginBottom: 4 }}>{copy.sub}</div>

      {copy.warn && (
        <div style={{ fontSize: 12, color: '#d9b64a', lineHeight: 1.6 }}>{copy.warn}</div>
      )}
    </section>
  )
}
