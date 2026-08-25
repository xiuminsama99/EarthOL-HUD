/**
 * 打卡主界面（工单 05）
 *
 * 薄壳组件：数据流 = timeProvider 取网络时间 → businessDateFromSource 定业务日
 * → habitFlow 调引擎判定 + 持久化 → 重新读取渲染。领域规则零散落在引擎。
 */
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { HabitState, RejectReason, WorkSchedule } from '../../engine/types'
import { FORMED_DAYS, buildAutoNote } from '../../engine/engine'
import { earthStorage } from '../../storage/storage'
import { businessDateFromSource, timeProvider } from '../../time/timeProvider'
import type { TimeSource } from '../../time/timeProvider'
import { PetCard } from '../pet/PetCard'
import { recordPetMood } from '../pet/petFlow'
import type { PetMoodEvent } from '../pet/petFlow'
import { createHabit, performCheckin, planToday, setCap } from './habitFlow'
import type { CheckinAction, NewHabitInput } from './habitFlow'
import { CreateHabitForm } from './CreateHabitForm'
import { computeScaleData } from '../scale/scaleFlow'
import { ScalePanel } from '../scale/ScalePanel'

const SCHEDULE_LABEL: Record<WorkSchedule, string> = {
  day: '白天工作',
  night: '夜间工作',
}

const REJECT_LABEL: Record<RejectReason, string> = {
  'missing-note': '打卡记录不能为空',
  'insufficient-vacation-coins': '假期币不足，今天还不能休息',
  'already-checked-in': '今天已经打过卡了，明天再来',
}

interface Feedback {
  kind: 'ok' | 'warn'
  text: string
}

const panel: CSSProperties = {
  maxWidth: 480,
  margin: '40px auto',
  padding: 24,
  paddingBottom: 120, // 给底部固定「一键打卡」留空间
  borderRadius: 12,
  background: '#141428',
  color: '#e5e5f0',
  fontFamily: 'system-ui, sans-serif',
}

const row: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0' }
const smallLabel: CSSProperties = { width: 96, color: '#8b8ba3', flexShrink: 0, fontSize: 13 }

