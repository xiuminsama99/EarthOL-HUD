# R13 P6 结果报告：habitFlow 文案层拆分 → habitCopy.ts

## 本次改动
纯代码重组 + 重导出桶，**行为/文案/视觉零改动**。把 `habitFlow.ts` 的**文案构建层**拆到独立文件 `habitCopy.ts`。

| 文件 | 前 | 后 | 职责 |
|---|---|---|---|
| `habitFlow.ts` | 479 | **361** | 校验 + 编排（createHabit/performCheckin/planToday/setCap/rename/delete/switchSchedule/isZeroTarget/isAtHabitCapacity/MAX_HABITS）+ 桶重导出 |
| `habitCopy.ts`（新） | 0 | **133** | 文案构建（6 个纯函数） |

原 479 行 → 拆后 361 + 133 = 494（多出来自新文件头注释与显式 import/re-export，属合理分层成本）。提交 `9ad94d6`，已推送。

## habitCopy.ts 含哪些文案函数（逐一字符保留）
1. `habitBadgeLabel(direction, locked)` — 徽章文案
2. `isPrefillableHabitDesc(desc)` — 引导预填判定
3. `formatBusinessDateReadable(date)` + 辅助常量 `WEEKDAY_LABELS` — 业务日人话化
4. `buildOverachievementNotice(overAmount, coinsGained, vacationCoins)` — 储蓄日超额反馈
5. `buildAnnualPanelCopy(projection, habit, yearlyEffectCopy?)` — 一年之约面板文案
6. `buildCheckinResultNotice(result)` — 打卡结果反馈（内部调用 buildOverachievementNotice，同一文件内闭环）

## ./habitFlow 桶重导出（测试依赖符号全保住）
`habitFlow.ts:13`：`export * from './habitCopy'`
**habitFlow.test 依赖的文案符号全部保住**：`buildOverachievementNotice / buildCheckinResultNotice / buildAnnualPanelCopy / habitBadgeLabel / isPrefillableHabitDesc / formatBusinessDateReadable` 仍可从 `./habitFlow` import（+ 类型）。其余校验/编排符号原样留在 habitFlow.ts。

## 额外处理：移除 habitFlow 里 projectAnnual 导入
`buildAnnualPanelCopy` 是 `projectAnnual` 在 habitFlow.ts 的**唯一使用处**（`ReturnType<typeof projectAnnual>` 类型位置）。拆出后 habitFlow.ts 的 engine 导入从 `checkIn, getDailyTarget, lockCap, projectAnnual, resolveBusinessDate` 收窄为 `checkIn, getDailyTarget, lockCap, resolveBusinessDate`（移除 projectAnnual）。habitFlow.test 的 projectAnnual 从 engine 直接 import（不受影响）。

## OnboardingScreen 抽样式常量
**P3 已提前完成，P6 无需改动**：`OnboardingScreen` 现在 `import { panelPage as panel, inputStyle, labelStyle, primaryBtn } from '../../components/ui/theme'`，无本地重复声明。仅剩 `ghostBtn` 为单文件专属对象，按诊断报告 §2「单文件专属对象保留原处、不入 theme」原则**保留本地**。视觉值零改动。

## 依赖/无破窗
- 所有文案函数消费方（AnnualGoalPanel/CreateHabitForm/HabitPanel/HabitScreen）仍从 `./habitFlow` import，经桶重导出解析，无破窗。
- **无任何文件直接 import `./habitCopy`**（仅 habitFlow.ts 的桶自身），保持单一入口。
- 无循环依赖：habitCopy.ts → engine/engine + engine/types；habitFlow.ts → habitCopy + engine + storage。

## 验证（全绿）
- `NODE_ENV=development npx vitest run` → **334 全绿**（12 文件）
- **habitFlow.test 单独** → **71/71 全绿**（正是精确断言文案字符串的测试）
- `NODE_ENV=development npx tsc -b` → **0 错误**
- `NODE_ENV=development npx oxlint` → **干净**
- `NODE_ENV=development npm run build` → **成功**（precache 12 项）
- **字节级核对**：用 python 从 `git show HEAD` 抽取原始 habitFlow.ts 的 6 个文案函数，逐一与 habitCopy.ts 比对，**全部逐字节一致**；`WEEKDAY_LABELS` 常量两个文件存在且一致；无残留 copy 函数在 habitFlow.ts。
- `HabitDirection` / `CheckinResult` 类型在习惯流程仍被使用，无 dead import。

## 遇到的分歧点解决
1. **projectAnnual 归属**：buildAnnualPanelCopy 只在类型位引用它。移到 habitCopy.ts 后，habitFlow.ts 该 import 收窄；habitCopy.ts 显式 `import { projectAnnual } from '../../engine/engine'`（类型位引用，无运行副作用）。
2. **buildCheckinResultNotice 内部调用 buildOverachievementNotice**：两者必须同文件（habitCopy.ts）内闭环，避免跨文件再引入耦合。已在同文件内保留。
3. **WEEKDAY_LABELS 归属**：仅 `formatBusinessDateReadable` 用，随其搬入 habitCopy.ts 作为私有常量（未导出）。

## 已知限制 / 残余风险
1. **无组件渲染测试**：项目无 React 组件测试 harness，测试全走 `.ts` 逻辑。P6 是纯逻辑拆分，habitFlow.test（71 用例精确断言文案）已直接覆盖拆后行为；但未见真浏览器点击验证。dev server（http://localhost:5173/）可人工走一遍：一年之约面板 / 主线打卡反馈 / 储蓄日超额 / 支线徽章 / 业务日文案。
2. **文案字符串未来改动风险**：文案现集中在 `habitCopy.ts`，仍被 habitFlow.test 精确断言（如 `'今日达标 ✓ 以新身份行动的一天'`、`'储蓄日：超额 5 中 3 已存为休息券（当前 3 张）'`）。**此为有意保留**——改文案需同步改测试断言。
3. **桶 `export *` 为增量导出**：`./habitFlow` 仍导出全部既有符号，符号名不变，对测试/消费方无影响。
4. **范围克制**：只做 P6，未碰 habitFlow.ts 的校验/编排函数逻辑、未碰 engine/storage、未碰 P7。

## 提交
`9ad94d6 refactor: R13 P6 - split habitFlow copy layer into habitCopy.ts (barrel re-export, tests green)`
