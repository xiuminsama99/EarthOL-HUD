/**
 * 游戏化音效层（R10b-5）——零素材成本，Web Audio API 合成短音。
 *
 * 目的：达标/超额/休息各一个差异音高，给打卡即时反馈的"游戏感"。
 * 不引音频文件、不播媒体文件，纯振荡器合成（OscillatorNode + GainNode）。
 *
 * 已知限制：无头环境无 AudioContext，本文件不做音色单测；开关逻辑
 * （soundOn）由 storage 的 settings 持久化，UI 调用前先判 isSoundEnabled。
 */
import type { AppSettings } from '../storage/types'

/** 音效场景：达标 / 超额 / 休息 / 最低版本 */
export type ChimeLevel = 'achieved' | 'extra' | 'rest' | 'minimal'

/** 各场景的音符序列（Hz 频率，4 个快速上行/下行音） */
const CHIME_SEQS: Record<ChimeLevel, number[]> = {
  // 达标：轻快上行 C5-E5-G5-C6
  achieved: [523.25, 659.25, 783.99, 1046.5],
  // 超额（储蓄日）：微高上行，稍长尾音——多做的鼓励
  extra: [659.25, 783.99, 987.77, 1318.51],
  // 休息：柔和下行——无惩罚的松弛感
  rest: [523.25, 440, 392, 329.63],
  // 最低版本：低而平——"保底了"的踏实
  minimal: [329.63, 329.63, 293.66],
}

/**
 * 音效是否开启（R10b-5：默认开；关闭则不播）。
 * 纯函数便于测试：settings.soundOn 缺省视为开。
 */
export function isSoundEnabled(settings: AppSettings | { soundOn: boolean } | null): boolean {
  return settings?.soundOn !== false
}

let audioCtx: AudioContext | null = null

/** 懒初始化 AudioContext（需用户手势后可用；失败则静默返回 null） */
function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  try {
    if (!audioCtx) audioCtx = new Ctor()
    return audioCtx
  } catch {
    return null
  }
}

/** 播放单个音符（短促衰减），合成器为纯振荡器 */
function playTone(ctx: AudioContext, freq: number, when: number, duration = 0.16, gain = 0.12): void {
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, when)
  g.gain.setValueAtTime(0, when)
  g.gain.linearRampToValueAtTime(gain, when + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, when + duration)
  osc.connect(g)
  g.connect(ctx.destination)
  osc.start(when)
  osc.stop(when + duration + 0.02)
}

/**
 * 播放一个场景音效。调用方需先判断 isSoundEnabled（此处不再读 storage，
 * 保持纯输入），无 AudioContext 时静默无操作。
 */
export function playChime(level: ChimeLevel, enabled: boolean): void {
  if (!enabled) return
  const ctx = getAudioCtx()
  if (!ctx) return
  const seq = CHIME_SEQS[level]
  if (!seq) return
  const base = ctx.currentTime
  seq.forEach((freq, i) => {
    // 音与音间隔 110ms；时长随音符略递减
    playTone(ctx, freq, base + i * 0.11, 0.18 - i * 0.01)
  })
}
