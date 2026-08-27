/**
 * 习惯主线卡（从 HabitScreen 抽出，R13 P1）。
 * 薄壳：收到主线习惯与当日计划 → 渲染目标读数 / 打卡入口 / 目标调节 / 习惯管理。
 * 领域规则在 habitFlow / engine；仅做展示 + 事件回调，编排留在父层。
 */
import { useState } from 'react'
import type { HabitState } from '../../engine/types'
import { FORMED_DAYS } from '../../engine/engine'
import { habitBadgeLabel, planToday } from './habitFlow'
import type { Feedback } from './habitShared'

interface HabitPanelProps {
  habit: HabitState
  plan: ReturnType<typeof planToday>
  /** P1-4：今日已打卡（或休息）→ 卡片内全部打卡入口置灰，与底部一键按钮状态一致 */
  todayChecked: boolean
  /** 自动生成打卡语预览（默认展示，可确认或编辑覆盖） */
  autoNote: string
  /** 年度主线（三层目标第一层；有值时在习惯卡片展示归属） */
  annualGoal: string | null
  amount: string
  setAmount(v: string): void
  note: string
  setNote(v: string): void
  capInput: string
  setCapInput(v: string): void
  renameInput: string
  setRenameInput(v: string): void
  error: string | null
  feedback: Feedback | null
  onCheckin(): void
  /** 快捷打卡（UX-16/20）：「刚好达标 / 多做了 N」点击即直接打卡 */
  onQuickCheckin(amount: number): void
  onMinimalCheckin(): void
  /** P1-1：戒除完成态「继续坚持」——记录今天也没做 X，保持 0 目标态 */
  onQuitMaintain(): void
  onRestDay(): void
  onLockCap(): void
  onRename(): void
  onDelete(): void
}

