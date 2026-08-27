/**
 * 打卡主界面（工单 05）
 *
 * 薄壳组件：数据流 = timeProvider 取网络时间 → businessDateFromSource 定业务日
 * → habitFlow 调引擎判定 + 持久化 → 重新读取渲染。领域规则零散落在引擎。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { HabitState, WorkSchedule } from '../../engine/types'
import { buildAutoNote, computeAchievements } from '../../engine/engine'
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
  isZeroTarget,
  formatBusinessDateReadable,
  MAX_HABITS,
} from './habitFlow'
import type { TodayPlan } from './habitFlow'
import type { CheckinAction, NewHabitInput } from './habitFlow'
import { CreateHabitForm } from './CreateHabitForm'
import { EmptyState } from '../../components/ui/EmptyState'
import { AnnualGoalPanel } from './AnnualGoalPanel'
import { computeScaleData } from '../scale/scaleFlow'
import { ScalePanel } from '../scale/ScalePanel'
import { HeatmapPanel } from '../heatmap/HeatmapPanel'
import { panelScreen as panel } from '../../components/ui/theme'
import { updateIdentityAndGoal } from '../onboarding/onboardingFlow'
import { HabitPanel } from './HabitPanel'
import { SideHabitCard } from './SideHabitCard'
import { REJECT_LABEL } from './habitShared'
import type { Feedback } from './habitShared'
import { SettingsPanel } from './SettingsPanel'
import { OneTapButton } from './OneTapButton'
import { CelebrationToast } from './CelebrationToast'
import type { Celebration } from './CelebrationToast'

const SCHEDULE_LABEL: Record<WorkSchedule, string> = {
  day: '白天工作',
  night: '夜间工作',
}

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
  const [celebration, setCelebration] = useState<Celebration | null>(null)

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

      <SettingsPanel
        scheduleLabel={SCHEDULE_LABEL[schedule]}
        onToggleSchedule={toggleSchedule}
        reminderEnabled={reminderEnabled}
        reminderTime={reminderTime}
        onToggleReminder={onToggleReminder}
        onReminderTimeChange={onReminderTimeChange}
        timeLabel={timeLabel}
        todayLabel={businessDate ? `（按网络时间）${formatBusinessDateReadable(businessDate)}` : '解析中…'}
        soundOn={soundOn}
        onToggleSound={onToggleSound}
        editProfileOpen={editProfileOpen}
        editIdentity={editIdentity}
        editGoal={editGoal}
        setEditIdentity={setEditIdentity}
        setEditGoal={setEditGoal}
        setEditProfileOpen={setEditProfileOpen}
        onOpenEditProfile={openEditProfile}
        onSaveProfile={onSaveProfile}
        onExportData={onExportData}
        onImportData={onImportData}
      />

      {!businessDate ? (
        <EmptyState>解析时间中…</EmptyState>
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
        <OneTapButton
          onOneTap={onOneTap}
          todayChecked={todayChecked}
          zeroTarget={zeroTarget}
        />
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
      {celebration && <CelebrationToast celebration={celebration} />}
    </main>
  )
}

export default HabitScreen
