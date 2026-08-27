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
import { isPrefillableHabitDesc } from './habitFlow'
import { labelStyleForm as labelStyle, inputStyleForm as inputStyle } from '../../components/ui/theme'
import { HABIT_TEMPLATES, UNIT_OPTIONS } from './habitTemplates'
import type { HabitTemplate } from './habitTemplates'

export interface CreateHabitFormProps {
  /** 当前业务日（作为习惯创建日） */
  businessDate: string
  onSubmit(input: NewHabitInput): { error: string | null }
  /** B4：引导时写下的坏习惯描述（预填名称，来源标注） */
  initialName?: string
  /** B4：预选方向（坏习惯预选「戒除」） */
  initialDirection?: HabitDirection
}

const DIRECTION_OPTIONS: { value: HabitDirection; label: string; hint: string }[] = [
  { value: 'positive', label: '养成', hint: '每天多做一点，如：每天读一页书' },
  { value: 'negative', label: '戒除', hint: '每天少做一点，如：每天少吃一口' },
]

export function CreateHabitForm(props: CreateHabitFormProps) {
  /** P1-3：引导坏习惯描述太长（>12 字，通常是一整句话）时不再自动填名称，改为提示 */
  const prefillable = props.initialName !== undefined && isPrefillableHabitDesc(props.initialName)
  const [name, setName] = useState(prefillable ? (props.initialName ?? '').trim() : '')
  const [direction, setDirection] = useState<HabitDirection>(props.initialDirection ?? 'positive')
  const [baseAmount, setBaseAmount] = useState('1')
  const [cap, setCap] = useState('')
  const [unit, setUnit] = useState('次')
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null)
  /** name 是否已被手动编辑/模板覆盖（用于隐藏「来自引导记录」标注，避免误导） */
  const [nameTouched, setNameTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** R5：点选模板 → 预填方向/名称/基准/单位，上限留空（用户可再改） */
  const applyTemplate = (t: HabitTemplate) => {
    setDirection(t.direction)
    setName(t.label)
    setBaseAmount(String(t.baseAmount))
    setUnit(t.unit)
    setCap('')
    setActiveTemplateId(t.id)
    setNameTouched(true)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const parsedCap = cap.trim() === '' ? null : Number(cap)
    const result = props.onSubmit({
      name,
      direction,
      baseAmount: Number(baseAmount),
      cap: parsedCap,
      unit,
      createdAt: props.businessDate,
    })
    if (result.error) setError(result.error)
  }

  return (
    <form onSubmit={submit}>
      <h2 style={{ fontSize: 17, marginTop: 0 }}>建立第一个习惯</h2>
      <p style={{ color: '#8b8ba3', fontSize: 13, marginTop: 0 }}>
        每天只多一点点：从第 1 天做起，加到你觉得合适的量就固定下来。
      </p>

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>
          从模板开始（点选自动预填，可改）
        </label>
        <div
          style={{
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            paddingBottom: 6,
            marginBottom: 4,
          }}
        >
          {HABIT_TEMPLATES.map((t) => {
            const active = activeTemplateId === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t)}
                style={{
                  flexShrink: 0,
                  width: 128,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${active ? '#7c5cff' : '#2c2c4a'}`,
                  background: active ? '#241a4a' : '#1b1b33',
                  color: '#e5e5f0',
                  fontSize: 13,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ display: 'block', fontWeight: 600, fontSize: 14 }}>
                  {t.label}
                </span>
                <span style={{ display: 'block', fontSize: 11, color: '#8b8ba3', marginTop: 4 }}>
                  {t.tip}
                </span>
              </button>
            )
          })}
        </div>
      </div>

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
          onChange={(e) => {
            setName(e.target.value)
            setNameTouched(true)
          }}
          placeholder="如：每天读一页书 / 每天少吃一口"
          maxLength={40}
        />
        {prefillable && !nameTouched && (
          <span style={{ fontSize: 11, color: '#d9b64a', marginTop: 4 }}>
            来自你的引导记录：{props.initialName}
          </span>
        )}
        {props.initialName && !prefillable && !nameTouched && (
          <span style={{ fontSize: 11, color: '#d9b64a', marginTop: 4 }}>
            你的引导记录写的是「{props.initialName}」——有点长，建议用模板或起个简短的名字
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>起始量（第 1 天目标）</label>
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
          <label style={labelStyle}>固定目标（可选）</label>
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
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>计量单位</label>
          <select
            style={inputStyle}
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          >
            {UNIT_OPTIONS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
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
