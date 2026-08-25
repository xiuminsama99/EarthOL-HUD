/**
 * 身份一致性热力图纯函数测试（R3）
 *
 * 覆盖：空数据 / 强度分档（未达标·达标·超额·休息） / 缺勤归来 /
 * 同日去重 / 跨周跨月窗口 / 注入今日 / 未来标记 / 窗口长度。
 * 只断言输入输出，不测实现细节。
 */
import { describe, expect, it } from 'vitest'
import type { CheckinRecord } from '../../storage/types'
import { computeHeatmap, dateDiff } from './heatmapFlow'

/** 构造打卡记录（默认：2026-08-25 达标 5/5） */
function rec(over: Partial<CheckinRecord> = {}): CheckinRecord {
  return {
    id: 'r1',
    habitId: 'h1',
    businessDate: '2026-08-25',
    amount: 5,
    targetAmount: 5,
    note: '今日打卡',
    restDay: false,
    mode: 'normal',
    createdAt: '2026-08-25T10:00:00.000Z',
    ...over,
  }
}

/** 按日期取格子 */
function cellOf(cells: ReturnType<typeof computeHeatmap>, date: string) {
  const cell = cells.find((c) => c.date === date)
  if (!cell) throw new Error(`missing cell ${date}`)
  return cell
}

describe('computeHeatmap 基础', () => {
  it('空数据：窗口内全部 0 档，今日后标记未来', () => {
    const cells = computeHeatmap([], '2026-08-25', 1)
    expect(cells).toHaveLength(7)
    // 窗口 = 2026-08-24(周一) .. 2026-08-30(周日)
    expect(cells[0].date).toBe('2026-08-24')
    expect(cells[6].date).toBe('2026-08-30')
    for (const cell of cells) {
      expect(cell.level).toBe(0)
      expect(cell.isAction).toBe(false)
      expect(cell.isRest).toBe(false)
    }
    // 今日(25)与之前非未来；26 起未来
    expect(cellOf(cells, '2026-08-24').isFuture).toBe(false)
    expect(cellOf(cells, '2026-08-25').isFuture).toBe(false)
    expect(cellOf(cells, '2026-08-26').isFuture).toBe(true)
    expect(cellOf(cells, '2026-08-30').isFuture).toBe(true)
  })

  it('默认窗口 12 周 = 84 格', () => {
    const cells = computeHeatmap([], '2026-08-25')
    expect(cells).toHaveLength(84)
  })

  it('窗口末周必包含注入的今日（周日归整）', () => {
    const cells = computeHeatmap([], '2026-08-25', 2)
    // 窗口 = 2026-08-17(周一) .. 2026-08-30(周日)（2 个完整周）
    expect(cells[0].date).toBe('2026-08-17')
    expect(cells[cells.length - 1].date).toBe('2026-08-30')
  })

  it('跨月边界：窗口跨越自然月', () => {
    // today 2026-09-02(周三) weeks=2 → 窗口 2026-08-24 .. 2026-09-06
    const cells = computeHeatmap([], '2026-09-02', 2)
    expect(cells).toHaveLength(14)
    expect(cells[0].date).toBe('2026-08-24')
    expect(cells[13].date).toBe('2026-09-06')
    // 8 月与 9 月都覆盖
    expect(cells.some((c) => c.date.startsWith('2026-08'))).toBe(true)
    expect(cells.some((c) => c.date.startsWith('2026-09'))).toBe(true)
  })

  it('注入今日不同 → 未来标记随之移动', () => {
    const checkins = [rec()]
    const cellsA = computeHeatmap(checkins, '2026-08-25', 1)
    const cellsB = computeHeatmap(checkins, '2026-08-26', 1)
    expect(cellOf(cellsA, '2026-08-26').isFuture).toBe(true)
    expect(cellOf(cellsB, '2026-08-26').isFuture).toBe(false)
    expect(cellOf(cellsB, '2026-08-25').level).toBe(2)
  })
})

