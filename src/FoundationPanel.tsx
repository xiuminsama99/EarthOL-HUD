/**
 * 地基自检面板（工单 02 本地版，诊断用）
 *
 * 展示时间锚点来源（网络/设备）、作息类型切换、当前业务日，
 * 以及数据层 / 登录地基的自检状态。完整产品 UI 见 HabitScreen。
 */
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { authProvider } from './auth/authProvider'
import { row } from './components/ui/theme'
import type { WorkSchedule } from './engine/types'
import { earthStorage } from './storage/storage'
import { switchSchedule } from './features/habit/habitFlow'
import { businessDateFromSource, timeProvider } from './time/timeProvider'
import type { TimeSource } from './time/timeProvider'

const SCHEDULE_LABEL: Record<WorkSchedule, string> = {
  day: '白天工作',
  night: '夜间工作',
}

const box: CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  background: '#141428',
  color: '#e5e5f0',
  fontFamily: 'system-ui, sans-serif',
  fontSize: 13,
}

const label: CSSProperties = { width: 72, color: '#8b8ba3', flexShrink: 0 }

function FoundationPanel() {
  const [timeSource, setTimeSource] = useState<TimeSource | null>(null)
  const [schedule, setSchedule] = useState<WorkSchedule>(
    () => earthStorage.getProfile()?.schedule ?? 'day',
  )
  const [playerId, setPlayerId] = useState<string | null>(
    () => authProvider.getSession().playerId,
  )
  const habitCount = earthStorage.listHabits().length

  useEffect(() => {
    void timeProvider.getNow().then(setTimeSource)
  }, [])

  const businessDate = useMemo(
    () => (timeSource ? businessDateFromSource(timeSource, schedule) : '解析中…'),
    [timeSource, schedule],
  )

  const toggleSchedule = () => {
    // N3：与主界面一致——窗口确认 + 记录切换时刻（写入 lastScheduleSwitchAt，B1 守卫生效），
    // 避免诊断面板绕过守卫导致「切昼夜刷卡」
    const confirmed = window.confirm('切换作息后今天不能再打卡，确定吗？')
    if (!confirmed) return
    const { next } = switchSchedule({ storage: earthStorage }, schedule)
    setSchedule(next)
  }

  const signIn = async () => {
    const session = await authProvider.signIn()
    setPlayerId(session.playerId)
  }

  const timeLabel = timeSource
    ? timeSource.source === 'network'
      ? `网络 ✓ (${timeSource.endpoint})`
      : '设备（未验证）'
    : '解析中…'

  return (
    <div style={box}>
      <div style={row}>
        <span style={label}>时间源</span>
        <span>{timeLabel}</span>
      </div>
      <div style={row}>
        <span style={label}>业务日</span>
        <span>{businessDate}</span>
      </div>
      <div style={row}>
        <span style={label}>作息</span>
        <button type="button" onClick={toggleSchedule}>
          {SCHEDULE_LABEL[schedule]}
        </button>
      </div>
      <div style={row}>
        <span style={label}>玩家</span>
        {playerId ? (
          <span>本地档案 {playerId.slice(0, 8)}…</span>
        ) : (
          <button type="button" onClick={signIn}>
            创建本地档案
          </button>
        )}
      </div>
      <div style={row}>
        <span style={label}>习惯数</span>
        <span>{habitCount}</span>
      </div>
    </div>
  )
}

export default FoundationPanel
