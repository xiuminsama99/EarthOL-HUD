/**
 * 设置折叠区（从 HabitScreen 抽出，R13 P2）。
 * 薄壳：纯展示 + 事件回调。作息切换/提醒/音效/身份编辑/数据导出导入的
 * 状态与编排逻辑仍在 HabitScreen 主壳，本组件只按 props 渲染并触发回调。
 */
import type { CSSProperties } from 'react'
import { row } from '../../components/ui/theme'

const smallLabel: CSSProperties = { width: 96, color: '#8b8ba3', flexShrink: 0, fontSize: 13 }

interface SettingsPanelProps {
  /** 当前作息的中文标签（如「白天工作」） */
  scheduleLabel: string
  onToggleSchedule(): void
  reminderEnabled: boolean
  reminderTime: string
  onToggleReminder(): void
  onReminderTimeChange(value: string): void
  /** 时间校准显示文案（网络时间 / 设备时间 / 解析中…） */
  timeLabel: string
  /** 「今天」显示文案（含网络时间与业务日，或“解析中…”） */
  todayLabel: string
  soundOn: boolean
  onToggleSound(): void
  editProfileOpen: boolean
  editIdentity: string
  editGoal: string
  setEditIdentity(v: string): void
  setEditGoal(v: string): void
  setEditProfileOpen(open: boolean): void
  onOpenEditProfile(): void
  onSaveProfile(): void
  onExportData(): void
  onImportData(file: File): void
}

export function SettingsPanel(props: SettingsPanelProps) {
  const {
    scheduleLabel,
    onToggleSchedule,
    reminderEnabled,
    reminderTime,
    onToggleReminder,
    onReminderTimeChange,
    timeLabel,
    todayLabel,
    soundOn,
    onToggleSound,
    editProfileOpen,
    editIdentity,
    editGoal,
    setEditIdentity,
    setEditGoal,
    setEditProfileOpen,
    onOpenEditProfile,
    onSaveProfile,
    onExportData,
    onImportData,
  } = props

  return (
    // UX-9：调试信息（时间校准/今天）移入默认折叠的设置区，用户语言化（P1-7）
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
            onClick={onToggleSchedule}
            style={{ background: '#1b1b33', color: '#e5e5f0', border: '1px solid #2c2c4a', borderRadius: 6, padding: '4px 10px', fontSize: 13 }}
          >
            {scheduleLabel}
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
          <span style={{ fontSize: 13 }}>{todayLabel}</span>
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
              onClick={onOpenEditProfile}
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
  )
}
