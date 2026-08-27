/**
 * 领养宠物界面（工单 04）
 *
 * 引导完成后、进入主界面前的第一步：选品种 → 起名 → 领养。
 * 只做品种选择与文案编排，校验与持久化委托 petFlow。
 * 文案与身份宣言联动：以「我是___」的身份，领一只陪你 365 天的伙伴。
 */
import { useState } from 'react'
import { earthStorage } from '../../storage/storage'
import { panelPage as panel, inputStyle, primaryBtn } from '../../components/ui/theme'
import { PET_BREEDS, adoptPet } from './petFlow'
import { PetArt } from './PetArt'

interface AdoptPetScreenProps {
  /** 领养完成后通知父级进入主界面 */
  onAdopted(): void
}

function AdoptPetScreen({ onAdopted }: AdoptPetScreenProps) {
  const [breedId, setBreedId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const identity = earthStorage.getProfile()?.identityStatement

  const adopt = () => {
    setError(null)
    if (!breedId) {
      setError('先选一只宠物伙伴')
      return
    }
    const { error: err } = adoptPet({ storage: earthStorage }, { breed: breedId, name })
    if (err) {
      setError(err)
      return
    }
    onAdopted()
  }

  return (
    <main style={panel}>
      <div style={{ fontSize: 12, color: '#7c5cff', marginBottom: 8 }}>领养你的伙伴</div>
      <h1 style={{ marginTop: 0, fontSize: 22, lineHeight: 1.4 }}>
        {identity ? (
          <>
            以「{identity}」的身份，
            <br />
            你值得一个陪你 365 天的伙伴。
          </>
        ) : (
          '给你的旅程挑一个伙伴吧'
        )}
      </h1>
      <p style={{ color: '#8b8ba3', fontSize: 14, lineHeight: 1.7 }}>
        它不会督促你，不会数落你。你打卡，它就开心；你累了，它安静陪着。
        每天看一眼它，就是看一眼你想成为的自己。
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, margin: '18px 0' }}>
        {PET_BREEDS.map((breed) => {
          const selected = breed.id === breedId
          return (
            <button
              key={breed.id}
              type="button"
              onClick={() => setBreedId(breed.id)}
              style={{
                border: selected ? '1px solid #7c5cff' : '1px solid #2c2c4a',
                background: selected ? '#241b4a' : '#1b1b33',
                color: '#e5e5f0',
                borderRadius: 10,
                padding: '12px 8px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <div style={{ width: 56, height: 56 }}>
                <PetArt breed={breed.id} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{breed.label}</span>
              <span style={{ fontSize: 11, color: '#8b8ba3', lineHeight: 1.4 }}>{breed.tagline}</span>
            </button>
          )
        })}
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 13, color: '#8b8ba3', marginBottom: 6 }}>
          给它起个名字
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="比如：糯米 / 阿旺 / 小绿"
          maxLength={20}
          style={inputStyle}
        />
      </div>

      {error && (
        <p role="alert" style={{ color: '#ff7a7a', fontSize: 13, margin: '0 0 10px' }}>
          {error}
        </p>
      )}

      <button type="button" onClick={adopt} style={primaryBtn}>
        领养它，开始游戏
      </button>
    </main>
  )
}

export default AdoptPetScreen
