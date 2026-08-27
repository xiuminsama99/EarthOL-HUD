/**
 * 底部固定「一键打卡」按钮（从 HabitScreen 抽出，R13 P2）。
 * 薄壳：纯展示 + 事件回调。onOneTap 编排逻辑仍在 HabitScreen 主壳。
 * 仅当 habit && plan 存在时由父层渲染本组件。
 */
interface OneTapButtonProps {
  onOneTap(): void
  todayChecked: boolean
  /** P1-5：戒除归 0 完成态 → 禁用，文案改为完成提示 */
  zeroTarget: boolean
}

export function OneTapButton(props: OneTapButtonProps) {
  const { onOneTap, todayChecked, zeroTarget } = props
  return (
    // 工单 06：一天只需要点一下；超额仍走卡片内快捷按钮
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
      {zeroTarget ? (todayChecked ? '今日已坚持 ✓' : '戒除完成态 · 今天也没做它') : todayChecked ? '今日已完成 ✓' : '一键打卡（达标）'}
    </button>
  )
}
