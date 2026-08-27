/**
 * 打卡庆祝反馈 toast（从 HabitScreen 抽出，R13 P2）。
 * 薄壳：纯展示。1 秒自动消退的定时器逻辑仍在 HabitScreen 主壳。
 */
export interface Celebration {
  text: string
  kind: 'ok' | 'extra' | 'formed'
}

interface CelebrationToastProps {
  celebration: Celebration
}

export function CelebrationToast(props: CelebrationToastProps) {
  const { celebration } = props
  // R12（工单 19）ACH-3：打卡庆祝反馈（达标/储蓄/养成），2 秒自动消退（R14 由 1s 延至 2s）
  return (
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
        animation: 'celebrationPop 2s ease-out forwards',
      }}
    >
      {celebration.text}
    </div>
  )
}
