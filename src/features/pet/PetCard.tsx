/**
 * 主界面宠物卡（工单 04）
 *
 * 展示在打卡主界面顶部：宠物形象 + 名字 + 心情条与文案。
 * 只读组件：数据来自 storage，refreshKey 变化时重读（打卡联动心情后刷新）。
 * 喂食 / 摸头互动、状态镜像、庆祝动画均为后续迭代。
 */
import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { earthStorage } from '../../storage/storage'
import { moodLabel } from './petFlow'
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

const artBox: CSSProperties = { width: 64, height: 64, flexShrink: 0 }

/** 主界面宠物卡；未领养时渲染 null（由 App 路由保证领养后才进主界面） */
export function PetCard({ refreshKey }: { refreshKey: number }) {
  const pet = useMemo(
    () => earthStorage.listPets()[0] ?? null,
    [refreshKey], // eslint-disable-line react-hooks/exhaustive-deps
  )
  if (!pet) return null

  return (
    <div style={card}>
      <div style={artBox}>
        <PetArt breed={pet.breed} />
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
                background: pet.mood >= 50 ? '#7ee0a8' : pet.mood >= 20 ? '#d9b64a' : '#ff7a7a',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
          <span style={{ fontSize: 12, color: '#8b8ba3', flexShrink: 0 }}>{moodLabel(pet.mood)}</span>
        </div>
      </div>
    </div>
  )
}
