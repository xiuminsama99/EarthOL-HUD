/**
 * 打卡主界面（工单 05）
 *
 * 薄壳组件：数据流 = timeProvider 取网络时间 → businessDateFromSource 定业务日
 * → habitFlow 调引擎判定 + 持久化 → 重新读取渲染。领域规则零散落在引擎。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { HabitState, RejectReason, WorkSchedule } from '../../engine/types'
import { FORMED_DAYS, buildAutoNote, computeAchievements, projectAnnual } from '../../engine/engine'
import { earthStorage } from '../../storage/storage'
import { parseData, serializeData } from '../../storage/storage'
import { playChime, isSoundEnabled } from '../../util/playChime'
import { businessDateFromSource, timeProvider } from '../../time/timeProvider'
import type { TimeSource } from '../../time/timeProvider'
import { PetCard } from '../pet/PetCard'
import { recordPetMood, settlePetMoodDecay } from '../pet/petFlow'
import type { PetMoodEvent } from '../pet/petFlow'
import { StoryPanel } from '../story/StoryPanel'
import { AchievementPanel } from './AchievementPanel'
import {
  DEFAULT_REMINDER_TIME,
  isValidReminderTime,
  sendPetReminder,
  shouldRemind,
} from '../pet/petReminder'
import {
  createHabit,
  performCheckin,
  planToday,
  setCap,
  buildCheckinResultNotice,
  renameHabit,
  deleteHabit,
  switchSchedule,
  habitBadgeLabel,
  isZeroTarget,
  formatBusinessDateReadable,
  MAX_HABITS,
} from './habitFlow'
import type { TodayPlan } from './habitFlow'
import type { CheckinAction, NewHabitInput } from './habitFlow'
import { CreateHabitForm } from './CreateHabitForm'
import { AnnualGoalPanel } from './AnnualGoalPanel'
import { computeScaleData } from '../scale/scaleFlow'
import { ScalePanel } from '../scale/ScalePanel'
import { HeatmapPanel } from '../heatmap/HeatmapPanel'
import { updateIdentityAndGoal } from '../onboarding/onboardingFlow'

const SCHEDULE_LABEL: Record<WorkSchedule, string> = {
  day: '白天工作',
  night: '夜间工作',
}

const REJECT_LABEL: Record<RejectReason, string> = {
  'missing-note': '打卡记录不能为空',
  'insufficient-vacation-coins': '休息券不足：今天多做一点可以存休息券，存 1 张就能休息',
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
  /** 工单 14：是否正在添加新习惯（已有习惯时「再加一个」打开表单） */
  const [addingHabit, setAddingHabit] = useState(false)
  /** P1-2：编辑身份/年度目标折叠区状态 */
  const [editProfileOpen, setEditProfileOpen] = useState(false)
  const [editIdentity, setEditIdentity] = useState('')
  const [editGoal, setEditGoal] = useState('')
  /** R10b-4：「我的故事」时间线开关 */
  const [storyOpen, setStoryOpen] = useState(false)
  /** R12（工单 19）：打卡成功庆祝反馈（达标/储蓄养成/戒除完成），1 秒自动消退 */
  const [celebration, setCelebration] = useState<{ text: string; kind: 'ok' | 'extra' | 'formed' } | null>(null)

  /** R10b-5：音效开关（settings.soundOn，默认开） */
  const [soundOn, setSoundOn] = useState(
    () => earthStorage.getSettings().soundOn,
  )

  /** R6：schedule 最新值供定时器闭包读取（interval 只注册一次） */
  const scheduleRef = useRef(schedule)
  scheduleRef.current = schedule
  /** R12（工单 19）：庆祝反馈消退定时器句柄 */
  const celebrationTimer = useRef<number>(0)

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

  const profile = useMemo(
    () => earthStorage.getProfile(),
    [refresh], // eslint-disable-line react-hooks/exhaustive-deps
  )
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
  /** 工单 14：支线习惯 = 主线之后最多 2 个（主线 = habits[0]） */
  const sideHabits = useMemo(() => habits.slice(1, 3), [habits])
  const checkins = useMemo(
    () => earthStorage.listCheckins(),
    [refresh], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const businessDate = useMemo(
    () => (timeSource ? businessDateFromSource(timeSource, schedule) : null),
    [timeSource, schedule],
  )
  /** R12（工单 19）：成就系统——诚实基于真实数据判定（不造假） */
  const achievements = useMemo(
    () =>
      businessDate
        ? computeAchievements({
            hasProfile: Boolean(profile?.onboardedAt),
            habits,
            checkinCount: checkins.length,
            businessDate,
          })
        : [],
    [profile, habits, checkins, businessDate],
  )

  /** R10b-4：每天打开主界面结算一次宠物连漏衰减（幂等；首次仅记录不衰减）；结算后刷新以显示新心情 */
  useEffect(() => {
    if (!businessDate) return
    settlePetMoodDecay({ storage: earthStorage }, businessDate)
    bump()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 每个业务日只结算一次
  }, [businessDate])
  /** R-4：最近 7 天行动率基于注入的业务日计算 */
  const scale = useMemo(
    () => computeScaleData(habits, checkins, businessDate),
    [habits, checkins, businessDate],
  )
  /** 自动生成打卡语（预览用）：默认展示，用户可确认或编辑覆盖 */
  const autoNote = useMemo(
    () => (habit ? buildAutoNote(habit, identity) : ''),
    [habit, identity],
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

  /** P1-5：戒除类习惯目标触底 0 → 完成态（复用流程层判定） */
  const zeroTarget = useMemo(
    () => (habit && businessDate ? isZeroTarget(habit, businessDate) : false),
    [habit, businessDate],
  )

  /** P1-2：打开编辑区时同步当前值 */
  const openEditProfile = () => {
    setEditIdentity(identity ?? '')
    setEditGoal(annualGoal ?? '')
    setEditProfileOpen(true)
  }

  /** P1-2：保存身份宣言 + 年度主线（复用引导校验口径） */
  const onSaveProfile = () => {
    setError(null)
    const result = updateIdentityAndGoal({ storage: earthStorage }, {
      identityStatement: editIdentity,
      annualGoal: editGoal,
    })
    if (result.error) {
      setError(result.error)
      return
    }
    bump()
    setEditProfileOpen(false)
    setFeedback({ kind: 'ok', text: '身份与年度主线已更新，打卡语会跟着新身份走' })
  }

  const bump = () => {
    setRefresh((v) => v + 1)
    setAmount('')
    setNote('')
  }

  /** 打卡动作统一入口：引擎判定 + 宠物心情联动 + 反馈（工单 06 起一键打卡复用；工单 14 起按习惯参数化） */
  const runCheckin = (targetHabit: HabitState, targetPlan: TodayPlan, action: CheckinAction) => {
    setError(null)
    if (!timeSource) return
    const outcome = performCheckin(
      { storage: earthStorage },
      targetHabit,
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
      playChime('minimal', isSoundEnabled(earthStorage.getSettings()))
      setFeedback({ kind: 'ok', text: '今天也算行动了 ✓ 不丢进度，明天从原目标继续' })
      return
    }
    if (result.mode === 'quit-maintain') {
      // 戒除完成态：继续坚持，不做超额/达标判定
      playChime('minimal', isSoundEnabled(earthStorage.getSettings()))
      setFeedback({ kind: 'ok', text: '今天也没做「它」✓ 继续坚持，守住你的界限' })
      return
    }
    // 宠物心情联动：缺勤归来 → 低落；超额 → 更开心；达标 → 开心
    const moodEvent: PetMoodEvent =
      (targetPlan.backoffDays ?? 0) > 0
        ? 'checkin-backoff'
        : result.warning
          ? 'checkin-extra'
          : 'checkin'
    recordPetMood({ storage: earthStorage }, moodEvent)
    // R10b-5：打卡音效（超额/达标差异音高）
    playChime(result.warning ? 'extra' : 'achieved', isSoundEnabled(earthStorage.getSettings()))
    // R12（工单 19）ACH-3：庆祝反馈——只在真实达成时给，1 秒自动消退
    setCelebration({
      text: result.warning ? '✨ 储蓄日' : result.formed ? '🎉 习惯养成' : '✓ 达标',
      kind: result.warning ? 'extra' : result.formed ? 'formed' : 'ok',
    })
    window.clearTimeout(celebrationTimer.current)
    celebrationTimer.current = window.setTimeout(() => setCelebration(null), 1000)
    // UX-1：按真实完成量分叉反馈（达标 / 未达标 / 超额），不虚假成功
    setFeedback({
      kind: result.warning ? 'warn' : 'ok',
      text: buildCheckinResultNotice(result),
    })
  }

  const toggleSchedule = () => {
    // B1：切换记录时刻，切换当天禁止再次打卡（防切昼夜刷卡）；窗口确认避免误触锁死当天
    const confirmed = window.confirm('切换作息后今天不能再打卡，确定吗？')
    if (!confirmed) return
    const { next } = switchSchedule({ storage: earthStorage }, schedule)
    setSchedule(next)
    setError(null)
    // N2：成功/中性反馈走 ok 通道（绿色），不再用红色告警样式
    setFeedback({ kind: 'ok', text: `已切换为${SCHEDULE_LABEL[next]}，明天起按新作息计算` })
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

  const onCheckin = () => {
    const value = Number(amount)
    // UX-1：拒绝空/0 完成量（引擎 0 是合法语义，此处拦截误操作；反向触底的一键打卡走 onOneTap 不受影响）
    if (!Number.isInteger(value) || value < 1) {
      setError('完成量至少 1')
      return
    }
    if (!habit || !plan) return
    runCheckin(habit, plan, {
      amount: value,
      note: note.trim() === '' ? undefined : note,
    })
  }

  /** 一键打卡（工单 06）：底部大按钮，按当日目标量达标打卡，零输入 */
  const onOneTap = () => {
    if (!habit || !plan) return
    runCheckin(habit, plan, { amount: plan.target })
  }

  /** 快捷打卡（UX-16/20）：卡片内「刚好达标 / 多做了 N」点击即直接打卡，不再只填输入框 */
  const onQuickCheckin = (value: number) => {
    if (!habit || !plan) return
    runCheckin(habit, plan, { amount: value, note: note.trim() === '' ? undefined : note })
  }

  /** 最低版本（R4）：状态差保底行动，不丢养成进度 */
  const onMinimalCheckin = () => {
    if (!habit || !plan) return
    runCheckin(habit, plan, { amount: 1, mode: 'minimal' })
  }

  /** P1-1：戒除完成态「继续坚持」——记录今天也没做 X，保持 0 目标态 */
  const onQuitMaintain = () => {
    if (!habit || !plan) return
    runCheckin(habit, plan, { amount: 0, mode: 'quit-maintain' })
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
    playChime('rest', isSoundEnabled(earthStorage.getSettings()))
    setFeedback({ kind: 'ok', text: '今日休息，休息券 -1，明天满血回归' })
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
    setFeedback({ kind: 'ok', text: `已${plan?.locked ? '调整' : '固定'}：每天 ${result.habit!.cap}，不再自动变化（可随时再调）` })
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

  /** 工单 14：新增习惯（建立第一个 / 再加支线均走此） */
  const onCreate = (input: NewHabitInput): { error: string | null } => {
    const result = createHabit({ storage: earthStorage }, input)
    if (result.error) return { error: result.error }
    bump()
    setAddingHabit(false)
    setFeedback({ kind: 'ok', text: `习惯「${result.habit!.name}」已建立，从今天开始` })
    return { error: null }
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
    setFeedback({ kind: 'ok', text: '主线习惯已删除，第一个支线已自动提升为主线' })
  }

  /** R10b-5：音效开关（持久化到 settings.soundOn） */
  const onToggleSound = () => {
    setError(null)
    const enabled = !soundOn
    earthStorage.updateSettings({ soundOn: enabled })
    setSoundOn(enabled)
    setFeedback({ kind: 'ok', text: enabled ? '打击音效已开启' : '打击音效已关闭' })
  }

  /** R10b-5：导出存档（下载完整 EarthData JSON 到本地文件） */
  const onExportData = () => {
    setError(null)
    const data = earthStorage.read()
    const json = serializeData(data)
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    a.download = `earthol-backup-${ts}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setFeedback({ kind: 'ok', text: '存档已导出，可备份或迁移设备' })
  }

  /**
   * R10b-5：导入存档。
   * 先校验（版本/结构），通过后再覆盖；覆盖前自动导出当前数据为备份（时间戳文件）
   * 以防误覆盖。
   */
  const onImportData = (file: File) => {
    setError(null)
    file.text().then((json) => {
      const parsed = parseData(json)
      if (!parsed.data || parsed.error) {
        const label =
          parsed.error === 'invalid-json'
            ? '文件不是有效的 JSON'
            : parsed.error === 'wrong-version'
              ? '存档版本与当前应用不匹配'
              : '存档结构不完整'
        setError(`导入失败：${label}`)
        return
      }
      const confirmed = window.confirm('导入将覆盖当前全部本地数据，且不可撤销。确定继续吗？')
      if (!confirmed) return
      // 覆盖前先自动导出一份当前数据备份，防止误覆盖丢档
      const backupJson = serializeData(earthStorage.read())
      const blob = new Blob([backupJson], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      a.download = `earthol-before-import-${ts}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      earthStorage.replaceAll(parsed.data)
      bump()
      setFeedback({ kind: 'ok', text: '存档已导入，数据已恢复' })
    })
  }

  const timeLabel = timeSource
    ? timeSource.source === 'network'
      ? '网络时间 ✓'
      : '设备时间（未验证）'
    : '解析中…'

  return (
    <main style={panel}>
      <h1 style={{ marginTop: 0, fontSize: 20 }}>地球online玩家控制台</h1>

      <PetCard refreshKey={refresh} onChanged={bump} />

      <ScalePanel
        scale={scale}
        petBreed={pet?.breed ?? null}
        petName={pet?.name ?? null}
        identity={identity}
        vision={vision}
      />

      {businessDate && <HeatmapPanel checkins={checkins} today={businessDate} />}

      {/* UX-9：调试信息（时间校准/今天）移入默认折叠的设置区，用户语言化（P1-7） */}
      <details
        style={{ borderBottom: '1px solid #2c2c4a', paddingBottom: 10, marginBottom: 18 }}
      >
        <summary style={{ fontSize: 13, color: '#8b8ba3', cursor: 'pointer', userSelect: 'none' }}>
          设置（作息 · 宠物提醒 · 身份）
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
            <span style={smallLabel}>时间校准</span>
            <span style={{ fontSize: 13 }}>{timeLabel}</span>
          </div>
          <div style={row}>
            <span style={smallLabel}>今天</span>
            <span style={{ fontSize: 13 }}>
              {businessDate ? `（按网络时间）${formatBusinessDateReadable(businessDate)}` : '解析中…'}
            </span>
          </div>
          {/* R10b-5：音效开关（游戏化薄层，默认开） */}
          <div style={row}>
            <span style={smallLabel}>音效</span>
            <button
              type="button"
              onClick={onToggleSound}
              style={{ background: soundOn ? '#153a2c' : '#1b1b33', color: soundOn ? '#7ee0a8' : '#e5e5f0', border: `1px solid ${soundOn ? '#2c8a5a' : '#2c2c4a'}`, borderRadius: 6, padding: '4px 10px', fontSize: 13 }}
            >
              {soundOn ? '已开启' : '已关闭'}
            </button>
            <span style={{ fontSize: 11, color: '#5a5a74' }}>打卡时有提示音</span>
          </div>
          <div style={{ borderTop: '1px solid #2c2c4a', marginTop: 8, paddingTop: 8 }}>
            {!editProfileOpen ? (
              <button
                type="button"
                onClick={openEditProfile}
                style={{ background: '#1b1b33', color: '#e5e5f0', border: '1px solid #2c2c4a', borderRadius: 6, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}
              >
                编辑身份宣言 / 年度目标
              </button>
            ) : (
              <div>
                <div style={{ fontSize: 13, color: '#8b8ba3', marginBottom: 4 }}>身份宣言（我是…）</div>
                <input
                  type="text"
                  maxLength={40}
                  value={editIdentity}
                  onChange={(e) => setEditIdentity(e.target.value)}
                  placeholder="如：健康的人"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, border: '1px solid #2c2c4a', background: '#1b1b33', color: '#e5e5f0', fontSize: 14 }}
                />
                <div style={{ fontSize: 13, color: '#8b8ba3', marginBottom: 4, marginTop: 8 }}>年度主线（今年最想完成的一件事）</div>
                <input
                  type="text"
                  maxLength={100}
                  value={editGoal}
                  onChange={(e) => setEditGoal(e.target.value)}
                  placeholder="如：把身体练回二十岁的样子"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, border: '1px solid #2c2c4a', background: '#1b1b33', color: '#e5e5f0', fontSize: 14 }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={onSaveProfile}
                    style={{ flex: 1, padding: '8px 0', borderRadius: 6, border: 'none', background: '#7c5cff', color: '#fff', fontSize: 13, cursor: 'pointer' }}
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditProfileOpen(false)}
                    style={{ flex: 1, padding: '8px 0', borderRadius: 6, border: '1px solid #2c2c4a', background: '#1b1b33', color: '#e5e5f0', fontSize: 13, cursor: 'pointer' }}
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
          {/* R10b-5：数据导出/导入 + 诚实告知（本地存储） */}
          <div style={{ borderTop: '1px solid #2c2c4a', marginTop: 8, paddingTop: 8 }}>
            <div style={{ fontSize: 13, color: '#8b8ba3', marginBottom: 4 }}>数据</div>
            <div style={{ fontSize: 12, color: '#5a5a74', marginBottom: 8, lineHeight: 1.7 }}>
              你的数据保存在本机浏览器（localStorage），导出一份存档即可备份或迁移到其他设备。
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={onExportData}
                style={{ flex: 1, padding: '8px 0', borderRadius: 6, border: '1px solid #2c2c4a', background: '#1b1b33', color: '#e5e5f0', fontSize: 13, cursor: 'pointer' }}
              >
                导出存档
              </button>
              <label
                style={{ flex: 1, textAlign: 'center', padding: '8px 0', borderRadius: 6, border: '1px solid #2c8a5a', background: '#153a2c', color: '#7ee0a8', fontSize: 13, cursor: 'pointer' }}
              >
                导入存档
                <input
                  type="file"
                  accept="application/json,.json"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) onImportData(file)
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
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
        // 初次（无任何习惯）：建第一个习惯
        <CreateHabitForm
          businessDate={businessDate}
          onSubmit={onCreate}
          initialName={badHabitDesc ?? undefined}
          initialDirection={badHabitDesc ? 'negative' : undefined}
        />
      ) : (
        <>
          {/* 工单 13：一年之约——把等差数列的复利力量可视化（主线习惯区上方） */}
          <AnnualGoalPanel habit={habit} businessDate={businessDate} />

          {/* R10b-4：「我的故事」入口——打卡语可回看（历史只读，当天可编辑/删除） */}
          <button
            type="button"
            onClick={() => setStoryOpen(true)}
            style={{
              width: '100%',
              marginBottom: 16,
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px dashed #2c2c4a',
              background: 'transparent',
              color: '#8b8ba3',
              fontSize: 13,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            📖 我的故事 · 回看你的行动日记
          </button>

          <HabitPanel
            habit={habit}
            plan={plan}
            todayChecked={todayChecked}
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
            onQuickCheckin={onQuickCheckin}
            onMinimalCheckin={onMinimalCheckin}
            onQuitMaintain={onQuitMaintain}
            onRestDay={onRestDay}
            onLockCap={onLockCap}
            onRename={onRename}
            onDelete={onDelete}
          />

          {/* 工单 14：支线习惯（最多 2 个）——折叠卡片，各自动态调节 + 打卡 */}
          {sideHabits.map((side) => (
            <SideHabitCard
              key={side.id}
              habit={side}
              businessDate={businessDate}
              schedule={schedule}
              now={timeSource!.now}
              onChanged={bump}
            />
          ))}

          {/* 工单 14：再加一个习惯（容量内入口；满 3 隐藏） */}
          {addingHabit ? (
            <div style={{ marginTop: 16 }}>
              <CreateHabitForm businessDate={businessDate} onSubmit={onCreate} />
              <button
                type="button"
                onClick={() => setAddingHabit(false)}
                style={{ marginTop: 8, color: '#8b8ba3', background: 'transparent', border: 'none', fontSize: 13, cursor: 'pointer' }}
              >
                取消添加
              </button>
            </div>
          ) : sideHabits.length < MAX_HABITS - 1 ? (
            <button
              type="button"
              onClick={() => setAddingHabit(true)}
              style={{
                width: '100%',
                marginTop: 16,
                padding: '12px 0',
                borderRadius: 8,
                border: '1px dashed #2c2c4a',
                background: 'transparent',
                color: '#8b8ba3',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              ＋ 再加一个习惯（最多 {MAX_HABITS} 个）
            </button>
          ) : null}
        </>
      )}

      {/* 底部固定「一键打卡」（工单 06）：一天只需要点一下；超额仍走卡片内快捷按钮
          P1-5：戒除归 0 完成态下禁用，文案改为完成提示 */}
      {habit && plan && (
        <button
          type="button"
          onClick={onOneTap}
          disabled={todayChecked || zeroTarget}
          style={{
            position: 'fixed',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'min(calc(100% - 32px), 448px)',
            padding: '14px 0',
            borderRadius: 999,
            border: 'none',
            background: todayChecked || zeroTarget ? '#2c2c4a' : '#7c5cff',
            color: todayChecked || zeroTarget ? '#8b8ba3' : '#fff',
            fontSize: 17,
            fontWeight: 700,
            cursor: todayChecked || zeroTarget ? 'default' : 'pointer',
            boxShadow: todayChecked || zeroTarget ? 'none' : '0 6px 20px rgba(124,92,255,0.35)',
            zIndex: 10,
          }}
        >
          {zeroTarget ? (todayChecked ? '今日已坚持 ✓' : '继续坚持（今天也没做它）') : todayChecked ? '今日已完成 ✓' : '一键打卡（达标）'}
        </button>
      )}

      {/* R10b-4：「我的故事」全屏时间线 */}
      {storyOpen && businessDate && (
        <StoryPanel
          businessDate={businessDate}
          onChanged={bump}
          onClose={() => setStoryOpen(false)}
        />
      )}

      {/* R12（工单 19）：成就墙——诚实基于真实数据，默认折叠不打断 */}
      {achievements.length > 0 && <AchievementPanel achievements={achievements} />}

      {/* R12（工单 19）ACH-3：打卡庆祝反馈（达标/储蓄/养成），1 秒自动消退 */}
      {celebration && (
        <div
          className="celebration-toast"
          style={{
            position: 'fixed',
            top: 18,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 20,
            padding: '8px 22px',
            borderRadius: 999,
            fontSize: 15,
            fontWeight: 700,
            pointerEvents: 'none',
            color: celebration.kind === 'extra' ? '#d9b64a' : celebration.kind === 'formed' ? '#7c5cff' : '#7ee0a8',
            background: 'rgba(20,20,40,0.92)',
            border: `1px solid ${celebration.kind === 'extra' ? '#d9b64a' : celebration.kind === 'formed' ? '#7c5cff' : '#2c8a5a'}`,
            boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
            animation: 'celebrationPop 1s ease-out forwards',
          }}
        >
          {celebration.text}
        </div>
      )}
    </main>
  )
}

interface HabitPanelProps {
  habit: HabitState
  plan: ReturnType<typeof planToday>
  /** P1-4：今日已打卡（或休息）→ 卡片内全部打卡入口置灰，与底部一键按钮状态一致 */
  todayChecked: boolean
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
  /** 快捷打卡（UX-16/20）：「刚好达标 / 多做了 N」点击即直接打卡 */
  onQuickCheckin(amount: number): void
  onMinimalCheckin(): void
  /** P1-1：戒除完成态「继续坚持」——记录今天也没做 X，保持 0 目标态 */
  onQuitMaintain(): void
  onRestDay(): void
  onLockCap(): void
  onRename(): void
  onDelete(): void
}

function HabitPanel(props: HabitPanelProps) {
  const { habit, plan } = props
  const annualGoal = props.annualGoal?.trim()
  /** UX-7：戒除类习惯目标触底 0 → 完成态 */
  const zeroTarget = plan.target === 0 && habit.direction === 'negative'
  /** UX-13：超额概念对戒除习惯无意义——只保留「刚好达标」快捷打卡 */
  const quickExtras = habit.direction === 'positive' ? [0, 1, 2, 5] : [0]
  /** P1-4：今日已完成 → 全部打卡入口置灰 */
  const done = props.todayChecked

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <h2 style={{ margin: 0, fontSize: 17 }}>{habit.name}</h2>
        <span style={{ fontSize: 12, color: '#8b8ba3', border: '1px solid #2c2c4a', borderRadius: 999, padding: '2px 10px' }}>
          {habitBadgeLabel(habit.direction, plan.locked)}
        </span>
      </div>
      <p style={{ color: '#8b8ba3', fontSize: 12, marginTop: 0 }}>
        总量 {habit.totalAmount} · 达标次数 {habit.consistencyDays} 天 · 休息券 {habit.vacationCoins} 张
        {habit.isFormed && <span style={{ color: '#7c5cff' }}> · 已养成 ✓</span>}
      </p>

      {annualGoal && (
        <p style={{ color: '#7ee0a8', fontSize: 12, marginTop: 0, marginBottom: 10 }}>
          🔗 年度主线：{annualGoal}
        </p>
      )}

      <div style={{ background: '#1b1b33', borderRadius: 10, padding: 16, textAlign: 'center', marginBottom: 16 }}>
        {zeroTarget ? (
          <div style={{ fontSize: 14, color: '#7ee0a8', lineHeight: 1.6 }}>
            已戒除到 0，恭喜！
            <br />
            <span style={{ fontSize: 12, color: '#8b8ba3' }}>已经迈过最难的坎，守住它</span>
            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                disabled={done}
                onClick={props.onQuitMaintain}
                style={{
                  padding: '8px 18px',
                  borderRadius: 999,
                  border: done ? '1px solid #2c2c4a' : '1px solid #7c5cff',
                  background: done ? '#2c2c4a' : 'rgba(124,92,255,0.15)',
                  color: done ? '#5a5a74' : '#b9a8ff',
                  fontSize: 13,
                  cursor: done ? 'default' : 'pointer',
                }}
              >
                {done ? '今日已坚持 ✓' : '继续坚持（今天也没做它）'}
              </button>
            </div>
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

      {/* R-1：窗口制养成进度（不惩罚：缺勤/超额冻结，不归零）；缺勤归来如实解释 */}
      <div style={{ fontSize: 13, color: '#8b8ba3', marginBottom: 6 }}>
        21 天里已达标 {habit.formationDays}/{FORMED_DAYS} 天
        {!habit.isFormed && '（满 14 天即养成）'}
      </div>
      {plan.backoffDays > 0 && (
        <div style={{ fontSize: 12, color: '#d9b64a', marginBottom: 6 }}>
          缺勤会影响目标回退，但已达标的天数都保留——没关系，继续就是
        </div>
      )}

      {/* R5：年度累计效果（工单 13 起由上方「一年之约」面板呈现年度大数；此处不再重复展示数字） */}

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

      {/* N1：戒除归 0 完成态下隐藏手动打卡区（「刚好达标=置0」与「完成量至少1」自相矛盾；
          手动输 ≥1 又产生「超额 X 中 0 已存为假期币」怪异文案）——只保留底部一键打卡与休息/最低版本 */}
      {!zeroTarget && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 13, color: '#8b8ba3', marginBottom: 4 }}>
            今日完成量
          </label>
          <input
            type="number"
            min={0}
            step={1}
            value={props.amount}
            disabled={done}
            onChange={(e) => props.setAmount(e.target.value)}
            placeholder={`今日目标 ${plan.target}`}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #2c2c4a',
              background: done ? '#1b1b33' : '#1b1b33',
              color: done ? '#5a5a74' : '#e5e5f0',
              fontSize: 16,
              opacity: done ? 0.55 : 1,
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            {quickExtras.map((extra) => (
              <button
                key={extra}
                type="button"
                disabled={done}
                onClick={() => props.onQuickCheckin(plan.target + extra)}
                style={{
                  flex: 1,
                  padding: '6px 0',
                  borderRadius: 6,
                  border: '1px solid #2c2c4a',
                  background: done ? '#2c2c4a' : '#1b1b33',
                  color: done ? '#5a5a74' : extra === 0 ? '#e5e5f0' : '#d9b64a',
                  fontSize: 12,
                  cursor: done ? 'default' : 'pointer',
                }}
              >
                {extra === 0 ? '刚好达标' : `多做了 ${extra}（储蓄）`}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: '#5a5a74', marginTop: 6 }}>
            点「刚好达标」或「多做了 N」会直接打卡；想输入精确值请在框里填。
          </div>
        </div>
      )}

      {!zeroTarget && (
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
      )}

      {props.error && (
        <p role="alert" style={{ color: '#ff7a7a', fontSize: 13 }}>
          {props.error}
        </p>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        {!zeroTarget && (
          <button
            type="button"
            disabled={done}
            onClick={props.onCheckin}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: 8,
              border: 'none',
              background: done ? '#2c2c4a' : '#7c5cff',
              color: done ? '#5a5a74' : '#fff',
              fontSize: 16,
              fontWeight: 600,
              cursor: done ? 'default' : 'pointer',
            }}
          >
            按输入量打卡
          </button>
        )}
        <button
          type="button"
          disabled={done}
          onClick={props.onRestDay}
          title="消耗 1 张休息券，今日不打卡也不缺勤；没有券时点按会提示如何获取"
          style={{
            padding: '12px 14px',
            borderRadius: 8,
            border: '1px solid #2c2c4a',
            background: done ? '#2c2c4a' : '#1b1b33',
            color: done ? '#5a5a74' : '#e5e5f0',
            fontSize: 14,
            cursor: done ? 'default' : 'pointer',
          }}
        >
          休息
        </button>
      </div>
      {/* UX-14：两个「今天不想做」出口的人话区分（P1-2：明示行动率差异，避免「休息券是废币」） */}
      <div style={{ fontSize: 11, color: '#5a5a74', marginTop: 6, lineHeight: 1.7 }}>
        「休息」用 1 张休息券：今天彻底放假，不计入 7 天行动率
        <br />
        「做 1 个就算数」太累时保底：免券，但算作行动日（会拉低你的 7 天行动率）
      </div>

      {/* 最低版本（R4 + UX-12/14 人话化）：状态差保底行动，不丢养成进度（防流失最后一道防线） */}
      <button
        type="button"
        disabled={done}
        onClick={props.onMinimalCheckin}
        title="状态差也没关系：做 1 个也算行动，明天从原目标继续，养成进度不丢"
        style={{
          width: '100%',
          marginTop: 8,
          padding: '10px 0',
          borderRadius: 8,
          border: '1px solid #2c8a5a',
          background: done ? '#2c2c4a' : '#153a2c',
          color: done ? '#5a5a74' : '#7ee0a8',
          fontSize: 13,
          cursor: done ? 'default' : 'pointer',
        }}
      >
        今天太累了？做 1 个就算数（不丢进度）
      </button>

      <div
        style={{
          marginTop: 18,
          paddingTop: 14,
          borderTop: '1px solid #2c2c4a',
        }}
      >
        <div style={{ fontSize: 13, color: '#8b8ba3', marginBottom: 4 }}>
          目标调节：固定后每天不再自动变化，可随时再调
        </div>
        {plan.locked && (
          <div style={{ fontSize: 12, color: '#8b8ba3', marginBottom: 6 }}>
            当前已固定：每天 {habit.cap}
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
            {plan.locked ? '调整' : '固定'}
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

/**
 * 工单 14：支线习惯卡片（折叠）。
 * 薄壳：收到支线习惯 → 自行调 habitFlow 的 planToday / performCheckin，
 * 事件回调 onChanged 通知父组件刷新（升主线 / 刷新汇总口径）。
 * 支线默认隐藏完整控制区（展开可打卡/休息/最低版本/改名/删除），避免一屏过密。
 */
interface SideHabitCardProps {
  habit: HabitState
  businessDate: string
  schedule: WorkSchedule
  /** 与主线同源的时间锚点（timeSource.now），避免支线走设备时钟绕过防作弊/B1 守卫 */
  now: Date
  onChanged(): void
}

/** P2-3：支线习惯的迷你年度投影（一行「一年后约 X」）——复用 engine projectAnnual */
function sideAnnualLine(habit: HabitState, businessDate: string): string {
  try {
    const proj = projectAnnual(habit, businessDate)
    const unit = habit.unit?.trim() || '次'
    if (habit.direction === 'negative') {
      return `戒除中 · 每天少做一点点，一年后约省 ${fmtNum(proj.todayTarget * 365)} ${unit}`
    }
    return `一年后累计约 ${fmtNum(proj.idealAnnual)} ${unit}`
  } catch {
    return ''
  }
}

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return Math.floor(n).toLocaleString('zh-CN')
}

function SideHabitCard({ habit, businessDate, schedule, now, onChanged }: SideHabitCardProps) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [renameInput, setRenameInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  /** 支线当前状态也随父刷新重算（来自 props，无独立业务状态） */
  const plan = planToday(habit, businessDate)
  const todayChecked = habit.lastCheckinDate === businessDate
  const zeroTarget = isZeroTarget(habit, businessDate)
  const quickExtras = habit.direction === 'positive' ? [0, 1, 2, 5] : [0]

  const doCheckin = (action: CheckinAction) => {
    setError(null)
    const outcome = performCheckin({ storage: earthStorage }, habit, now, schedule, action)
    const { result } = outcome
    if (result.status === 'rejected') {
      setError(REJECT_LABEL[result.reason!])
      return
    }
    onChanged()
    if (result.mode === 'minimal') {
      playChime('minimal', isSoundEnabled(earthStorage.getSettings()))
      setFeedback({ kind: 'ok', text: '今天也算行动了 ✓ 不丢进度，明天从原目标继续' })
      return
    }
    playChime(result.warning ? 'extra' : 'achieved', isSoundEnabled(earthStorage.getSettings()))
    setFeedback({
      kind: result.warning ? 'warn' : 'ok',
      text: buildCheckinResultNotice(result),
    })
  }

  const onRest = () => {
    setError(null)
    const outcome = performCheckin({ storage: earthStorage }, habit, now, schedule, {
      amount: 0,
      restDay: true,
    })
    const { result } = outcome
    if (result.status === 'rejected') {
      setError(REJECT_LABEL[result.reason!])
      return
    }
    onChanged()
    playChime('rest', isSoundEnabled(earthStorage.getSettings()))
    setFeedback({ kind: 'ok', text: '今日休息，休息券 -1，明天满血回归' })
  }

  const onRename = () => {
    setError(null)
    const result = renameHabit({ storage: earthStorage }, habit.id, renameInput)
    if (result.error) {
      setError(result.error)
      return
    }
    onChanged()
    setRenameInput('')
    setFeedback({ kind: 'ok', text: `习惯已改名为「${result.habit!.name}」` })
  }

  const onDelete = () => {
    setError(null)
    const confirmed = window.confirm(`确定删除习惯「${habit.name}」吗？历史打卡记录会保留。`)
    if (!confirmed) return
    const result = deleteHabit({ storage: earthStorage }, habit.id)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onChanged()
    setFeedback({ kind: 'ok', text: '支线习惯已删除' })
  }

  return (
    <div
      style={{
        border: '1px solid #2c2c4a',
        borderRadius: 10,
        background: '#181830',
        padding: 14,
        marginTop: 12,
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={{ fontSize: 14, fontWeight: 600 }}>{habit.name}</span>
        <span style={{ fontSize: 12, color: '#8b8ba3' }}>
          {habitBadgeLabel(habit.direction, habit.cap !== null)}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: '#8b8ba3' }}>
          {todayChecked ? '✓ 今日已打卡' : `今日目标 ${plan.target}`}
        </span>
        <span style={{ fontSize: 12, color: '#5a5a74' }}>{open ? '▾' : '▸'}</span>
      </div>

      {open && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: '#8b8ba3', marginBottom: 6 }}>
            总量 {habit.totalAmount} · 达标次数 {habit.consistencyDays} 天 · 休息券 {habit.vacationCoins} 张
            {habit.isFormed && <span style={{ color: '#7c5cff' }}> · 已养成 ✓</span>}
          </div>
          <div style={{ fontSize: 12, color: '#a9a9c4', marginBottom: 8 }}>
            {sideAnnualLine(habit, businessDate)}
          </div>

          {feedback && (
            <p
              role="status"
              style={{
                padding: '8px 10px',
                borderRadius: 8,
                fontSize: 12,
                margin: '0 0 10px',
                background: feedback.kind === 'ok' ? '#153a2c' : '#3a2c15',
                color: feedback.kind === 'ok' ? '#7ee0a8' : '#ffd27a',
              }}
            >
              {feedback.text}
            </p>
          )}
          {error && (
            <p role="alert" style={{ color: '#ff7a7a', fontSize: 12, margin: '0 0 10px' }}>
              {error}
            </p>
          )}

          {!zeroTarget && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                {quickExtras.map((extra) => (
                  <button
                    key={extra}
                    type="button"
                    disabled={todayChecked}
                    onClick={() => doCheckin({ amount: plan.target + extra })}
                    style={{
                      flex: 1,
                      padding: '6px 0',
                      borderRadius: 6,
                      border: '1px solid #2c2c4a',
                      background: todayChecked ? '#2c2c4a' : '#1b1b33',
                      color: todayChecked ? '#5a5a74' : extra === 0 ? '#e5e5f0' : '#d9b64a',
                      fontSize: 12,
                      cursor: todayChecked ? 'default' : 'pointer',
                    }}
                  >
                    {extra === 0 ? '刚好达标' : `多做了 ${extra}（储蓄）`}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={amount}
                  disabled={todayChecked}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={`今日目标 ${plan.target}`}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1px solid #2c2c4a',
                    background: '#1b1b33',
                    color: '#e5e5f0',
                    fontSize: 14,
                  }}
                />
                <button
                  type="button"
                  disabled={todayChecked}
                  onClick={() => doCheckin({ amount: Number(amount) })}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 6,
                    border: 'none',
                    background: todayChecked ? '#2c2c4a' : '#7c5cff',
                    color: todayChecked ? '#5a5a74' : '#fff',
                    fontSize: 13,
                    cursor: todayChecked ? 'default' : 'pointer',
                  }}
                >
                  打卡
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              disabled={todayChecked}
              onClick={() => doCheckin({ amount: 1, mode: 'minimal' })}
              title="状态差也没关系：做 1 个也算行动，明天从原目标继续"
              style={{
                flex: 1,
                padding: '8px 0',
                borderRadius: 6,
                border: '1px solid #2c8a5a',
                background: todayChecked ? '#2c2c4a' : '#153a2c',
                color: todayChecked ? '#5a5a74' : '#7ee0a8',
                fontSize: 12,
                cursor: todayChecked ? 'default' : 'pointer',
              }}
            >
              做 1 个就算数
            </button>
            <button
              type="button"
              disabled={todayChecked}
              onClick={onRest}
              title="消耗 1 张休息券，今日不打卡也不缺勤"
              style={{
                flex: 1,
                padding: '8px 0',
                borderRadius: 6,
                border: '1px solid #2c2c4a',
                background: todayChecked ? '#2c2c4a' : '#1b1b33',
                color: todayChecked ? '#5a5a74' : '#e5e5f0',
                fontSize: 12,
                cursor: todayChecked ? 'default' : 'pointer',
              }}
            >
              休息
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input
              type="text"
              maxLength={40}
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              placeholder={`改名（当前：${habit.name}）`}
              style={{
                flex: 1,
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid #2c2c4a',
                background: '#1b1b33',
                color: '#e5e5f0',
                fontSize: 13,
              }}
            />
            <button
              type="button"
              onClick={onRename}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #2c2c4a',
                background: '#1b1b33',
                color: '#e5e5f0',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              改名
            </button>
            <button
              type="button"
              onClick={onDelete}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #8a2c2c',
                background: '#3a1515',
                color: '#ff9a9a',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              删除
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
