/**
 * 应用入口（工单 05）
 *
 * 主体：HabitScreen（建习惯 → 打卡主界面）。
 * 工单 02 的地基自检面板保留为折叠入口，供排查时间/数据/登录状态。
 */
import { useState } from 'react'
import HabitScreen from './features/habit/HabitScreen'
import FoundationPanel from './FoundationPanel'

function App() {
  const [showDiagnostics, setShowDiagnostics] = useState(false)

  return (
    <div style={{ paddingBottom: 24 }}>
      <HabitScreen />
      <details
        style={{
          maxWidth: 480,
          margin: '0 auto',
          padding: '0 24px',
          color: '#5a5a74',
          fontSize: 13,
        }}
        open={showDiagnostics}
        onToggle={(e) => setShowDiagnostics(e.currentTarget.open)}
      >
        <summary style={{ cursor: 'pointer', userSelect: 'none' }}>地基自检面板（工单 02，诊断用）</summary>
        <div style={{ marginTop: 8 }}>
          <FoundationPanel />
        </div>
      </details>
    </div>
  )
}

export default App
