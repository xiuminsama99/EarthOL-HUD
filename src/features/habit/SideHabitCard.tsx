/**
 * 支线习惯卡片（折叠，从 HabitScreen 抽出，R13 P1）。
 * 薄壳：收到支线习惯 → 自行调 habitFlow 的 planToday / performCheckin，
 * 事件回调 onChanged 通知父组件刷新（升主线 / 刷新汇总口径）。
 * 支线默认隐藏完整控制区（展开可打卡/休息/最低版本/改名/删除）。
 */
import { useState } from 'react'
import type { HabitState, WorkSchedule } from '../../engine/types'
import { projectAnnual } from '../../engine/engine'
import { earthStorage } from '../../storage/storage'
import { playChime, isSoundEnabled } from '../../util/playChime'
import {
  planToday,
  performCheckin,
  renameHabit,
  deleteHabit,
  buildCheckinResultNotice,
  habitBadgeLabel,
  isZeroTarget,
} from './habitFlow'
import type { CheckinAction } from './habitFlow'
import { REJECT_LABEL } from './habitShared'
import type { Feedback } from './habitShared'
import { ErrorText } from '../../components/ui/ErrorText'
import { FeedbackBanner } from '../../components/ui/FeedbackBanner'
import { Collapsible } from '../../components/ui/Collapsible'

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

export function SideHabitCard({ habit, businessDate, schedule, now, onChanged }: SideHabitCardProps) {
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
      <Collapsible
        open={open}
        onToggle={() => setOpen((v) => !v)}
        contentStyle={{ marginTop: 12 }}
        trigger={({ 'aria-expanded': ariaExpanded, role, tabIndex, onKeyDown, toggle }) => (
          <div
            role={role}
            tabIndex={tabIndex}
            aria-expanded={ariaExpanded}
            onKeyDown={onKeyDown}
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
            onClick={toggle}
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
        )}
      >
          <div style={{ fontSize: 12, color: '#8b8ba3', marginBottom: 6 }}>
            总量 {habit.totalAmount} · 达标次数 {habit.consistencyDays} 天 · 休息券 {habit.vacationCoins} 张
            {habit.isFormed && <span style={{ color: '#7c5cff' }}> · 已养成 ✓</span>}
          </div>
          <div style={{ fontSize: 12, color: '#a9a9c4', marginBottom: 8 }}>
            {sideAnnualLine(habit, businessDate)}
          </div>

          {feedback && (
            <FeedbackBanner compact ok={feedback.kind === 'ok'}>{feedback.text}</FeedbackBanner>
          )}
          {error && (
            <ErrorText fontSize={12} style={{ margin: '0 0 10px' }}>{error}</ErrorText>
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
      </Collapsible>
    </div>
  )
}
