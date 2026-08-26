/**
 * 「我的故事」时间线面板（工单 16 R10b-4 B）
 *
 * 薄壳组件：数据来自 storyFlow 聚合，本组件只做渲染与触发编辑/删除。
 * 主界面打卡语区提供入口 → 全屏覆盖层展示时间线；
 * 当天条可编辑 note / 删除，历史只读（守卫在 storyFlow）。
 */
import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { earthStorage } from '../../storage/storage'
import {
  buildStoryTimeline,
  editTodayNote,
  deleteTodayCheckin,
  buildMonthlySummary,
  STORY_STATUS_COLOR,
} from './storyFlow'
import type { StoryStatus } from './storyFlow'

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 50,
  background: 'rgba(8,8,18,0.92)',
  overflowY: 'auto',
  padding: '24px 0 60px',
}

const sheet: CSSProperties = {
  maxWidth: 480,
  margin: '0 auto',
  padding: '0 24px',
}

const STATUS_LABEL: Record<StoryStatus, string> = {
  '达标': '达标',
  '未达标': '未达标',
  '超额': '超额',
  '休息': '休息',
  '最低版本': '最低版本',
  '戒除坚持': '戒除坚持',
}

interface StoryPanelProps {
  businessDate: string
  onChanged(): void
  onClose(): void
}

