/**
 * 宠物主动提醒（R6，P1 收尾）
 *
 * 纯前端提醒：应用打开期间定时检查，到点且今天未打卡 → 发一条带宠物名字的
 * 系统通知（「亲爱的主人，今天也要陪主人一起进步哦」）。
 *
 * 能力边界（诚实设计）：页面关闭后没有后台推送（Notification API 依赖运行中的
 * 页面/Service Worker；定时后台推送需要服务端 + Web Push，BaaS 后置）。
 * 因此本模块只承诺「应用打开期间的提醒」，不承诺离线/关闭时触达。
 *
 * 时间口径：提醒时刻用设备本地时钟（用户感知的"现在"），业务日用注入值
 * （网络时间 + 固定时区的产物）。两者在正常时区下一致；本地时钟只用于
 * 触发提醒，不参与打卡业务日判定（打卡仍由网络时间锚点保证，见 B2）。
 */
import type { PlayerProfile, Pet } from '../../storage/types'

/** 默认提醒时间（HH:mm） */
export const DEFAULT_REMINDER_TIME = '20:00'

/** HH:mm 格式校验（00:00-23:59） */
export function isValidReminderTime(time: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(time)) return false
  const [h, m] = time.split(':').map(Number)
  return h >= 0 && h <= 23 && m >= 0 && m <= 59
}

/**
 * 计算「今天的提醒时刻」。
 * @param now 当前时刻（注入，可测）
 * @param time HH:mm
 * @returns 今天的提醒时刻；time 非法时返回 null
 */
export function nextReminderAt(now: Date, time: string): Date | null {
  if (!isValidReminderTime(time)) return null
  const [h, m] = time.split(':').map(Number)
  const at = new Date(now)
  at.setHours(h, m, 0, 0)
  return at
}

/**
 * 是否应该触发提醒（纯判定，注入 now，可测）。
 *
 * 满足全部条件才提醒：
 * 1. 提醒开关已开启（profile.petReminderEnabled）
 * 2. 今天（业务日）还没打卡（checkedToday === false）
 * 3. 今天（业务日）还没提醒过（lastRemindedAt !== businessDate）
 * 4. 已到今日提醒时刻（now >= 今日提醒时刻）
 */
export interface ReminderCheckInput {
  now: Date
  /** 业务日 YYYY-MM-DD（网络时间 + 作息边界产物） */
  businessDate: string
  /** 今天是否已打卡（含休息日/最低版本，即"今日已有动作"） */
  checkedToday: boolean
  /** 最近一次提醒的业务日（profile.lastPetReminderDate） */
  lastRemindedAt: string | null
  /** 玩家档案（null 视为未开启） */
  profile: Pick<PlayerProfile, 'petReminderEnabled' | 'petReminderTime'> | null
}

export function shouldRemind(input: ReminderCheckInput): boolean {
  const { now, businessDate, checkedToday, lastRemindedAt, profile } = input
  if (!profile || !profile.petReminderEnabled) return false
  if (checkedToday) return false
  if (lastRemindedAt === businessDate) return false
  const at = nextReminderAt(now, profile.petReminderTime)
  if (at === null) return false
  return now.getTime() >= at.getTime()
}

/** 提醒文案构建（纯函数） */
export function buildReminderMessage(
  pet: Pet,
  identity: string | null,
): { title: string; body: string } {
  const who = identity?.trim() ? identity.trim() : '更好的自己'
  return {
    title: `${pet.name}`,
    body: `亲爱的主人，今天也要以${who}的身份进步哦 🌱`,
  }
}

export type ReminderSendResult = 'sent' | 'skipped' | 'unsupported'

/**
 * 发送系统通知（Notification API）。
 * - 环境不支持 Notification → 'unsupported'
 * - 权限未授予 → 'skipped'（不请求权限，由 UI 开关流程请求）
 * - 成功 → 'sent'
 */
export function sendPetReminder(
  pet: Pet,
  identity: string | null,
): ReminderSendResult {
  if (typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission !== 'granted') return 'skipped'
  try {
    const { title, body } = buildReminderMessage(pet, identity)
    new Notification(title, { body, tag: 'earthol-pet-reminder' })
    return 'sent'
  } catch {
    return 'unsupported'
  }
}
