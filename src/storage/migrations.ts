/**
 * 版本迁移钩子（从原 storage.ts 拆出）。
 *
 * key 为源版本号，value 为升级函数（接收旧数据，返回新数据）。
 * 1 为当前版本，暂无历史迁移；未来版本演进时在此登记。
 * 只依赖 schema 层的数据形状约定，不触碰 IO。
 */
export const migrations: Record<number, (prev: unknown) => unknown> = {
  // 1→2：工单 03 档案新增正愿景/反愿景/坏习惯描述/完成引导时间
  1: (prev) => {
    const d = (prev ?? {}) as Record<string, unknown>
    const profile = (d.profile ?? null) as Record<string, unknown> | null
    return {
      ...d,
      profile: profile
        ? {
            ...profile,
            vision: profile.vision ?? null,
            antivision: profile.antivision ?? null,
            badHabitDesc: profile.badHabitDesc ?? null,
            annualGoal: profile.annualGoal ?? null,
            auditScores: profile.auditScores ?? null,
            onboardedAt: profile.onboardedAt ?? null,
          }
        : null,
    }
  },
}
