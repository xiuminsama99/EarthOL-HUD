/**
 * 领域数据模型（地球online玩家控制台）
 *
 * 对应工单 02 数据模型的本地版：用户、习惯、打卡记录、宠物、
 * 房间/资产、存钱账户、账单。习惯复用引擎类型（src/engine/types.ts 的
 * HabitState），其余实体在此定义。BaaS 后置时以本文件为表结构蓝本。
 */
import type { HabitState, WorkSchedule } from '../engine/types'

/** 玩家档案（对应 BaaS 的 users 表） */
export interface PlayerProfile {
  id: string
  /** 身份宣言「我是___」（一日重启产物，工单 03 写入） */
  identityStatement: string | null
  /** 正愿景展开描述（身份宣言的补充，可选） */
  vision: string | null
  /** 反愿景：「5 年后什么都不改的普通周二」（恐惧驱动，工单 03 写入） */
  antivision: string | null
  /** 最想改掉的一个坏习惯 / 想养成的第一个好习惯（MVP 手动描述，为 AI 拆解留位） */
  badHabitDesc: string | null
  /** 替身人格名字（工单 04 可复用，先留位） */
  personaName: string | null
  /** 作息类型：白天工作 / 夜间工作 */
  schedule: WorkSchedule
  /** 完成引导的时间（老用户跳过判断依据） */
  onboardedAt: string | null
  createdAt: string
}

/** 打卡记录（对应 checkins 表，与习惯解耦便于统计） */
export interface CheckinRecord {
  id: string
  habitId: string
  /** 业务日 YYYY-MM-DD（引擎 resolveBusinessDate 产物） */
  businessDate: string
  /** 完成量 */
  amount: number
  /** 当日目标量 */
  targetAmount: number
  /** 一句话记录「今天我以 XX 身份做了 XX」 */
  note: string
  /** 是否休息日（假期币抵扣） */
  restDay: boolean
  createdAt: string
}

/** 宠物（对应 pets 表，工单 04 落地） */
export interface Pet {
  id: string
  /** 品种 */
  breed: string
  name: string
  /** 心情值（0-100），后续工单驱动 */
  mood: number
  createdAt: string
}

/** 房间/资产（对应 assets 表，游戏化资产，MVP 后置使用） */
export interface Asset {
  id: string
  name: string
  /** 等级 */
  level: number
  createdAt: string
}

/** 存钱账户（对应 savings_accounts 表） */
export interface SavingsAccount {
  id: string
  name: string
  /** 余额（单位：分，避免浮点误差） */
  balanceCents: number
  createdAt: string
}

/** 账单（对应 bills 表） */
export interface Bill {
  id: string
  accountId: string | null
  /** 金额（分） */
  amountCents: number
  note: string
  createdAt: string
}

/** 领域数据快照：localStorage 版单 key 整体持久化 */
export interface EarthData {
  profile: PlayerProfile | null
  habits: HabitState[]
  checkins: CheckinRecord[]
  pets: Pet[]
  assets: Asset[]
  savingsAccounts: SavingsAccount[]
  bills: Bill[]
}
