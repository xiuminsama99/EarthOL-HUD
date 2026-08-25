# 08: B 级缺陷与产品语义修复（2026-08 全流程思维实验产出）

**What to build:** 修复 6 个 B 级问题（防作弊完善 + 产品语义澄清 + 体验补齐）。产品语义已由父会话定案。

**Blocked by:** 01（引擎）、03（引导）、05（打卡流程）、06（主界面）

**Status:** ready-for-agent

## B1: 作息类型切换可"刷卡"
- 现象：白天打卡（业务日 D）→ 切夜间 → 凌晨 1 点业务日变 D-1 → 又能打一天
- 修复：`profile` 新增 `lastScheduleSwitchAt`（设备 ISO 时间）；`toggleSchedule` 写入；`performCheckin` 校验「切换作息当天（设备自然日）禁止再次打卡」
- 测试：切换后当日打卡被拒；未切换正常；次日可打

## B2: 改设备时区可作弊
- 现象：业务日用本地时区从网络时间转换，改设备时区可"回到昨天/跳到明天"
- 修复：业务日固定按业务时区计算（默认 `Asia/Shanghai`）：
  - 引擎 `resolveBusinessDate(now, schedule, timeZone='Asia/Shanghai')` 用 `Intl.DateTimeFormat` 转换，夜间边界（0-4:59 归昨日）按业务时区小时判定
  - 调用方（habitFlow / timeProvider.businessDateFromSource / 测试）传参更新
- 测试：同一网络时刻不同设备时区输入 → 业务日相同；夜间边界在业务时区下正确

## B3: 超额给币与"不建议"矛盾 + 可刷币
- 现象：超额给假期币=奖励超额；故意超额可无限刷币
- 修复（语义：超额量"存储"为休息额度，非奖励）：
  - 引擎 `checkIn`：超额产生假期币**上限 = 当日目标量**（目标 5 做 100 → 币 +5；超额警告仍显示真实超额量）
  - UI 超额反馈文案：明确「多做的部分已存为假期币（休息日抵扣用）」
- 测试：超额币上限；超目标 2 倍以上币不超目标量；正常超额

## B4: 引导坏习惯没接进建习惯流程
- 现象：引导时写的"最想改掉的坏习惯"在建习惯时完全没用上
- 修复：`CreateHabitForm` 支持预填——`name` 预填 `profile.badHabitDesc`，方向预选「戒除」，UI 标注「来自你的引导记录」
- 测试：habitFlow 无逻辑变化（UI 预填），验证 CreateHabitForm 收到初始值（组件层不测 DOM，流程层保证）

## B5: 休息日按钮显示"已打卡"
- 现象：休息后 lastCheckinDate=今日，一键按钮变「今日已打卡 ✓」——休息≠打卡
- 修复：一键按钮已完成文案改为「今日已完成 ✓」（覆盖打卡与休息两种语义）
- 测试：文案常量断言

## B6: 习惯无法删除/改名
- 现象：建错习惯只能清 localStorage
- 修复：
  - `habitFlow.deleteHabit(deps, habitId)`：删除习惯（关联打卡记录保留，统计口径不变）
  - `habitFlow.renameHabit(deps, habitId, newName)`：改名（仅 name 字段，引擎规则不读）
  - UI：HabitPanel 增加「改名 / 删除」入口；删除需二次确认；删除后回到建习惯表单
- 测试：删除后 listHabits 空、关联记录保留、改名校验（空/超长）

**验收说明:** 原 131 测试保持全绿 + 新增用例；tsc / oxlint / build 全绿；提交推送。

---

**Status: done（2026-08 完成）**

- [x] B1 作息切换当日禁止再次打卡（profile.lastScheduleSwitchAt + performCheckin 前置校验，reason=schedule-switched-today）
- [x] B2 业务日固定按 Asia/Shanghai（resolveBusinessDate 时区参数 + Intl，改设备时区无效）
- [x] B3 超额入币上限 = 当日目标量 + 文案区分真实超额量/存入币
- [x] B4 建习惯表单预填引导坏习惯（name + 方向预选戒除 + 来源标注）
- [x] B5 一键按钮文案「今日已完成 ✓」
- [x] B6 习惯删除（二次确认，记录保留）与改名（校验空/超长）
- [x] 测试 144/144 全绿，tsc / oxlint / build 全绿，已提交推送
