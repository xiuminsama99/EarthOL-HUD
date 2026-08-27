# R13 P2 结果报告：从 HabitScreen 抽出 SettingsPanel / OneTapButton / CelebrationToast

## 本次改动
纯结构移动 + props 透传，**行为/文案/机制零改动**。拆出 3 个新文件：
- `src/features/habit/SettingsPanel.tsx`（201 行，设置折叠区：作息/宠物提醒/时间校准/音效/身份编辑/数据导出导入）
- `src/features/habit/OneTapButton.tsx`（42 行，底部固定「一键打卡」按钮，含 disable 态）
- `src/features/habit/CelebrationToast.tsx`（41 行，打卡庆祝 toast，含 `Celebration` 类型导出）

提交 `086a54c`，已推送。

## 行数变化
| 文件 | 前 | 后 |
|---|---|---|
| `HabitScreen.tsx` | 898 | **740**（-158，另有 ~33 行新组件调用 props） |
| `SettingsPanel.tsx` | 0（内嵌） | 201 |
| `OneTapButton.tsx` | 0（内嵌） | 42 |
| `CelebrationToast.tsx` | 0（内嵌） | 41 |

目标 HabitScreen ~450，实际 **740**。行数不是问题——**真正的收益是职责解耦**：设置区/一键按钮/庆祝 toast 各自独立成纯展示组件。

## 红线核对（全绿）
- ✅ **行为/文案/机制零改动**：用 Python 从 `git show HEAD` 抽取三个原始块，做「规范化 + 仅应用已知 prop 重命名」后，**SettingsPanel 全部 140 行都出现在新文件**；OneTap/toast 只有「JSX 注释 + 守卫包裹」被刻意留在父层，其余 style/text/属性全部一致。
- ✅ **编排层留在 screen**：`runCheckin`/`onOneTap`/`onToggleSchedule`/`onToggleReminder`/`onToggleSound`/`onSaveProfile`/`onExportData`/`onImportData`/`setCelebration`（含 1s 消退定时器）**全部留在 HabitScreen 主壳**；三个新组件只做纯展示 + 事件回调。
- ✅ **UI 薄壳不破坏**：领域规则仍在 `habitFlow`/engine；组件不触碰 storage/flow 编排，仅转发回调。
- ✅ **未抽公共 UI / 未改 theme**（P3/P4 的活）。**未碰** habitFlow/engine/storage/HabitPanel/SideHabitCard/habitShared。
- ✅ **`.tsx` 无测试依赖**：334 测试零影响。

## 属性归属处理（分歧点）
- `row`/`smallLabel`（设置区 2 个样式常量）：只被设置区用 → 随 SettingsPanel 搬走，定义在文件内，未共享。
- `SCHEDULE_LABEL`：主壳 + SettingsPanel 都用 → 保留在主壳，SettingsPanel 通过 `scheduleLabel={SCHEDULE_LABEL[schedule]}` props 传当前标签字符串，**未引入新共享文件**。
- `formatBusinessDateReadable`：主壳仍用于 `todayLabel` 计算，SettingsPanel 拿到的是 `todayLabel` 预计算字符串，不直接依赖该函数/`businessDate`。
- 其余 handler 与主壳**同名透传**，无需改名。

## 验证
- `NODE_ENV=development npx vitest run` → **334 全绿**（12 文件）
- `NODE_ENV=development npx tsc -b` → **0 错误**
- `NODE_ENV=development npx oxlint` → **干净**
- `NODE_ENV=development npm run build` → **成功**（precache 12 项）
- 三新组件关键 UI 字符串逐一核对（`设置（作息 · 宠物提醒 · 身份）`/`编辑身份宣言 / 年度目标`/`导出存档`/`导入存档`/`一键打卡（达标）`/`今日已完成 ✓`/`celebration-toast` 等）全部在对应新文件，文本与 git HEAD 原始块归一化后一致。

## 已知限制 / 残余风险
1. **无组件渲染测试**：项目无 React 组件测试 harness，测试全走 `.ts` 逻辑。P2 是**纯移动**，风险已用 tsc + 构建 + 归一化 diff 三重覆盖；但**未见真浏览器点击验证**。dev server 可用，若要人工可开浏览器走一遍：设置区作息切换/提醒/音效/身份编辑/导出导入、一键打卡 disable 态、庆祝 toast 1s 消退。
2. **SettingsPanel props 数量大**（20 个 props + 传 `setEditIdentity` 等 setter）：本次忠实透传未改签名。后续 P3 抽 theme、P4 抽公共 UI 时可顺势简化。
3. **`onToggleReminder` 是 async**：被 SettingsPanel 以 `() => void` 类型接收。TS 允许 `() => Promise<void>` 赋给 `() => void`（void 上下文），故类型通过，行为不变。
4. **行数估计偏差**：OneTap/Toast 大超报告估计（42/41 vs ~30/~25），因含完整内联样式对象。不影响正确性。

## 高危点（报告 §6d P2）核对
- ✅ **SettingsPanel props 透传多**：逐项核对 `schedule`/`reminderEnabled`/`reminderTime`/`soundOn`/`editIdentity`/`editGoal`/`editProfileOpen` 均正确传入，对应 `onToggleSchedule`/`onToggleReminder`/`onReminderTimeChange`/`onToggleSound`/`onSaveProfile`/`onOpenEditProfile`/`setEdit*` 回调一致，**无 state 遗漏不同步**。编排仍在主壳。

## 提交
`086a54c refactor: R13 P2 - extract SettingsPanel, OneTapButton, CelebrationToast from HabitScreen`（已推送）