export function StoryPanel({ businessDate, onChanged, onClose }: StoryPanelProps) {
  const [editId, setEditId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const habitName = useMemo(() => {
    const map = new Map<string, string>()
    for (const h of earthStorage.listHabits()) map.set(h.id, h.name)
    return (habitId: string) => map.get(habitId) ?? '（已删除习惯）'
  }, [])

  const timeline = useMemo(
    () => buildStoryTimeline(earthStorage.listCheckins(), habitName),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 打开面板时读取一次即可
    [habitName],
  )

  /** P2-1：本月统计卡 */
  const monthly = useMemo(() => buildMonthlySummary(earthStorage.listCheckins(), businessDate), [businessDate])

  const beginEdit = (id: string, note: string) => {
    setEditId(id)
    setDraft(note)
    setError(null)
  }

  const saveEdit = (id: string) => {
    setError(null)
    const r = editTodayNote({ storage: earthStorage }, id, businessDate, draft)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setEditId(null)
    onChanged()
  }

  const onDelete = (id: string) => {
    setError(null)
    const confirmed = window.confirm(
      '删除这条今天的记录？打卡状态将一并撤销，可以重新打卡。',
    )
    if (!confirmed) return
    const r = deleteTodayCheckin({ storage: earthStorage }, id, businessDate)
    if (!r.ok) {
      setError(r.error)
      return
    }
    onChanged()
  }

  return (
    <div style={overlay} role="dialog" aria-label="我的故事">
      <div style={sheet}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 4,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 19 }}>📖 我的故事</h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid #2c2c4a',
              background: '#1b1b33',
              color: '#e5e5f0',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            关闭
          </button>
        </div>
        <p style={{ fontSize: 12, color: '#8b8ba3', marginTop: 0 }}>
          你以身份行动的日子，一页一页都在这里
        </p>

        {/* 顶部统计 */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginBottom: 16,
            flexWrap: 'wrap',
          }}
        >
          <Stat label="行动天数" value={timeline.totalDays} />
          <Stat label="打卡次数" value={timeline.totalCheckins} />
          <Stat label="休息券使用" value={timeline.restUses} />
        </div>

        {/* P2-1：本月统计卡 */}
        {monthly && (
          <div
            style={{
              marginBottom: 16,
              padding: '10px 12px',
              borderRadius: 8,
              background: 'linear-gradient(135deg, #1b1b33 0%, #241a3e 100%)',
              border: '1px solid #2c2c4a',
            }}
          >
            <div style={{ fontSize: 13, color: '#7ee0a8', fontWeight: 600, marginBottom: 6 }}>
              📅 本月小结（{formatMonth(monthly.month)}）
            </div>
            <div style={{ fontSize: 12, color: '#a9a9c4', lineHeight: 1.7 }}>
              行动 {monthly.actionDays} 天 · 打卡 {monthly.checkins} 次 · 总量 {monthly.totalAmount}
              {monthly.actionRate !== null ? ` · 行动率 ${monthly.actionRate}%` : ''}
              {monthly.restUses > 0 ? ` · 休息 ${monthly.restUses} 天` : ''}
            </div>
          </div>
        )}

        {error && (
          <p role="alert" style={{ color: '#ff9a9a', fontSize: 13, margin: '0 0 12px' }}>
            {error}
          </p>
        )}

        {timeline.days.length === 0 ? (
          <div style={{ fontSize: 14, color: '#8b8ba3', textAlign: 'center', padding: '40px 0' }}>
            还没有行动记录，从今天开始写你的故事吧
          </div>
        ) : (
          timeline.days.map((day) => (
            <div key={day.businessDate} style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 13,
                  color: '#8b8ba3',
                  paddingBottom: 4,
                  borderBottom: '1px solid #2c2c4a',
                  marginBottom: 8,
                }}
              >
                {formatDate(day.businessDate)}
                {day.businessDate === businessDate && ' · 今天'}
              </div>
              {day.entries.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    borderLeft: `3px solid ${STORY_STATUS_COLOR[entry.status]}`,
                    padding: '8px 12px',
                    marginBottom: 8,
                    background: '#181830',
                    borderRadius: '0 8px 8px 0',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 12,
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ color: STORY_STATUS_COLOR[entry.status], fontWeight: 600 }}>
                      {STATUS_LABEL[entry.status]}
                    </span>
                    <span style={{ color: '#a9a9c4' }}>{entry.habitName}</span>
                    {entry.restDay && <span style={{ color: '#8b8ba3' }}>{entry.amount}（休息）</span>}
                    {!entry.restDay && (
                      <span style={{ color: '#8b8ba3' }}>
                        {entry.amount} / {entry.targetAmount}
                      </span>
                    )}
                    {entry.businessDate === businessDate && (
                      <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          onClick={() =>
                            editId === entry.id
                              ? saveEdit(entry.id)
                              : beginEdit(entry.id, entry.note)
                          }
                          style={smallBtn}
                        >
                          {editId === entry.id ? '保存' : '编辑'}
                        </button>
                        {editId !== entry.id && (
                          <button type="button" onClick={() => onDelete(entry.id)} style={delBtn}>
                            删除
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                  {entry.businessDate === businessDate && editId === entry.id ? (
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={2}
                      maxLength={200}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '8px 10px',
                        borderRadius: 6,
                        border: '1px solid #2c2c4a',
                        background: '#1b1b33',
                        color: '#e5e5f0',
                        fontSize: 13,
                        resize: 'vertical',
                        fontFamily: 'inherit',
                      }}
                    />
                  ) : (
                    <div style={{ fontSize: 13, color: '#e5e5f0', lineHeight: 1.6 }}>
                      {entry.note}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

const smallBtn: CSSProperties = {
  padding: '2px 8px',
  borderRadius: 6,
  border: '1px solid #2c2c4a',
  background: '#1b1b33',
  color: '#8b8ba3',
  fontSize: 11,
  cursor: 'pointer',
}

const delBtn: CSSProperties = {
  ...smallBtn,
  border: '1px solid #8a2c2c',
  color: '#ff9a9a',
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 90,
        background: '#1b1b33',
        borderRadius: 8,
        padding: '10px 12px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 700, color: '#7ee0a8' }}>{value}</div>
      <div style={{ fontSize: 11, color: '#8b8ba3' }}>{label}</div>
    </div>
  )
}

/** 业务日 YYYY-MM-DD → 「M 月 D 日 周X」（本地解析，仅展示） */
function formatDate(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  const labels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const weekday = new Date(Date.UTC(Number(date.split('-')[0]), m - 1, d)).getUTCDay()
  return `${m} 月 ${d} 日 ${labels[weekday]}`
}

/** 月份 YYYY-MM → 「M 月」（P2-1） */
function formatMonth(month: string): string {
  const [, m] = month.split('-').map(Number)
  return `${m} 月`
}
