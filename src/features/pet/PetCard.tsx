/**
 * 主界面宠物卡（工单 04，R10b-4 情感化）
 *
 * 展示在打卡主界面顶部：宠物形象 + 名字 + 心情条与文案 + 摸摸头互动。
 * 数据来自 storage，refreshKey 变化时重读（打卡联动心情后刷新）。
 * R10b-4：
 * - 心情文字带名字（低于 40「XX有点想你」）
 * - 「摸摸头」每天一次 +2（同日重复被拒）
 * - 有习惯养成后进入成长形态（PetArt 叠加 ✨）
 * 薄壳组件：情感规则在 petFlow，本组件只编排。
 */
import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { earthStorage } from '../../storage/storage'
import { moodLabel, petPet } from './petFlow'
import { ErrorText } from '../../components/ui/ErrorText'
import { COLORS } from '../../components/ui/theme'
import { PetArt } from './PetArt'

const card: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  background: '#1b1b33',
  borderRadius: 10,
  padding: '12px 14px',
  marginBottom: 16,
}

const artBox: CSSProperties = { width: 64, height: 64, flexShrink: 0, position: 'relative' }

/** 主界面宠物卡；未领养时渲染 null（由 App 路由保证领养后才进主界面） */
export function PetCard({ refreshKey, onChanged }: { refreshKey: number; onChanged?: () => void }) {
  const [petError, setPetError] = useState<string | null>(null)
  const pet = useMemo(
    () => earthStorage.listPets()[0] ?? null,
    [refreshKey], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const formed = useMemo(
    () => earthStorage.listHabits().some((h) => h.isFormed),
    [refreshKey], // eslint-disable-line react-hooks/exhaustive-deps
  )
  if (!pet) return null

  const onPet = () => {
    setPetError(null)
    const today = new Date()
    const businessDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const result = petPet({ storage: earthStorage }, businessDate)
    if (result.error) {
      setPetError(result.error)
    } else {
      onChanged?.()
    }
  }

  return (
    <div style={card}>
      <div style={artBox}>
        <PetArt breed={pet.breed} formed={formed} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>{pet.name}</span>
          <span style={{ fontSize: 12, color: '#8b8ba3' }}>
            {pet.breed === 'cat' ? '猫' : pet.breed === 'dog' ? '狗' : '小恐龙'}
          </span>
        </div>
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              background: '#2c2c4a',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${pet.mood}%`,
                height: '100%',
                borderRadius: 3,
                background: pet.mood >= 50 ? '#7ee0a8' : pet.mood >= 40 ? '#d9b64a' : '#ff8fa3',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
          <span style={{ fontSize: 12, color: '#8b8ba3', flexShrink: 0 }}>
            {moodLabel(pet.mood, pet.name)}
          </span>
        </div>
        {/* R10b-4：摸摸头互动（每天一次） */}
        <button
          type="button"
          onClick={onPet}
          style={{
            marginTop: 6,
            padding: '3px 10px',
            borderRadius: 6,
            border: '1px solid #2c2c4a',
            background: 'transparent',
            color: '#8b8ba3',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          摸摸头
        </button>
        {petError && (
          <ErrorText inline color={COLORS.dangerLight} fontSize={11} style={{ marginLeft: 8 }}>
            {petError}
          </ErrorText>
        )}
      </div>
    </div>
  )
}