describe('computeHeatmap 强度分档', () => {
  it('达标（amount === target）→ 2 档', () => {
    const cells = computeHeatmap([rec()], '2026-08-25', 1)
    const cell = cellOf(cells, '2026-08-25')
    expect(cell.level).toBe(2)
    expect(cell.isAction).toBe(true)
    expect(cell.isRest).toBe(false)
  })

  it('超额（amount > target）→ 3 档', () => {
    const cells = computeHeatmap([rec({ amount: 7 })], '2026-08-25', 1)
    expect(cellOf(cells, '2026-08-25').level).toBe(3)
  })

  it('行动但未达标（amount < target）→ 1 档', () => {
    const cells = computeHeatmap([rec({ amount: 3 })], '2026-08-25', 1)
    expect(cellOf(cells, '2026-08-25').level).toBe(1)
  })

  it('休息日 → 4 档（isRest，非行动日）', () => {
    const cells = computeHeatmap([rec({ restDay: true, amount: 0 })], '2026-08-25', 1)
    const cell = cellOf(cells, '2026-08-25')
    expect(cell.level).toBe(4)
    expect(cell.isRest).toBe(true)
    expect(cell.isAction).toBe(false)
  })

  it('缺勤归来达标 → 1 档（回归不是稳定身份）', () => {
    const checkins = [
      rec({ businessDate: '2026-08-20', createdAt: '2026-08-20T10:00:00.000Z' }),
      rec({ businessDate: '2026-08-25', createdAt: '2026-08-25T10:00:00.000Z' }),
    ]
    // 窗口 08-17..08-30（2 周），覆盖两个打卡日
    const cells = computeHeatmap(checkins, '2026-08-25', 2)
    expect(cellOf(cells, '2026-08-20').level).toBe(2) // 首个记录：非回归
    expect(cellOf(cells, '2026-08-25').level).toBe(1) // 间隔 5 天：缺勤归来
  })

  it('连续两天达标 → 后一天不判回归（间隔 1 天）', () => {
    const checkins = [
      rec({ businessDate: '2026-08-24', createdAt: '2026-08-24T10:00:00.000Z' }),
      rec({ businessDate: '2026-08-25', createdAt: '2026-08-25T10:00:00.000Z' }),
    ]
    const cells = computeHeatmap(checkins, '2026-08-25', 1)
    expect(cellOf(cells, '2026-08-25').level).toBe(2)
  })
})

describe('computeHeatmap 防御', () => {
  it('同日多条记录：只算一格，取 createdAt 最新', () => {
    const checkins = [
      rec({ amount: 3, createdAt: '2026-08-25T08:00:00.000Z' }),
      rec({ amount: 7, createdAt: '2026-08-25T21:00:00.000Z' }),
    ]
    const cells = computeHeatmap(checkins, '2026-08-25', 1)
    expect(cells.filter((c) => c.date === '2026-08-25')).toHaveLength(1)
    expect(cellOf(cells, '2026-08-25').level).toBe(3) // 取最新（超额 7/5）
  })

  it('休息日记录不参与缺勤归来判定（休息日不中断）', () => {
    const checkins = [
      rec({ businessDate: '2026-08-24', createdAt: '2026-08-24T10:00:00.000Z' }),
      rec({ businessDate: '2026-08-25', restDay: true, amount: 0, createdAt: '2026-08-25T10:00:00.000Z' }),
    ]
    const cells = computeHeatmap(checkins, '2026-08-25', 1)
    expect(cellOf(cells, '2026-08-25').level).toBe(4) // 休息日
    // 无后续行动日，休息日本身不触发任何回归判定
    expect(cellOf(cells, '2026-08-24').level).toBe(2)
  })

  it('今日之后的记录不生效（未来格恒 0 档）', () => {
    const cells = computeHeatmap([rec({ businessDate: '2026-08-28' })], '2026-08-25', 1)
    expect(cellOf(cells, '2026-08-28').level).toBe(0)
    expect(cellOf(cells, '2026-08-28').isFuture).toBe(true)
  })
})

describe('dateDiff 工具', () => {
  it('同一天差 0', () => {
    expect(dateDiff('2026-08-25', '2026-08-25')).toBe(0)
  })
  it('跨月差正确', () => {
    expect(dateDiff('2026-08-31', '2026-09-02')).toBe(2)
  })
  it('跨年差正确', () => {
    expect(dateDiff('2026-12-31', '2027-01-01')).toBe(1)
  })
})

describe('R4：minimal 最低版本分档', () => {
  it('minimal 记录 → 1 档（行动但未达标，与缺勤归来同档）', () => {
    const cells = computeHeatmap([rec({ mode: 'minimal', amount: 1, targetAmount: 5 })], '2026-08-25', 1)
    const cell = cellOf(cells, '2026-08-25')
    expect(cell.level).toBe(1)
    expect(cell.isAction).toBe(true)
    expect(cell.isRest).toBe(false)
  })

  it('minimal 且 amount === target 仍判 1 档（保底不是达标）', () => {
    const cells = computeHeatmap([rec({ mode: 'minimal', amount: 1, targetAmount: 1 })], '2026-08-25', 1)
    expect(cellOf(cells, '2026-08-25').level).toBe(1)
  })
})
