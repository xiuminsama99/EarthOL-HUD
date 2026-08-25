# 07: A 级缺陷修复（2026-08 全流程思维实验产出）

**What to build:** 修复全流程思维实验发现的 5 个 A 级缺陷（真 bug，用户会踩到）。

**Blocked by:** 01（引擎）、05（打卡流程）、06（主界面）

**Status:** ready-for-agent

## A1: 跨午夜业务日不刷新
- 现象：timeProvider 缓存 5 分钟 + 页面只在挂载时取一次时间 → 熬夜用户午夜后打卡记到前一天；挂机页面次日不更新
- 修复：
  - `NetworkTimeProvider.getNow`：缓存命中前检查「缓存 now 与当前本地时刻是否跨自然日」，跨日则强制 `refresh()`（重新请求网络时间）✅
  - `HabitScreen`：定时器（60s）重新调 `timeProvider.getNow()`，业务日随午夜自动翻新；卸载清理 ✅
- 测试：跨日缓存失效用例 ✅（timeProvider.test.ts）

## A2: 反向习惯明日目标显示负数
- 现象：反向习惯目标触底 0 时，明日目标 = 0 - 1 = -1
- 修复：`habitFlow.planToday` 新增 `tomorrowTarget`（正向 = target+1；反向 = max(0, target-1)），UI 用该字段，不再自行计算 ✅
- 测试：反向触底明日目标 = 0；反向未触底正常递减；正向正常递增 ✅

## A3: 时间未解析时重复渲染建习惯表单
- 现象：网络时间解析最长 12s，期间 plan=null → 已建过习惯的用户（刷新页面）仍见建习惯表单，再提交会重复创建习惯
- 修复：
  - `HabitScreen`：businessDate 未解析 → 渲染「解析时间中…」占位（不再渲染建习惯表单）；已建习惯用户在时间未解析时不会看到表单 ✅
  - `createHabit`：防御性校验 `createdAt` 必须匹配 YYYY-MM-DD，非法拒绝 ✅
- 测试：createHabit 非法 createdAt 拒绝用例 ✅

## A4: 打卡语 N 不可信
- 现象：①锁死后 progressStep 冻结，打卡语永远"第 N 次"；②缺勤回退只影响当日目标，progressStep 不回退，N 与真实执行次数不符
- 修复：`HabitState` 新增 `actionCount`（真实打卡成功次数，checked-in 才 +1，休息日不计；锁死/缺勤回退不影响）✅
  - 引擎 `checkIn`：checked-in 分支 `actionCount += 1` ✅
  - `buildAutoNote` 默认 count 改取 `habit.actionCount`（至少 1）✅
  - storage 规范化：旧数据缺失 `actionCount` 默认 0（normalizeHabit 兜底，无需升版本）✅
- 测试：锁死后打卡语次数继续累计；缺勤回退后打卡语次数 = 真实执行次数；休息日不累计；rejected 不动 ✅

## A5: 超额后养成线清零无提示
- 现象：超额按钮显眼，点击后 formationDays 归零，UI 只显示"不建议"，用户不知养成线已中断
- 修复（引擎语义保留：超额=未达标=中断）：
  - `habitFlow.buildOverachievementNotice` 统一文案：明确提示「超额当天不计入养成线，连续养成已重新计数」✅
  - 超额快捷按钮文案标注「（不建议）」✅
- 测试：buildOverachievementNotice 文案断言 ✅

**验收说明:** 原 118 测试保持全绿 + 新增用例；tsc / oxlint / build 全绿；提交推送。

**Status:** ✅ 已完成（131/131 测试全绿，tsc 0 错误，oxlint 干净，build+PWA 成功）