function HabitScreen() {
  const [timeSource, setTimeSource] = useState<TimeSource | null>(null)
  const [schedule, setSchedule] = useState<WorkSchedule>(
    () => earthStorage.getProfile()?.schedule ?? 'day',
  )
  const [refresh, setRefresh] = useState(0)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [capInput, setCapInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  useEffect(() => {
    void timeProvider.getNow().then(setTimeSource)
  }, [])

  const habit = useMemo(
    () => earthStorage.listHabits()[0] ?? null,
    [refresh], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const identity = useMemo(
    () => earthStorage.getProfile()?.identityStatement ?? null,
    [refresh], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const vision = useMemo(
    () => earthStorage.getProfile()?.vision ?? null,
    [refresh], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const pet = useMemo(
    () => earthStorage.listPets()[0] ?? null,
    [refresh], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const habits = useMemo(
    () => earthStorage.listHabits(),
    [refresh], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const checkins = useMemo(
    () => earthStorage.listCheckins(),
    [refresh], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const scale = useMemo(() => computeScaleData(habits, checkins), [habits, checkins])
  /** 自动生成打卡语（预览用）：默认展示，用户可确认或编辑覆盖 */
  const autoNote = useMemo(
    () => (habit ? buildAutoNote(habit, identity) : ''),
    [habit, identity],
  )
  const businessDate = useMemo(
    () => (timeSource ? businessDateFromSource(timeSource, schedule) : null),
    [timeSource, schedule],
  )
  const plan = useMemo(
    () => (habit && businessDate ? planToday(habit, businessDate) : null),
    [habit, businessDate],
  )

  /** 今日是否已打卡（一键按钮态） */
  const todayChecked = useMemo(
    () => (habit && businessDate ? habit.lastCheckinDate === businessDate : false),
    [habit, businessDate],
  )

  const bump = () => {
    setRefresh((v) => v + 1)
    setAmount('')
    setNote('')
  }

  /** 打卡动作统一入口：引擎判定 + 宠物心情联动 + 反馈（工单 06 起一键打卡复用） */
  const runCheckin = (action: CheckinAction) => {
    setError(null)
    if (!habit || !timeSource || !plan) return
    const outcome = performCheckin(
      { storage: earthStorage },
      habit,
      timeSource.now,
      schedule,
      action,
    )
    const { result } = outcome
    if (result.status === 'rejected') {
      setError(REJECT_LABEL[result.reason!])
      return
    }
    bump()
    // 宠物心情联动：缺勤归来 → 低落；超额 → 更开心；达标 → 开心
    const moodEvent: PetMoodEvent =
      (plan.backoffDays ?? 0) > 0
        ? 'checkin-backoff'
        : result.warning
          ? 'checkin-extra'
          : 'checkin'
    recordPetMood({ storage: earthStorage }, moodEvent)
    if (result.warning) {
      setFeedback({
        kind: 'warn',
        text: `${result.warning.message}，超额 ${result.overAmount} 已转为假期币（当前 ${result.habit.vacationCoins} 枚）`,
      })
    } else {
      setFeedback({ kind: 'ok', text: '今日达标 ✓ 以新身份行动的一天' })
    }
  }

  const toggleSchedule = () => {
    const next: WorkSchedule = schedule === 'day' ? 'night' : 'day'
    earthStorage.updateProfile({ schedule: next })
    setSchedule(next)
  }

  const onCreate = (input: NewHabitInput): { error: string | null } => {
    const result = createHabit({ storage: earthStorage }, input)
    if (result.error) return { error: result.error }
    bump()
    setFeedback({ kind: 'ok', text: `习惯「${result.habit!.name}」已建立，从今天开始` })
    return { error: null }
  }

  const onCheckin = () => {
    runCheckin({
      // 零输入体验：打卡语为空时交给引擎自动生成
      amount: Number(amount),
      note: note.trim() === '' ? undefined : note,
    })
  }

  /** 一键打卡（工单 06）：底部大按钮，按当日目标量达标打卡，零输入 */
  const onOneTap = () => {
    if (!plan) return
    runCheckin({ amount: plan.target })
  }

  const onRestDay = () => {
    setError(null)
    if (!habit || !timeSource) return
    const outcome = performCheckin({ storage: earthStorage }, habit, timeSource.now, schedule, {
      amount: 0,
      restDay: true,
    })
    const { result } = outcome
    if (result.status === 'rejected') {
      setError(REJECT_LABEL[result.reason!])
      return
    }
    bump()
    recordPetMood({ storage: earthStorage }, 'rest-day')
    setFeedback({ kind: 'ok', text: '今日休息，假期币 -1，明天满血回归' })
  }

  const onLockCap = () => {
    setError(null)
    if (!habit) return
    const result = setCap({ storage: earthStorage }, habit, Number(capInput))
    if (result.error) {
      setError(result.error)
      return
    }
    bump()
    setCapInput('')
    setFeedback({ kind: 'ok', text: `已${plan?.locked ? '调整' : '定死'}：每天 ${result.habit!.cap}，不再随天数自动变化（可随时再调）` })
  }

  const timeLabel = timeSource
    ? timeSource.source === 'network'
      ? '网络时间 ✓'
      : '设备时间（未验证）'
    : '解析中…'

  return (
    <main style={panel}>
      <h1 style={{ marginTop: 0, fontSize: 20 }}>地球online玩家控制台</h1>

      <PetCard refreshKey={refresh} />

      <ScalePanel
        scale={scale}
        petBreed={pet?.breed ?? null}
        petName={pet?.name ?? null}
        identity={identity}
        vision={vision}
      />

      <div style={{ borderBottom: '1px solid #2c2c4a', paddingBottom: 10, marginBottom: 18 }}>
        <div style={row}>
          <span style={smallLabel}>时间源</span>
          <span style={{ fontSize: 13 }}>{timeLabel}</span>
        </div>
        <div style={row}>
          <span style={smallLabel}>业务日</span>
          <span style={{ fontSize: 13 }}>{businessDate ?? '解析中…'}</span>
        </div>
        <div style={row}>
          <span style={smallLabel}>作息</span>
          <button
            type="button"
            onClick={toggleSchedule}
            style={{ background: '#1b1b33', color: '#e5e5f0', border: '1px solid #2c2c4a', borderRadius: 6, padding: '4px 10px', fontSize: 13 }}
          >
            {SCHEDULE_LABEL[schedule]}
          </button>
        </div>
      </div>

      {!habit || !plan ? (
        <CreateHabitForm businessDate={businessDate ?? ''} onSubmit={onCreate} />
      ) : (
        <HabitPanel
          habit={habit}
          plan={plan}
          autoNote={autoNote}
          amount={amount}
          setAmount={setAmount}
          note={note}
          setNote={setNote}
          capInput={capInput}
          setCapInput={setCapInput}
          error={error}
          feedback={feedback}
          onCheckin={onCheckin}
          onRestDay={onRestDay}
          onLockCap={onLockCap}
        />
      )}

      {/* 底部固定「一键打卡」（工单 06）：一天只需要点一下；超额仍走卡片内快捷按钮 */}
      {habit && plan && (
        <button
          type="button"
          onClick={onOneTap}
          disabled={todayChecked}
          style={{
            position: 'fixed',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'min(calc(100% - 32px), 448px)',
            padding: '14px 0',
            borderRadius: 999,
            border: 'none',
            background: todayChecked ? '#2c2c4a' : '#7c5cff',
            color: todayChecked ? '#8b8ba3' : '#fff',
            fontSize: 17,
            fontWeight: 700,
            cursor: todayChecked ? 'default' : 'pointer',
            boxShadow: todayChecked ? 'none' : '0 6px 20px rgba(124,92,255,0.35)',
            zIndex: 10,
          }}
        >
          {todayChecked ? '今日已打卡 ✓' : '一键打卡'}
        </button>
      )}
    </main>
  )
}

interface HabitPanelProps {
  habit: HabitState
  plan: ReturnType<typeof planToday>
  /** 自动生成打卡语预览（默认展示，可确认或编辑覆盖） */
  autoNote: string
  amount: string
  setAmount(v: string): void
  note: string
  setNote(v: string): void
  capInput: string
  setCapInput(v: string): void
  error: string | null
  feedback: Feedback | null
  onCheckin(): void
  onRestDay(): void
  onLockCap(): void
}

function HabitPanel(props: HabitPanelProps) {
  const { habit, plan } = props
  const directionLabel = habit.direction === 'positive' ? '养成' : '戒除'

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <h2 style={{ margin: 0, fontSize: 17 }}>{habit.name}</h2>
        <span style={{ fontSize: 12, color: '#8b8ba3', border: '1px solid #2c2c4a', borderRadius: 999, padding: '2px 10px' }}>
          {directionLabel}
          {plan.locked ? ' · 已定死' : ' · 等差数列'}
        </span>
      </div>
      <p style={{ color: '#8b8ba3', fontSize: 12, marginTop: 0 }}>
        总量 {habit.totalAmount} · 养成值 {habit.consistencyDays} 天 · 假期币 {habit.vacationCoins} 枚
        {habit.isFormed && <span style={{ color: '#7c5cff' }}> · 已养成 ✓</span>}
      </p>

      <div style={{ background: '#1b1b33', borderRadius: 10, padding: 16, textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: '#8b8ba3' }}>今日目标</div>
        <div style={{ fontSize: 42, fontWeight: 700, lineHeight: 1.2 }}>{plan.target}</div>
        {plan.backoffDays > 0 && (
          <div style={{ fontSize: 12, color: '#d9b64a' }}>
            缺勤 {plan.backoffDays} 天，目标已回退（不退零，从当前位置继续）
          </div>
        )}
        {!plan.locked && (
          <div style={{ fontSize: 12, color: '#8b8ba3', marginTop: 4 }}>
            明日目标 {plan.target + (habit.direction === 'positive' ? 1 : -1)}
          </div>
        )}
      </div>

      <div style={{ fontSize: 13, color: '#8b8ba3', marginBottom: 6 }}>
        养成线 {habit.formationDays}/{FORMED_DAYS}
        {habit.formationDays > 0 && ` · 连续 ${habit.formationDays} 天达标`}
      </div>

      {props.feedback && (
        <p
          role="status"
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            fontSize: 13,
            margin: '0 0 12px',
            background: props.feedback.kind === 'ok' ? '#153a2c' : '#3a2c15',
            color: props.feedback.kind === 'ok' ? '#7ee0a8' : '#ffd27a',
          }}
        >
          {props.feedback.text}
        </p>
      )}

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 13, color: '#8b8ba3', marginBottom: 4 }}>
          今日完成量
        </label>
        <input
          type="number"
          min={0}
          step={1}
          value={props.amount}
          onChange={(e) => props.setAmount(e.target.value)}
          placeholder={`今日目标 ${plan.target}`}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #2c2c4a',
            background: '#1b1b33',
            color: '#e5e5f0',
            fontSize: 16,
          }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          {[0, 1, 2, 5].map((extra) => (
            <button
              key={extra}
              type="button"
              onClick={() => props.setAmount(String(plan.target + extra))}
              style={{
                flex: 1,
                padding: '6px 0',
                borderRadius: 6,
                border: '1px solid #2c2c4a',
                background: '#1b1b33',
                color: extra === 0 ? '#e5e5f0' : '#d9b64a',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {extra === 0 ? '刚好达标' : `多做了 ${extra} 个`}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 13, color: '#8b8ba3', marginBottom: 4 }}>
          打卡语
        </label>
        <textarea
          value={props.note}
          onChange={(e) => props.setNote(e.target.value)}
          placeholder={props.autoNote}
          rows={2}
          maxLength={200}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #2c2c4a',
            background: '#1b1b33',
            color: '#e5e5f0',
            fontSize: 14,
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
        <div style={{ fontSize: 11, color: '#8b8ba3', marginTop: 4 }}>
          默认自动生成，也可以自己改：{props.autoNote}
        </div>
      </div>

      {props.error && (
        <p role="alert" style={{ color: '#ff7a7a', fontSize: 13 }}>
          {props.error}
        </p>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={props.onCheckin}
          style={{
            flex: 1,
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
          打卡
        </button>
        <button
          type="button"
          onClick={props.onRestDay}
          disabled={habit.vacationCoins <= 0}
          title={habit.vacationCoins > 0 ? '消耗 1 枚假期币，今日不打卡也不缺勤' : '需要假期币'}
          style={{
            padding: '12px 14px',
            borderRadius: 8,
            border: '1px solid #2c2c4a',
            background: '#1b1b33',
            color: habit.vacationCoins > 0 ? '#e5e5f0' : '#5a5a74',
            fontSize: 14,
            cursor: habit.vacationCoins > 0 ? 'pointer' : 'not-allowed',
          }}
        >
          休息
        </button>
      </div>

      <div
        style={{
          marginTop: 18,
          paddingTop: 14,
          borderTop: '1px solid #2c2c4a',
        }}
      >
        <div style={{ fontSize: 13, color: '#8b8ba3', marginBottom: 4 }}>
          动态调节条：设定后不再随天数自动变化，可随时调整
        </div>
        {plan.locked && (
          <div style={{ fontSize: 12, color: '#8b8ba3', marginBottom: 6 }}>
            当前已定死：每天 {habit.cap}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="number"
            min={1}
            step={1}
            value={props.capInput}
            onChange={(e) => props.setCapInput(e.target.value)}
            placeholder={plan.locked ? `当前 ${habit.cap}，输入新上限` : '上限（如 10）'}
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #2c2c4a',
              background: '#1b1b33',
              color: '#e5e5f0',
              fontSize: 15,
            }}
          />
          <button
            type="button"
            onClick={props.onLockCap}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: '1px solid #d9b64a',
              background: '#3a2c15',
              color: '#ffd27a',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            {plan.locked ? '调整' : '定死'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default HabitScreen
