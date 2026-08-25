/**
 * 身份一致性热力图面板（R3）
 *
 * GitHub 风格 12 周 × 7 天网格：每列一周（周一在顶），颜色深浅代表当日
 * 以身份行动的强度。展示「有多少天以新身份行动」，与连续打卡天数无关——
 * 断签不惩罚，行动过就有颜色。
 *
 * 只读组件：数据经 computeHeatmap 纯函数计算后按周分列渲染。
 */
import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { CheckinRecord } from '../../storage/types'
import { computeHeatmap } from './heatmapFlow'
import type { HeatmapCell, HeatmapLevel } from './heatmapFlow'

interface HeatmapPanelProps {
  checkins: CheckinRecord[]
  /** 业务日 YYYY-MM-DD（引擎 resolveBusinessDate 产物，决定窗口与未来标记） */
  today: string
  weeks?: number
}

/** 格子配色（按档位；未来日留白不渲染，避免「像已打卡」误导——UX-18） */
const CELL_COLORS: Record<HeatmapLevel, string> = {
  0: '#2c2c4a', // 未行动
  1: '#3d4a6e', // 行动（未达标/回归）
  2: '#7c5cff', // 达标
  3: '#d9b64a', // 超额
  4: '#4a3a1c', // 休息日
}

const LEVEL_LABEL: Record<HeatmapLevel, string> = {
  0: '未行动',
  1: '行动（未达标 / 缺勤回归）',
  2: '达标',
  3: '超额',
  4: '休息日',
}

const panel: CSSProperties = {
  background: '#1b1b33',
  borderRadius: 10,
  padding: '14px 16px',
  marginBottom: 16,
}

/** 单元格：未来日留白（transparent），过去/今日按档位着色 */
function Cell({ cell }: { cell: HeatmapCell }) {
  const color = cell.isFuture ? 'transparent' : CELL_COLORS[cell.level]
  const title = `${cell.date}：${LEVEL_LABEL[cell.level]}`
  return (
    <div
      title={title}
      aria-label={title}
      style={{
        width: 12,
        height: 12,
        borderRadius: 3,
        background: color,
        flexShrink: 0,
      }}
    />
  )
}

/** 图例行（UX-18：去掉「未来」项——未来不渲染） */
function Legend() {
  const items: { color: string; label: string }[] = [
    { color: CELL_COLORS[1], label: '行动' },
    { color: CELL_COLORS[2], label: '达标' },
    { color: CELL_COLORS[3], label: '超额' },
    { color: CELL_COLORS[4], label: '休息' },
  ]
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
      {items.map((it) => (
        <span key={it.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#8b8ba3' }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: it.color, display: 'inline-block' }} />
          {it.label}
        </span>
      ))}
    </div>
  )
}

/** 星期标签（列顶，周一/周四/周日） */
const WEEKDAY_LABELS = [
  { day: 1, label: '一' },
  { day: 4, label: '四' },
  { day: 7, label: '日' },
]

export function HeatmapPanel({ checkins, today, weeks = 12 }: HeatmapPanelProps) {
  const cells = useMemo(() => computeHeatmap(checkins, today, weeks), [checkins, today, weeks])

  // 按周分列：每 7 天为一列（周一在顶）
  const columns: HeatmapCell[][] = []
  for (let i = 0; i < cells.length; i += 7) {
    columns.push(cells.slice(i, i + 7))
  }

  return (
    <section style={panel} aria-label="身份一致性热力图">
      <div style={{ fontSize: 14, color: '#e5e5f0', marginBottom: 8 }}>
        身份一致性 · 最近 {weeks} 周
      </div>
      <Legend />
      <div style={{ display: 'flex', gap: 3, overflowX: 'auto' }}>
        {columns.map((col, colIdx) => (
          <div key={col[0].date} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* 星期标签：每周在对应行显示，其余留空对齐 */}
            <div style={{ height: 12, fontSize: 9, color: '#5a5a74', lineHeight: '12px' }}>
              {WEEKDAY_LABELS.find((w) => w.day === colIdx + 1)?.label ?? ''}
            </div>
            {col.map((cell) => (
              <Cell key={cell.date} cell={cell} />
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
