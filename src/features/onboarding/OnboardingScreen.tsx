/**
 * 引导问卷界面（工单 03）
 *
 * 多步引导：欢迎页 → 反愿景 → 正愿景/身份宣言 → 年度主线（三层目标第一层）
 * → 坏习惯（可选）→ 对比图完成。
 * 只做步骤编排与文案，校验与持久化委托 onboardingFlow。
 * AI 生成对比图不在范围，用「现状版 vs 向往版」两栏卡片模板兜底。
 */
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { earthStorage } from '../../storage/storage'
import { submitOnboarding } from './onboardingFlow'
import type { OnboardingInput } from './onboardingFlow'

const panel: CSSProperties = {
  maxWidth: 480,
  margin: '40px auto',
  padding: 24,
  borderRadius: 12,
  background: '#141428',
  color: '#e5e5f0',
  fontFamily: 'system-ui, sans-serif',
}

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #2c2c4a',
  background: '#1b1b33',
  color: '#e5e5f0',
  fontSize: 15,
  fontFamily: 'inherit',
}

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 13,
  color: '#8b8ba3',
  marginBottom: 6,
}

const primaryBtn: CSSProperties = {
  width: '100%',
  padding: '12px',
  borderRadius: 8,
  border: 'none',
  background: '#7c5cff',
  color: '#fff',
  fontSize: 16,
  fontWeight: 600,
  cursor: 'pointer',
}

const ghostBtn: CSSProperties = {
  width: '100%',
  padding: '10px',
  borderRadius: 8,
  border: '1px solid #2c2c4a',
  background: '#1b1b33',
  color: '#8b8ba3',
  fontSize: 14,
  cursor: 'pointer',
}

function StepHeader({ step, total, title }: { step: number; total: number; title: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, color: '#5a5a74', marginBottom: 4 }}>
        {step} / {total}
      </div>
      <h2 style={{ margin: 0, fontSize: 19, lineHeight: 1.4 }}>{title}</h2>
    </div>
  )
}

interface OnboardingScreenProps {
  /** 引导完成后通知父级切换到主界面 */
  onCompleted(): void
}

