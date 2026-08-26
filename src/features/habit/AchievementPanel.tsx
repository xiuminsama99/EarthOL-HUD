/**
 * 成就墙（R12 工单 19 P0）
 *
 * 游戏化薄层：展示全部成就（达成亮起 / 未达成暗色+暗示）。
 * 诚实原则：只基于真实发生过的事——引擎 computeAchievements 保证不造假。
 * 默认折叠（不喧宾夺主），遵循「零输入」——不弹窗、不打断。
 */
import type { Achievement } from '../../engine/types'

interface AchievementPanelProps {
  achievements: Achievement[]
}

export function AchievementPanel({ achievements }: AchievementPanelProps) {
  const earnedCount = achievements.filter((a) => a.earnedAt).length

  return (
    <details
      style={{ marginBottom: 16, padding: '10px 12px', borderBottom: '1px solid #2c2c4a', borderRadius: 8, background: 'rgba(28,28,52,0.6)' }}
    >
      <summary style={{ fontSize: 13, color: '#8b8ba3', cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
        🏅 成就墙
        <span style={{ fontSize: 12, color: '#7ee0a8' }}>{earnedCount}/{achievements.length} 已解锁</span>
      </summary>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: 8,
          marginTop: 10,
        }}
      >
        {achievements.map((a) => {
          const earned = Boolean(a.earnedAt)
          return (
            <div
              key={a.id}
              style={{
                borderRadius: 8,
                padding: '8px 10px',
                background: earned ? 'rgba(28,42,58,0.9)' : 'rgba(28,28,48,0.5)',
                border: `1px solid ${earned ? '#2c8a5a' : '#2c2c4a'}`,
                opacity: earned ? 1 : 0.55,
              }}
            >
              <div style={{ fontSize: 16, marginBottom: 2 }}>
                {a.icon} {earned ? a.title : <span style={{ color: '#5a5a74' }}>？？？</span>}
              </div>
              <div style={{ fontSize: 11, color: earned ? '#b9d8c0' : '#8b8ba3', lineHeight: 1.5 }}>
                {earned ? a.desc : a.hint}
              </div>
              {earned && (
                <div style={{ fontSize: 10, color: '#5a5a74', marginTop: 3 }}>
                  {a.earnedAt} 解锁
                </div>
              )}
            </div>
          )
        })}
      </div>
    </details>
  )
}
