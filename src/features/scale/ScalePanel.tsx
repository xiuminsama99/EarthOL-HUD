/**
 * 天平可视化面板（工单 06）
 *
 * 主界面「一眼可见四要素」的视觉中枢：左边「真实的你」、右边「向往的你」、
 * 宠物蹲在支点上。每次打卡左盘下沉一点（CSS/SVG 过渡动画，AI 图后置）。
 * 下方累积数字（身份行动天数 / 总量 / 达成率）与最近一条打卡语（身份一致性的证据）。
 *
 * 全球 X% 为纯示例数据，BaaS 接入前不在 UI 展示（scaleFlow 计算字段保留，届时恢复）。
 *
 * 只读组件：全部数据由调用方经 computeScaleData 计算后传入。
 */
import type { CSSProperties } from 'react'
import { panelCard as panel } from '../../components/ui/theme'
import { PetArt } from '../pet/PetArt'
import type { ScaleData } from './scaleFlow'

interface ScalePanelProps {
  scale: ScaleData
  petBreed: string | null
  petName: string | null
  /** 身份宣言「我是___」（左盘文案用） */
  identity: string | null
  /** 正愿景展开描述（右盘文案用） */
  vision: string | null
}

const statBox: CSSProperties = {
  flex: 1,
  background: '#141428',
  borderRadius: 8,
  padding: '8px 10px',
  textAlign: 'center',
}

/** 天平 SVG：横杆 + 两盘绕支点旋转（tiltDeg > 0 左沉） */
function ScaleArt({ tiltDeg }: { tiltDeg: number }) {
  return (
    <svg
      viewBox="0 0 300 150"
      role="img"
      aria-label="天平"
      style={{ display: 'block', width: '100%', height: 'auto' }}
    >
      {/* 支点立柱 + 底座 */}
      <polygon points="145,88 155,88 150,64" fill="#2c2c4a" />
      <line x1="118" y1="112" x2="182" y2="112" stroke="#2c2c4a" strokeWidth="6" strokeLinecap="round" />
      {/* 横杆 + 两盘：整体绕支点 (150,60) 旋转；打卡后 tiltDeg 增大 → 左盘下沉 */}
      <g transform={`rotate(${tiltDeg} 150 60)`} style={{ transition: 'transform 0.6s ease' }}>
        <line x1="30" y1="60" x2="270" y2="60" stroke="#8b8ba3" strokeWidth="3" />
        <line x1="56" y1="60" x2="56" y2="88" stroke="#8b8ba3" strokeWidth="2" />
        <ellipse cx="56" cy="94" rx="30" ry="8" fill="#7c5cff" opacity="0.9" />
        <text x="56" y="97" textAnchor="middle" fontSize="9" fill="#141428">
          真实的你
        </text>
        <line x1="244" y1="60" x2="244" y2="88" stroke="#8b8ba3" strokeWidth="2" />
        <ellipse cx="244" cy="94" rx="30" ry="8" fill="#d9b64a" opacity="0.9" />
        <text x="244" y="97" textAnchor="middle" fontSize="9" fill="#141428">
          向往的你
        </text>
      </g>
    </svg>
  )
}

/** 平衡状态提示文案（随倾斜方向切换叙事） */
function balanceText(scale: ScaleData): string {
  if (scale.tiltDeg > 2) return '天平压向真实的你——行动正在兑现身份'
  if (scale.tiltDeg < -2) return '向往的你还在彼岸，每一次行动都会把你送过去'
  if (scale.actionDays > 0) return '天平平衡——你正走在成为向往之人的路上'
  return '每一次打卡，都会让真实的你更沉一点'
}

export function ScalePanel({ scale, petBreed, petName, identity, vision }: ScalePanelProps) {
  const leftLabel = identity?.trim() ? `以「${identity.trim()}」行动` : '以身份行动'
  const rightLabel = vision?.trim() ? vision.trim() : '向往的你'

  return (
    <section style={panel} aria-label="天平与累积数字">
      {/* 天平 + 支点宠物（不随横杆旋转） */}
      <div style={{ position: 'relative' }}>
        <ScaleArt tiltDeg={scale.tiltDeg} />
        <div
          style={{
            position: 'absolute',
            top: '28%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 42,
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.35))',
          }}
          title={petName ?? '你的伙伴'}
        >
          <PetArt breed={petBreed ?? 'dino'} />
        </div>
      </div>

      <div style={{ fontSize: 12, color: '#8b8ba3', textAlign: 'center', marginTop: 6 }}>
        {balanceText(scale)}
      </div>

      {/* 左右盘标签（身份 vs 愿景） */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#5a5a74', marginTop: 4 }}>
        <span style={{ color: '#9d8bff' }}>{leftLabel}</span>
        <span style={{ color: '#d9b64a' }}>{rightLabel}</span>
      </div>

      {/* 累积数字 */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <div style={statBox}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            {scale.actionDays}
            <span style={{ fontSize: 11, color: '#8b8ba3' }}> 天</span>
          </div>
          <div style={{ fontSize: 11, color: '#8b8ba3' }}>行动天数</div>
        </div>
        <div style={statBox}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            {scale.totalAmount}
            <span style={{ fontSize: 11, color: '#8b8ba3' }}> {scale.unit}</span>
          </div>
          <div style={{ fontSize: 11, color: '#8b8ba3' }}>累计总量</div>
        </div>
        <div style={statBox}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            {scale.weeklyActionRate === null ? '—' : `${scale.weeklyActionRate}%`}
          </div>
          <div style={{ fontSize: 11, color: '#8b8ba3' }}>最近 7 天行动率</div>
        </div>
      </div>

      {/* 最近一条打卡语（身份一致性的证据） */}
      {scale.latestNote && (
        <p
          style={{
            fontSize: 13,
            color: '#8b8ba3',
            fontStyle: 'italic',
            margin: '10px 0 0',
            borderLeft: '2px solid #7c5cff',
            paddingLeft: 10,
          }}
        >
          {scale.latestNote}
        </p>
      )}
    </section>
  )
}
