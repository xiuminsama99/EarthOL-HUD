/**
 * 地基状态面板（工单 02 本地版）
 *
 * 展示时间锚点来源（网络/设备）、作息类型切换、当前业务日，
 * 以及数据层 / 登录地基的自检状态。完整产品 UI 由后续工单
 * （引导问卷、宠物、打卡）搭建。
 */
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { authProvider } from './auth/authProvider'
import type { WorkSchedule } from './engine/types'
import { earthStorage } from './storage/storage'
import { businessDateFromSource, timeProvider } from './time/timeProvider'
import type { TimeSource } from './time/timeProvider'

const SCHEDULE_LABEL: Record<WorkSchedule, string> = {
  day: '白天工作',
  night: '夜间工作',
}

const panel: CSSProperties = {
  maxWidth: 480,
  margin: '40px auto',
  padding: 24,
  borderRadius: 12,
  background: '#141428',
  color: '#e5e5f0',
  fontFamily: 'system-ui, sans-serif',
}

const row: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0' }
const label: CSSProperties = { width: 96, color: '#8b8ba3', flexShrink: 0 }

function App() {
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
    const next: WorkSchedule = schedule === 'day' ? 'night' : 'day'
    earthStorage.updateProfile({ schedule: next })
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
    <main style={panel}>
      <h1 style={{ marginTop: 0, fontSize: 20 }}>地球online玩家控制台</h1>
      <p style={{ color: '#8b8ba3', fontSize: 14, marginTop: 0 }}>
        工单 02 地基自检 · 纯前端本地版（BaaS 后置）
      </p>

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
    </main>
  )
}

export default App