export function HabitPanel(props: HabitPanelProps) {
  const { habit, plan } = props
  const annualGoal = props.annualGoal?.trim()
  /** UX-7：戒除类习惯目标触底 0 → 完成态 */
  const zeroTarget = plan.target === 0 && habit.direction === 'negative'
  /** P1-4：今日已完成 → 全部打卡入口置灰 */
  const done = props.todayChecked
  /** R12 P2（工单 19）：打卡入口收敛——「多做了？/今天不想做？」默认收起，减少 8 入口视觉噪音 */
  const [overdoOpen, setOverdoOpen] = useState(false)
  const [restOpen, setRestOpen] = useState(false)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <h2 style={{ margin: 0, fontSize: 17 }}>{habit.name}</h2>
        <span style={{ fontSize: 12, color: '#8b8ba3', border: '1px solid #2c2c4a', borderRadius: 999, padding: '2px 10px' }}>
          {habitBadgeLabel(habit.direction, plan.locked)}
        </span>
      </div>
      <p style={{ color: '#8b8ba3', fontSize: 12, marginTop: 0 }}>
        总量 {habit.totalAmount} · 达标次数 {habit.consistencyDays} 天 · 休息券 {habit.vacationCoins} 张
        {habit.isFormed && <span style={{ color: '#7c5cff' }}> · 已养成 ✓</span>}
      </p>

      {annualGoal && (
        <p style={{ color: '#7ee0a8', fontSize: 12, marginTop: 0, marginBottom: 10 }}>
          🔗 年度主线：{annualGoal}
        </p>
      )}

      <div style={{ background: '#1b1b33', borderRadius: 10, padding: 16, textAlign: 'center', marginBottom: 16 }}>
        {zeroTarget ? (
          <div style={{ fontSize: 14, color: '#7ee0a8', lineHeight: 1.6 }}>
            已戒除到 0，恭喜！
            <br />
            <span style={{ fontSize: 12, color: '#8b8ba3' }}>已经迈过最难的坎，守住它</span>
            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                disabled={done}
                onClick={props.onQuitMaintain}
                style={{
                  padding: '8px 18px',
                  borderRadius: 999,
                  border: done ? '1px solid #2c2c4a' : '1px solid #7c5cff',
                  background: done ? '#2c2c4a' : 'rgba(124,92,255,0.15)',
                  color: done ? '#5a5a74' : '#b9a8ff',
                  fontSize: 13,
                  cursor: done ? 'default' : 'pointer',
                }}
              >
                {done ? '今日已坚持 ✓' : '继续坚持（今天也没做它）'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, color: '#8b8ba3' }}>今日目标</div>
            <div style={{ fontSize: 42, fontWeight: 700, lineHeight: 1.2 }}>{plan.target}</div>
            {plan.backoffDays > 0 && (
              <div style={{ fontSize: 12, color: '#d9b64a' }}>
                缺勤 {plan.backoffDays} 天，目标已回退（不退零，从当前位置继续）
              </div>
            )}
            {!plan.locked && (
              <div style={{ fontSize: 12, color: '#8b8ba3', marginTop: 4 }}>
                明日目标 {plan.tomorrowTarget}
              </div>
            )}
          </>
        )}
      </div>

      {/* R-1：窗口制养成进度（不惩罚：缺勤/超额冻结，不归零）；缺勤归来如实解释 */}
      <div style={{ fontSize: 13, color: '#8b8ba3', marginBottom: 6 }}>
        21 天里已达标 {habit.formationDays}/{FORMED_DAYS} 天
        {!habit.isFormed && '（满 14 天即养成）'}
      </div>
      {plan.backoffDays > 0 && (
        <div style={{ fontSize: 12, color: '#d9b64a', marginBottom: 6 }}>
          缺勤会影响目标回退，但已达标的天数都保留——没关系，继续就是
        </div>
      )}

      {/* R5：年度累计效果（工单 13 起由上方「一年之约」面板呈现年度大数；此处不再重复展示数字） */}

      {props.feedback && (
        <p
          role="status"
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            fontSize: 13,
            margin: '0 0 12px',
            background: props.feedback.kind === 'ok' ? '#153a2c' : '#3a2c15',
            color: props.feedback.kind === 'ok' ? '#7ee0a8' : '#ffd27a',
          }}
        >
          {props.feedback.text}
        </p>
      )}

      {/* N1：戒除归 0 完成态下隐藏手动打卡区——只保留底部一键打卡（主 CTA）与休息/最低版本
          R12 P2（工单 19）：打卡入口收敛——主路径（一键打卡 + 打卡语）留明面不藏；
          低频出口（多做了=储蓄 / 不想做=休息+保底）收进默认折叠，减少 8 入口视觉噪音 */}
      {!zeroTarget && (
        <>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, color: '#8b8ba3', marginBottom: 4 }}>
              打卡语
            </label>
            <textarea
              value={props.note}
              onChange={(e) => props.setNote(e.target.value)}
              placeholder={props.autoNote}
              rows={2}
              maxLength={200}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #2c2c4a',
                background: '#1b1b33',
                color: '#e5e5f0',
                fontSize: 14,
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
            <div style={{ fontSize: 11, color: '#8b8ba3', marginTop: 4 }}>
              默认自动生成，也可以自己改：{props.autoNote}
            </div>
          </div>

          {props.error && (
            <p role="alert" style={{ color: '#ff7a7a', fontSize: 13 }}>
              {props.error}
            </p>
          )}

          {/* 【多做了？】折叠：多做 N（储蓄）+ 精确输入，默认收起 */}
          <div style={{ marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => setOverdoOpen((v) => !v)}
              aria-expanded={overdoOpen}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #d9b64a',
                background: 'rgba(217,182,74,0.08)',
                color: '#d9b64a',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {overdoOpen ? '▾' : '▸'} 多做了？存一张休息券（储蓄）
            </button>
            {overdoOpen && (
              <div style={{ marginTop: 8 }}>
                {habit.direction === 'positive' && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    {[1, 2, 5].map((extra) => (
                      <button
                        key={extra}
                        type="button"
                        disabled={done}
                        onClick={() => props.onQuickCheckin(plan.target + extra)}
                        style={{
                          flex: 1,
                          padding: '6px 0',
                          borderRadius: 6,
                          border: '1px solid #2c2c4a',
                          background: done ? '#2c2c4a' : '#1b1b33',
                          color: done ? '#5a5a74' : '#d9b64a',
                          fontSize: 12,
                          cursor: done ? 'default' : 'pointer',
                        }}
                      >
                        多做 {extra}
                      </button>
                    ))}
                  </div>
                )}
                <label style={{ display: 'block', fontSize: 13, color: '#8b8ba3', marginBottom: 4 }}>
                  精确完成量
                </label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={props.amount}
                  disabled={done}
                  onChange={(e) => props.setAmount(e.target.value)}
                  placeholder={`今日目标 ${plan.target}`}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #2c2c4a',
                    background: '#1b1b33',
                    color: done ? '#5a5a74' : '#e5e5f0',
                    fontSize: 16,
                  }}
                />
                <button
                  type="button"
                  disabled={done}
                  onClick={props.onCheckin}
                  style={{
                    width: '100%',
                    marginTop: 8,
                    padding: '12px',
                    borderRadius: 8,
                    border: '1px solid #d9b64a',
                    background: done ? '#2c2c4a' : 'rgba(217,182,74,0.1)',
                    color: done ? '#5a5a74' : '#ffd27a',
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: done ? 'default' : 'pointer',
                  }}
                >
                  按输入量打卡
                </button>
              </div>
            )}
          </div>

          {/* 【今天不想做？】折叠：休息（用券）+ 保底（做 1 个就算数），两行小字说明差异，默认收起 */}
          <div style={{ marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => setRestOpen((v) => !v)}
              aria-expanded={restOpen}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #2c8a5a',
                background: 'rgba(44,138,90,0.08)',
                color: '#7ee0a8',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {restOpen ? '▾' : '▸'} 今天不想做？
            </button>
            {restOpen && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    disabled={done}
                    onClick={props.onRestDay}
                    title="消耗 1 张休息券，今日不打卡也不缺勤；没有券时点按会提示如何获取"
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: 8,
                      border: '1px solid #2c2c4a',
                      background: done ? '#2c2c4a' : '#1b1b33',
                      color: done ? '#5a5a74' : '#e5e5f0',
                      fontSize: 13,
                      cursor: done ? 'default' : 'pointer',
                    }}
                  >
                    休息（用 1 张休息券）
                  </button>
                  <button
                    type="button"
                    disabled={done}
                    onClick={props.onMinimalCheckin}
                    title="状态差也没关系：做 1 个也算行动，明天从原目标继续，养成进度不丢"
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: 8,
                      border: '1px solid #2c8a5a',
                      background: done ? '#2c2c4a' : '#153a2c',
                      color: done ? '#5a5a74' : '#7ee0a8',
                      fontSize: 13,
                      cursor: done ? 'default' : 'pointer',
                    }}
                  >
                    做 1 个就算数（免券）
                  </button>
                </div>
                <div style={{ fontSize: 11, color: '#5a5a74', marginTop: 6, lineHeight: 1.7 }}>
                  「休息」用 1 张休息券：今天彻底放假，不计入 7 天行动率
                  <br />
                  「做 1 个就算数」太累时保底：免券，但算作行动日（会拉低你的 7 天行动率）
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <div
        style={{
          marginTop: 18,
          paddingTop: 14,
          borderTop: '1px solid #2c2c4a',
        }}
      >
        <div style={{ fontSize: 13, color: '#8b8ba3', marginBottom: 4 }}>
          目标调节：固定后每天不再自动变化，可随时再调
        </div>
        {plan.locked && (
          <div style={{ fontSize: 12, color: '#8b8ba3', marginBottom: 6 }}>
            当前已固定：每天 {habit.cap}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="number"
            min={1}
            step={1}
            value={props.capInput}
            onChange={(e) => props.setCapInput(e.target.value)}
            placeholder={plan.locked ? `当前 ${habit.cap}，输入新上限` : '上限（如 10）'}
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #2c2c4a',
              background: '#1b1b33',
              color: '#e5e5f0',
              fontSize: 15,
            }}
          />
          <button
            type="button"
            onClick={props.onLockCap}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: '1px solid #d9b64a',
              background: '#3a2c15',
              color: '#ffd27a',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            {plan.locked ? '调整' : '固定'}
          </button>
        </div>
      </div>

      <div
        style={{
          marginTop: 18,
          paddingTop: 14,
          borderTop: '1px solid #2c2c4a',
        }}
      >
        <div style={{ fontSize: 13, color: '#8b8ba3', marginBottom: 4 }}>习惯管理</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            maxLength={40}
            value={props.renameInput}
            onChange={(e) => props.setRenameInput(e.target.value)}
            placeholder={`改名（当前：${habit.name}）`}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid #2c2c4a',
              background: '#1b1b33',
              color: '#e5e5f0',
              fontSize: 14,
            }}
          />
          <button
            type="button"
            onClick={props.onRename}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #2c2c4a',
              background: '#1b1b33',
              color: '#e5e5f0',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            改名
          </button>
          <button
            type="button"
            onClick={props.onDelete}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #8a2c2c',
              background: '#3a1515',
              color: '#ff9a9a',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            删除
          </button>
        </div>
      </div>
    </div>
  )
}
