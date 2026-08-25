/**
 * 建习惯表单（工单 05）
 *
 * 纯薄壳：收集输入 → 调 habitFlow.createHabit → 成功回调。
 * 不承载任何领域规则（校验全在流程层）。
 */
import { useState } from 'react'
import type { FormEvent } from 'react'
import type { HabitDirection } from '../../engine/types'
import type { NewHabitInput } from './habitFlow'

export interface CreateHabitFormProps {
  /** 当前业务日（作为习惯创建日） */
  businessDate: string
  onSubmit(input: NewHabitInput): { error: string | null }
}

const DIRECTION_OPTIONS: { value: HabitDirection; label: string; hint: string }[] = [
  { value: 'positive', label: '养成', hint: '每天多做一点，如：每天读一页书' },
  { value: 'negative', label: '戒除', hint: '每天少做一点，如：每天少吃一口' },
]

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  color: '#8b8ba3',
  marginBottom: 4,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #2c2c4a',
  background: '#1b1b33',
  color: '#e5e5f0',
  fontSize: 16,
}

export function CreateHabitForm(props: CreateHabitFormProps) {
  const [name, setName] = useState('')
  const [direction, setDirection] = useState<HabitDirection>('positive')
  const [baseAmount, setBaseAmount] = useState('1')
  const [cap, setCap] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const parsedCap = cap.trim() === '' ? null : Number(cap)
    const result = props.onSubmit({
      name,
      direction,
      baseAmount: Number(baseAmount),
      cap: parsedCap,
      createdAt: props.businessDate,
    })
    if (result.error) setError(result.error)
  }

  return (
    <form onSubmit={submit}>
      <h2 style={{ fontSize: 17, marginTop: 0 }}>建立第一个微习惯</h2>
      <p style={{ color: '#8b8ba3', fontSize: 13, marginTop: 0 }}>
        等差数列：每天只多做一步（或只多减一点），到自认上限后定死。
      </p>

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>习惯方向</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {DIRECTION_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: 8,
                border: `1px solid ${direction === opt.value ? '#7c5cff' : '#2c2c4a'}`,
                background: direction === opt.value ? '#241a4a' : '#1b1b33',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              <input
                type="radio"
                name="direction"
                value={opt.value}
                checked={direction === opt.value}
                onChange={() => setDirection(opt.value)}
                style={{ marginRight: 6 }}
              />
              {opt.label}
              <span style={{ display: 'block', fontSize: 11, color: '#8b8ba3', marginTop: 4 }}>
                {opt.hint}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>习惯名称</label>
        <input
          style={inputStyle}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="如：每天读一页书 / 每天少吃一口"
          maxLength={40}
        />
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>起始基准（第 0 天目标量）</label>
          <input
            style={inputStyle}
            type="number"
            min={1}
            step={1}
            value={baseAmount}
            onChange={(e) => setBaseAmount(e.target.value)}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>自认上限（可选，定死）</label>
          <input
            style={inputStyle}
            type="number"
            min={1}
            step={1}
            value={cap}
            onChange={(e) => setCap(e.target.value)}
            placeholder="不填则每日 +1"
          />
        </div>
      </div>

      {error && (
        <p role="alert" style={{ color: '#ff7a7a', fontSize: 13 }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        style={{
          width: '100%',
          padding: '12px',
          borderRadius: 8,
          border: 'none',
          background: '#7c5cff',
          color: '#fff',
          fontSize: 16,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        建立习惯，开始打卡
      </button>
    </form>
  )
}
