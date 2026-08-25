/**
 * 应用入口（工单 03 路由化，工单 04 增加领养环节）
 *
 * 按玩家档案状态路由：
 * 1. 未完成引导 → OnboardingScreen（角色设定：身份宣言 / 正反愿景）
 * 2. 已引导但未领养宠物 → AdoptPetScreen（情感锚点）
 * 3. 已领养 → HabitScreen 主界面
 * 工单 02 的地基自检面板保留为折叠入口，供排查时间/数据/登录状态。
 */
import { useState } from 'react'
import HabitScreen from './features/habit/HabitScreen'
import OnboardingScreen from './features/onboarding/OnboardingScreen'
import AdoptPetScreen from './features/pet/AdoptPetScreen'
import { isOnboarded } from './features/onboarding/onboardingFlow'
import { hasPet } from './features/pet/petFlow'
import FoundationPanel from './FoundationPanel'
import { earthStorage } from './storage/storage'

function App() {
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [onboarded, setOnboarded] = useState(() => isOnboarded(earthStorage.getProfile()))
  const [pet, setPet] = useState(() => hasPet({ storage: earthStorage }))

  if (!onboarded) {
    return (
      <OnboardingScreen
        onCompleted={() => setOnboarded(true)}
      />
    )
  }

  if (!pet) {
    return (
      <AdoptPetScreen
        onAdopted={() => setPet(true)}
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
