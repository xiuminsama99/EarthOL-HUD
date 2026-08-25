/**
 * 打卡主界面（工单 05）
 *
 * 薄壳组件：数据流 = timeProvider 取网络时间 → businessDateFromSource 定业务日
 * → habitFlow 调引擎判定 + 持久化 → 重新读取渲染。领域规则零散落在引擎。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { HabitState, RejectReason, WorkSchedule } from '../../engine/types'
import { FORMED_DAYS, buildAutoNote } from '../../engine/engine'
import { earthStorage } from '../../storage/storage'
import { businessDateFromSource, timeProvider } from '../../time/timeProvider'
import type { TimeSource } from '../../time/timeProvider'
import { PetCard } from '../pet/PetCard'
import { recordPetMood } from '../pet/petFlow'
import type { PetMoodEvent } from '../pet/petFlow'
import {
  DEFAULT_REMINDER_TIME,
  isValidReminderTime,
  sendPetReminder,
  shouldRemind,
} from '../pet/petReminder'
import { createHabit, performCheckin, planToday, setCap, buildCheckinResultNotice, renameHabit, deleteHabit } from './habitFlow'
import type { CheckinAction, NewHabitInput } from './habitFlow'
import { CreateHabitForm } from './CreateHabitForm'
import { yearlyEffect } from './habitTemplates'
import { computeScaleData } from '../scale/scaleFlow'
import { ScalePanel } from '../scale/ScalePanel'
import { HeatmapPanel } from '../heatmap/HeatmapPanel'

const SCHEDULE_LABEL: Record<WorkSchedule, string> = {
  day: '白天工作',
  night: '夜间工作',
}

const REJECT_LABEL: Record<RejectReason, string> = {
  'missing-note': '打卡记录不能为空',
  'insufficient-vacation-coins': '假期币不足：超额打卡可存假期币，存 1 枚即可休息',
  'already-checked-in': '今天已经打过卡了，明天再来',
  'schedule-switched-today': '今天已切换过作息类型，今天不能再打卡',
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
  const [renameInput, setRenameInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  /** R6：schedule 最新值供定时器闭包读取（interval 只注册一次） */
  const scheduleRef = useRef(schedule)
  scheduleRef.current = schedule

  const [reminderEnabled, setReminderEnabled] = useState(
    () => earthStorage.getProfile()?.petReminderEnabled ?? false,
  )
  const [reminderTime, setReminderTime] = useState(
    () => earthStorage.getProfile()?.petReminderTime ?? DEFAULT_REMINDER_TIME,
  )

  /**
   * R6：提醒检查。应用打开期间每分钟一次；页面关闭无后台推送
   * （能力边界：定时后台推送需要服务端 + Web Push，BaaS 后置）。
   * 全部读 storage 最新值，避免闭包过期。
   */
  const checkPetReminderOnce = (src: TimeSource) => {
    const profile = earthStorage.getProfile()
    const pet = earthStorage.listPets()[0]
    if (!profile || !pet) return
    const bd = businessDateFromSource(src, scheduleRef.current)
    const habit = earthStorage.listHabits()[0]
    const checkedToday = habit?.lastCheckinDate === bd
    if (
      !shouldRemind({
        now: src.now,
        businessDate: bd,
        checkedToday,
        lastRemindedAt: profile.lastPetReminderDate,
        profile,
      })
    ) {
      return
    }
    if (sendPetReminder(pet, profile.identityStatement) === 'sent') {
      earthStorage.updateProfile({ lastPetReminderDate: bd })
    }
  }

  useEffect(() => {
    void timeProvider.getNow().then((src) => {
      setTimeSource(src)
      checkPetReminderOnce(src)
    })
    // A1 修复：周期性刷新时间源，页面跨午夜挂机时业务日自动翻新
    const timer = window.setInterval(() => {
      void timeProvider.getNow().then((src) => {
        setTimeSource(src)
        checkPetReminderOnce(src)
      })
    }, 60_000)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- interval 只注册一次，内部全走 storage 最新值
  }, [])

  const habit = useMemo(
    () => earthStorage.listHabits()[0] ?? null,
    [refresh], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const identity = useMemo(
    () => earthStorage.getProfile()?.identityStatement ?? null,
    [refresh], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const annualGoal = useMemo(
    () => earthStorage.getProfile()?.annualGoal ?? null,
    [refresh], // eslint-disable-line react-hooks/exhaustive-deps
  )
  /** B4：引导时写下的坏习惯描述（预填建习惯表单） */
  const badHabitDesc = useMemo(
    () => earthStorage.getProfile()?.badHabitDesc ?? null,
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
    if (result.mode === 'minimal') {
      // 最低版本：保住今天，心情不动（无功无过）
      setFeedback({ kind: 'ok', text: '最低版本保住今天 ✓ 不丢养成进度，明天从原目标继续' })
      return
    }
    // 宠物心情联动：缺勤归来 → 低落；超额 → 更开心；达标 → 开心
    const moodEvent: PetMoodEvent =
      (plan.backoffDays ?? 0) > 0
        ? 'checkin-backoff'
        : result.warning
          ? 'checkin-extra'
          : 'checkin'
    recordPetMood({ storage: earthStorage }, moodEvent)
    // UX-1：按真实完成量分叉反馈（达标 / 未达标 / 超额），不虚假成功
    setFeedback({
      kind: result.warning ? 'warn' : 'ok',
      text: buildCheckinResultNotice(result),
    })
  }

  const toggleSchedule = () => {
    const next: WorkSchedule = schedule === 'day' ? 'night' : 'day'
    // B1：记录切换时刻，切换当天禁止再次打卡（防切昼夜刷卡）；窗口确认避免误触锁死当天
    const confirmed = window.confirm('切换作息后今天不能再打卡，确定吗？')
    if (!confirmed) return
    earthStorage.updateProfile({ schedule: next, lastScheduleSwitchAt: new Date().toISOString() })
    setSchedule(next)
    setError(`已切换为${SCHEDULE_LABEL[next]}，明天起按新作息计算`)
  }

  /** R6：宠物提醒开关（开启时请求通知权限；拒绝则保持关闭） */
  const onToggleReminder = async () => {
    setError(null)
    const enabled = !reminderEnabled
    if (enabled && typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setError('通知权限未开启，宠物提醒无法送达')
        return
      }
    }
    earthStorage.updateProfile({ petReminderEnabled: enabled })
    setReminderEnabled(enabled)
    setFeedback({
      kind: 'ok',
      text: enabled
        ? `宠物提醒已开启：每天 ${reminderTime} 会提醒你（应用打开期间）`
        : '宠物提醒已关闭',
    })
  }

  /** R6：提醒时间修改（HH:mm，仅合法值入库） */
  const onReminderTimeChange = (value: string) => {
    if (!isValidReminderTime(value)) {
      setError('提醒时间格式应为 HH:mm（如 20:00）')
      return
    }
    earthStorage.updateProfile({ petReminderTime: value })
    setReminderTime(value)
    setError(null)
  }

  const onCreate = (input: NewHabitInput): { error: string | null } => {
    const result = createHabit({ storage: earthStorage }, input)
    if (result.error) return { error: result.error }
    bump()
    setFeedback({ kind: 'ok', text: `习惯「${result.habit!.name}」已建立，从今天开始` })
    return { error: null }
  }

  const onCheckin = () => {
    const value = Number(amount)
    // UX-1：拒绝空/0 完成量（引擎 0 是合法语义，此处拦截误操作；反向触底的一键打卡走 onOneTap 不受影响）
    if (!Number.isInteger(value) || value < 1) {
      setError('完成量至少 1')
      return
    }
    runCheckin({
      amount: value,
      note: note.trim() === '' ? undefined : note,
    })
  }

  /** 一键打卡（工单 06）：底部大按钮，按当日目标量达标打卡，零输入 */
  const onOneTap = () => {
    if (!plan) return
    runCheckin({ amount: plan.target })
  }

  /** 最低版本（R4）：状态差保底行动，不丢养成进度 */
  const onMinimalCheckin = () => {
    runCheckin({ amount: 1, mode: 'minimal' })
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

  /** B6：改名（仅名称，引擎规则不读） */
  const onRename = () => {
    setError(null)
    if (!habit) return
    const result = renameHabit({ storage: earthStorage }, habit.id, renameInput)
    if (result.error) {
      setError(result.error)
      return
    }
    bump()
    setRenameInput('')
    setFeedback({ kind: 'ok', text: `习惯已改名为「${result.habit!.name}」` })
  }

  /** B6：删除（二次确认，关联打卡记录保留） */
  const onDelete = () => {
    setError(null)
    if (!habit) return
    const confirmed = window.confirm(`确定删除习惯「${habit.name}」吗？历史打卡记录会保留。`)
    if (!confirmed) return
    const result = deleteHabit({ storage: earthStorage }, habit.id)
    if (!result.ok) {
      setError(result.error)
      return
    }
    bump()
    setCapInput('')
    setRenameInput('')
    setFeedback({ kind: 'ok', text: '习惯已删除，可以建立新的微习惯了' })
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

      {businessDate && <HeatmapPanel checkins={checkins} today={businessDate} />}

      {/* UX-9：调试信息（时间源/业务日）移入默认折叠的设置区，用户语言化 */}
      <details
        style={{ borderBottom: '1px solid #2c2c4a', paddingBottom: 10, marginBottom: 18 }}
      >
        <summary style={{ fontSize: 13, color: '#8b8ba3', cursor: 'pointer', userSelect: 'none' }}>
          设置（作息 · 宠物提醒）
        </summary>
        <div style={{ marginTop: 10 }}>
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
          <div style={row}>
            <span style={smallLabel}>宠物提醒</span>
            <button
              type="button"
              onClick={onToggleReminder}
              style={{ background: reminderEnabled ? '#153a2c' : '#1b1b33', color: reminderEnabled ? '#7ee0a8' : '#e5e5f0', border: `1px solid ${reminderEnabled ? '#2c8a5a' : '#2c2c4a'}`, borderRadius: 6, padding: '4px 10px', fontSize: 13 }}
            >
              {reminderEnabled ? '已开启' : '已关闭'}
            </button>
            {reminderEnabled && (
              <input
                type="time"
                value={reminderTime}
                onChange={(e) => onReminderTimeChange(e.target.value)}
                style={{ background: '#1b1b33', color: '#e5e5f0', border: '1px solid #2c2c4a', borderRadius: 6, padding: '4px 6px', fontSize: 13 }}
              />
            )}
            <span style={{ fontSize: 11, color: '#5a5a74' }}>应用打开期间</span>
          </div>
          <div style={row}>
            <span style={smallLabel}>时间源</span>
            <span style={{ fontSize: 13 }}>{timeLabel}</span>
          </div>
          <div style={row}>
            <span style={smallLabel}>业务日</span>
            <span style={{ fontSize: 13 }}>{businessDate ?? '解析中…'}</span>
          </div>
        </div>
      </details>

      {!businessDate ? (
        <div
          style={{
            padding: '40px 0',
            textAlign: 'center',
            color: '#8b8ba3',
            fontSize: 14,
          }}
        >
          解析时间中…
        </div>
      ) : !habit || !plan ? (
        <CreateHabitForm
          businessDate={businessDate}
          onSubmit={onCreate}
          initialName={badHabitDesc ?? undefined}
          initialDirection={badHabitDesc ? 'negative' : undefined}
        />
      ) : (
        <HabitPanel
          habit={habit}
          plan={plan}
          autoNote={autoNote}
          annualGoal={annualGoal}
          amount={amount}
          setAmount={setAmount}
          note={note}
          setNote={setNote}
          capInput={capInput}
          setCapInput={setCapInput}
          renameInput={renameInput}
          setRenameInput={setRenameInput}
          error={error}
          feedback={feedback}
          onCheckin={onCheckin}
          onMinimalCheckin={onMinimalCheckin}
          onRestDay={onRestDay}
          onLockCap={onLockCap}
          onRename={onRename}
          onDelete={onDelete}
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
          {todayChecked ? '今日已完成 ✓' : '一键打卡'}
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
  /** 年度主线（三层目标第一层；有值时在习惯卡片展示归属） */
  annualGoal: string | null
  amount: string
  setAmount(v: string): void
  note: string
  setNote(v: string): void
  capInput: string
  setCapInput(v: string): void
  renameInput: string
  setRenameInput(v: string): void
  error: string | null
  feedback: Feedback | null
  onCheckin(): void
  onMinimalCheckin(): void
  onRestDay(): void
  onLockCap(): void
  onRename(): void
  onDelete(): void
}

function HabitPanel(props: HabitPanelProps) {
  const { habit, plan } = props
  const directionLabel = habit.direction === 'positive' ? '养成' : '戒除'
  const annualGoal = props.annualGoal?.trim()
  /** UX-7：戒除类习惯目标触底 0 → 完成态 */
  const zeroTarget = plan.target === 0 && habit.direction === 'negative'

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

      {annualGoal && (
        <p style={{ color: '#7ee0a8', fontSize: 12, marginTop: 0, marginBottom: 10 }}>
          🔗 年度主线：{annualGoal}
        </p>
      )}

      <div style={{ background: '#1b1b33', borderRadius: 10, padding: 16, textAlign: 'center', marginBottom: 16 }}>
        {zeroTarget ? (
          <div style={{ fontSize: 15, color: '#7ee0a8', lineHeight: 1.6 }}>
            已戒除到 0，恭喜！
            <br />
            可以换个新习惯，或继续坚持
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, color: '#8b8ba3' }}>今日目标</div>
            <div style={{ fontSize: 42, fontWeight: 700, lineHeight: 1.2 }}>{plan.target}</div>
            {plan.backoffDays > 0 && (
              <div style={{ fontSize: 12, color: '#d9b64a' }}>
                缺勤 {plan.backoffDays} 天，目标已回退（不退零，从当前位置继续）
              </div>
            )}
            {!plan.locked && (
              <div style={{ fontSize: 12, color: '#8b8ba3', marginTop: 4 }}>
                明日目标 {plan.tomorrowTarget}
              </div>
            )}
          </>
        )}
      </div>

      {/* UX-3：养成进度（不做 streak 叙事，与产品哲学一致）；缺勤归来如实解释重置 */}
      <div style={{ fontSize: 13, color: '#8b8ba3', marginBottom: 6 }}>
        养成进度 {habit.formationDays}/{FORMED_DAYS}
      </div>
      {plan.backoffDays > 0 && (
        <div style={{ fontSize: 12, color: '#d9b64a', marginBottom: 6 }}>
          缺勤会重置养成进度，从第 1 天重新计——没关系，继续就是
        </div>
      )}

      {/* R5：年度累计效果（持续激励：按当前目标量换算 365 天总量） */}
      <p
        style={{
          color: '#7ee0a8',
          fontSize: 13,
          margin: '0 0 12px',
          fontWeight: 600,
        }}
      >
        {zeroTarget ? '已达成 🎉' : `${yearlyEffect(plan.target, habit.unit)}，坚持就会抵达`}
      </p>

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
              {extra === 0 ? '刚好达标' : `多做了 ${extra} 个（不建议）`}
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
          title="消耗 1 枚假期币，今日不打卡也不缺勤；没有币时点按会提示如何获取"
          style={{
            padding: '12px 14px',
            borderRadius: 8,
            border: '1px solid #2c2c4a',
            background: '#1b1b33',
            color: '#e5e5f0',
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          休息
        </button>
      </div>

      {/* 最低版本（R4）：状态差保底行动，不丢养成进度（防流失最后一道防线） */}
      <button
        type="button"
        onClick={props.onMinimalCheckin}
        title="状态差也没关系：做 1 个也算以身份行动，明天从原目标继续，养成进度不丢"
        style={{
          width: '100%',
          marginTop: 8,
          padding: '10px 0',
          borderRadius: 8,
          border: '1px solid #2c8a5a',
          background: '#153a2c',
          color: '#7ee0a8',
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        今天状态差？用最低版本保底（不丢养成进度）
      </button>

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

      <div
        style={{
          marginTop: 18,
          paddingTop: 14,
          borderTop: '1px solid #2c2c4a',
        }}
      >
        <div style={{ fontSize: 13, color: '#8b8ba3', marginBottom: 4 }}>习惯管理</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            maxLength={40}
            value={props.renameInput}
            onChange={(e) => props.setRenameInput(e.target.value)}
            placeholder={`改名（当前：${habit.name}）`}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid #2c2c4a',
              background: '#1b1b33',
              color: '#e5e5f0',
              fontSize: 14,
            }}
          />
          <button
            type="button"
            onClick={props.onRename}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #2c2c4a',
              background: '#1b1b33',
              color: '#e5e5f0',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            改名
          </button>
          <button
            type="button"
            onClick={props.onDelete}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #8a2c2c',
              background: '#3a1515',
              color: '#ff9a9a',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            删除
          </button>
        </div>
      </div>
    </div>
  )
}

export default HabitScreen
