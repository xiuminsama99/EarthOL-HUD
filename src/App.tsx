/**
 * 应用入口（工单 03 路由化）
 *
 * 按玩家档案状态路由：未完成引导 → OnboardingScreen（角色设定）；
 * 已完成引导（老用户）→ HabitScreen 主界面。
 * 工单 02 的地基自检面板保留为折叠入口，供排查时间/数据/登录状态。
 */
import { useState } from 'react'
import HabitScreen from './features/habit/HabitScreen'
import OnboardingScreen from './features/onboarding/OnboardingScreen'
import { isOnboarded } from './features/onboarding/onboardingFlow'
import FoundationPanel from './FoundationPanel'
import { earthStorage } from './storage/storage'

function App() {
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [onboarded, setOnboarded] = useState(() => isOnboarded(earthStorage.getProfile()))

  if (!onboarded) {
    return (
      <OnboardingScreen
        onCompleted={() => setOnboarded(true)}
      />
    )
  }

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