function OnboardingScreen({ onCompleted }: OnboardingScreenProps) {
  const [step, setStep] = useState(0)
  const [identity, setIdentity] = useState('')
  const [vision, setVision] = useState('')
  const [antivision, setAntivision] = useState('')
  const [badHabit, setBadHabit] = useState('')
  const [annualGoal, setAnnualGoal] = useState('')
  const [error, setError] = useState<string | null>(null)

  const finish = () => {
    const input: OnboardingInput = {
      identityStatement: identity,
      vision,
      antivision,
      badHabitDesc: badHabit,
      annualGoal,
    }
    const { error: err } = submitOnboarding({ storage: earthStorage }, input)
    if (err) {
      setError(err)
      return
    }
    onCompleted()
  }

  if (step === 0) {
    return (
      <main style={panel}>
        <div style={{ fontSize: 12, color: '#7c5cff', marginBottom: 8 }}>地球online玩家控制台</div>
        <h1 style={{ marginTop: 0, fontSize: 24, lineHeight: 1.4 }}>
          人生是一场游戏，
          <br />
          你才是自己唯一的玩家。
        </h1>
        <p style={{ color: '#8b8ba3', fontSize: 14, lineHeight: 1.7 }}>
          这不是又一个打卡软件。我们带你用一天时间设定你的「身份」——你将成为谁——
          然后每天只做一件小事，让习惯长成你的一部分。
          坚持不下去也没关系，系统永不惩罚你。
        </p>
        <button
          type="button"
          style={primaryBtn}
          onClick={() => {
            setError(null)
            setStep(1)
          }}
        >
          开始角色设定
        </button>
      </main>
    )
  }

  if (step === 1) {
    return (
      <main style={panel}>
        <StepHeader step={2} total={5} title="先看清你最怕什么" />
        <p style={{ color: '#8b8ba3', fontSize: 14, lineHeight: 1.7, marginTop: 0 }}>
          用大白话写下来：<strong style={{ color: '#ffd27a' }}>5 年后如果什么都不改，我的一个普通周二会怎样？</strong>
          写得越具体越好——恐惧比欲望更会推着你行动。
        </p>
        <textarea
          value={antivision}
          onChange={(e) => setAntivision(e.target.value)}
          placeholder="比如：闹钟响第三遍才爬起来，刷手机到中午，晚上瘫在沙发上想「我本来可以…」"
          rows={4}
          maxLength={500}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button type="button" style={ghostBtn} onClick={() => setStep(0)}>
            上一步
          </button>
          <button
            type="button"
            style={{ ...primaryBtn, flex: 2 }}
            onClick={() => {
              setError(null)
              setStep(2)
            }}
          >
            下一步
          </button>
        </div>
      </main>
    )
  }

  if (step === 2) {
    return (
      <main style={panel}>
        <StepHeader step={3} total={5} title="你要成为谁？" />
        <p style={{ color: '#8b8ba3', fontSize: 14, lineHeight: 1.7, marginTop: 0 }}>
          不是「我要减肥」，而是「我是健康的人」——行为是身份的结果。用一句大白话填完这句：
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 16, color: '#e5e5f0', flexShrink: 0 }}>我是</span>
          <input
            type="text"
            value={identity}
            onChange={(e) => setIdentity(e.target.value)}
            placeholder="如：健康的人 / 写作者 / 早起的人"
            maxLength={40}
            style={{ ...inputStyle, fontSize: 16 }}
          />
        </div>
        <label style={labelStyle}>展开描述（可选）</label>
        <textarea
          value={vision}
          onChange={(e) => setVision(e.target.value)}
          placeholder="成为这样的人之后，我的生活哪里不一样？"
          rows={3}
          maxLength={500}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button type="button" style={ghostBtn} onClick={() => setStep(1)}>
            上一步
          </button>
          <button
            type="button"
            style={{ ...primaryBtn, flex: 2 }}
            disabled={identity.trim().length === 0}
            onClick={() => {
              setError(null)
              setStep(3)
            }}
          >
            下一步
          </button>
        </div>
      </main>
    )
  }

  if (step === 3) {
    return (
      <main style={panel}>
        <StepHeader step={4} total={5} title="今年，你最想完成的一件事？" />
        <p style={{ color: '#8b8ba3', fontSize: 14, lineHeight: 1.7, marginTop: 0 }}>
          身份有了方向，再给它一个目标。不用多，<strong style={{ color: '#7ee0a8' }}>一年就这一件事</strong>——
          之后每天的微小习惯，都是朝着它迈出的一步。
        </p>
        <div style={{ fontSize: 13, color: '#8b8ba3', marginBottom: 6 }}>
          以「我是{identity.trim() || '…'}」的身份，今年我想完成：
        </div>
        <textarea
          value={annualGoal}
          onChange={(e) => setAnnualGoal(e.target.value)}
          placeholder="比如：每天精力充沛地生活，把身体练回二十岁的样子 / 完成第一本书 / 攒下第一笔自己的钱"
          rows={3}
          maxLength={100}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
        <div style={{ fontSize: 11, color: '#5a5a74', marginTop: 4 }}>可跳过，之后也能随时补充。</div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button type="button" style={ghostBtn} onClick={() => setStep(2)}>
            上一步
          </button>
          <button
            type="button"
            style={{ ...primaryBtn, flex: 2 }}
            onClick={() => {
              setError(null)
              setStep(4)
            }}
          >
            下一步
          </button>
        </div>
      </main>
    )
  }

  if (step === 4) {
    return (
      <main style={panel}>
        <StepHeader step={5} total={5} title="你想从哪件事开始？" />
        <p style={{ color: '#8b8ba3', fontSize: 14, lineHeight: 1.7, marginTop: 0 }}>
          描述一个你最想改掉的坏习惯，或最想养成的第一个好习惯。一句大白话就行，后面我们会帮你拆成每天不可能失败的小事。
        </p>
        <textarea
          value={badHabit}
          onChange={(e) => setBadHabit(e.target.value)}
          placeholder="比如：晚上躺床上刷手机到一两点 / 想养成每天读 10 页书的习惯"
          rows={3}
          maxLength={300}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button type="button" style={ghostBtn} onClick={() => setStep(2)}>
            上一步
          </button>
          <button
            type="button"
            style={{ ...primaryBtn, flex: 2 }}
            onClick={() => {
              setError(null)
              setStep(4)
            }}
          >
            下一步
          </button>
        </div>
      </main>
    )
  }

  // 对比图：现状版 vs 向往版（AI 生成图后置，模板卡片兜底）
  const hasVision = identity.trim().length > 0
  return (
    <main style={panel}>
      <StepHeader step={5} total={5} title="两条路，你选一条" />
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div
          style={{
            flex: 1,
            background: '#2a1c3d',
            borderRadius: 10,
            padding: 14,
            border: '1px solid #4a2a6a',
          }}
        >
          <div style={{ fontSize: 13, color: '#c9a0ff', marginBottom: 8 }}>👁 现状版 · 反愿景</div>
          <div style={{ fontSize: 12, color: '#a08ab8', lineHeight: 1.6, minHeight: 60 }}>
            {antivision.trim() || '5 年后什么都不改的普通一天'}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            background: '#153a2c',
            borderRadius: 10,
            padding: 14,
            border: '1px solid #2a6a4a',
          }}
        >
          <div style={{ fontSize: 13, color: '#7ee0a8', marginBottom: 8 }}>🌟 向往版 · 正愿景</div>
          <div style={{ fontSize: 12, color: '#8bc9a8', lineHeight: 1.6, minHeight: 60 }}>
            {hasVision ? `我是${identity}` : '你的新身份'}
          </div>
        </div>
      </div>
      <p style={{ color: '#8b8ba3', fontSize: 13, lineHeight: 1.7, marginTop: 0 }}>
        每天打卡时，系统会替你说：「我以{hasVision ? `${identity}` : '新身份'}的身份完成了今天的习惯，离目标更近了一点点。」
        你什么都不用写。
      </p>
      {error && (
        <p role="alert" style={{ color: '#ff7a7a', fontSize: 13 }}>
          {error}
        </p>
      )}
      <button type="button" style={primaryBtn} onClick={finish}>
        完成角色设定，开始游戏
      </button>
    </main>
  )
}

export default OnboardingScreen
