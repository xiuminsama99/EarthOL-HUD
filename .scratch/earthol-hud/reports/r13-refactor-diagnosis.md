# EarthOL-HUD 增量式结构重构诊断报告（R13）

> 只读分析，未修改任何代码、未运行 vitest/tsc/build。所有行数为 `wc -l` 统计所得。
> 方向：**低风险增量式结构重构**，绝不推倒重写。红线已核对（引擎不动 / UI 薄壳 / 机制诚实 / 测试金库）。

---

## 0. 现状基线（先对齐事实）

| 层 | 内容 | 非测试行数 | 测试行数 |
|---|---|---|---|
| `src/engine/` | 领域大脑 + 唯一测试接缝 | `engine.ts` 587 + `types.ts` 141 = **728** | `engine.test.ts` **885** |
| `src/storage/` | schema/迁移/读写混居 | `storage.ts` 477 + `types.ts` 141 = **618** | `storage.test.ts` **666** |
| `src/features/` | 6 个功能域 | **5174** | 见下 |
| `src/time/` `util/` `auth/` `App/main/FoundationPanel` | 基础设施与薄壳 | ~398 | timeProvider.test 165 + authProvider.test 50 |
| **合计** | 30 个非测试文件 / 12 个测试文件 | **≈6989** | **≈4507**（344 测试） |

> 注：`storage` / `features` 的总行数若把测试一起算会偏高（如 storage.test 666）。真正要重构层的净代码量：`features` 非测试 **5174**、`storage` 非测试 **618**。

`src/features/` 六域行数（非测试）：

| 功能域 | 组件(.tsx) | 逻辑(.ts) | 小计 |
|---|---|---|---|
| habit | HabitScreen 1674 · CreateHabitForm 260 · AnnualGoalPanel 98 · AchievementPanel 64 | habitFlow 480 · habitTemplates 124 | **2700** |
| onboarding | OnboardingScreen 501 | onboardingFlow 159 | 660 |
| pet | PetCard 117 · PetArt 92 · AdoptPetScreen 151 | petFlow 196 · petReminder 106 | 662 |
| story | StoryPanel 326 | storyFlow 228 | 554 |
| scale | ScalePanel 155 | scaleFlow 133 | 288 |
| heatmap | HeatmapPanel 124 | heatmapFlow 186 | 310 |

**结论：复杂度顶层集中在 `features/habit`（2700 行，其中 HabitScreen 单文件 1674 行占 62%）与 `storage`。** 其余五域都是「小组件 + 小纯函数」的健康形态，几乎不用动。

---

## 1. 结构复杂度扫描（逐文件/逐目录热点表）

### 1a. 高风险 / 应重构（复杂度热点）

| 文件 | 行数 | 复杂度热点 | 严重度 |
|---|---|---|---|
| `features/habit/HabitScreen.tsx` | **1674** | **一个文件塞了 3 个组件**（`HabitScreen` 主壳 + `HabitPanel` + `SideHabitCard`）+ `SCHEDULE_LABEL`/`REJECT_LABEL`/`panel`/`row`/`smallLabel`/`Feedback` 常量 + `sideAnnualLine`/`fmtNum` 两个零散函数。主壳还内联大量 handler（checkin/rest/cap/rename/delete/schedule/reminder/sound/export/import）。**职责混杂、低内聚、不可测** | **P1** |
| `storage/storage.ts` | 477 | schema 表达式（`normalizeHabit/Checkin/Settings/Profile/AuditScores` + `validateData`）与迁移（`migrations`+`CURRENT_VERSION`）与持久化（`EarthStorage`+`StorageBackend`+`defaultBackend`）与序列化（`serializeData`/`parseData`）**四类职责混居一文件** | P1 |
| `features/habit/habitFlow.ts` | 480 | 职责偏散：校验（createHabit/setCap/rename）+ 编排（performCheckin/switchSchedule）+ **文案构建**（`buildAnnualPanelCopy`/`buildCheckinResultNotice`/`buildOverachievementNotice`/`habitBadgeLabel`）+ 纯展示（`planToday`/`formatBusinessDateReadable`/`isPrefillableHabitDesc`）。文案与流程同文件，改文案易误伤流程 | P2 |
| `features/onboarding/OnboardingScreen.tsx` | 501 | 7 步向导 + 内联常量（`panel`/`inputStyle`/`labelStyle`/`primaryBtn`/`ghostBtn`）。虽大但结构清晰（每步一个分支），**仅需抽样式常量**，非拆分热点 | P2 |
| `features/story/StoryPanel.tsx` | 326 | 时间线渲染 + 内联 `Stat` 小组件 + `formatDate`/`formatMonth` 工具。属「面板单文件」，可抽 `Modal`/`StatCard`，非拆分热点 | P2 |

### 1b. 健康 / 结构良好（不用动）

| 文件 | 行数 | 评价 |
|---|---|---|
| `features/heatmap/HeatmapPanel.tsx` | 124 | 薄壳，`computeHeatmap` 纯函数在 flow，渲染干净。可复用 `StatCard`/`EmptyState`（可选） |
| `features/scale/ScalePanel.tsx` | 155 | 薄壳 + 内联 `ScaleArt`/`balanceText`。内联 `statBox` 与 StoryPanel 的 `Stat` 是**重复 UI**（见 §3） |
| `features/pet/PetCard.tsx` · `PetArt.tsx` · `AdoptPetScreen.tsx` | 117/92/151 | 薄壳，情感规则全在 `petFlow`，正确 |
| `features/pet/petFlow.ts` | 196 | 规矩的小纯函数层 + 依赖注入，健康 |
| `features/pet/petReminder.ts` | 106 | 纯函数判定，健康 |
| `features/heatmap/heatmapFlow.ts` | 186 | 纯函数，健康 |
| `features/scale/scaleFlow.ts` | 133 | 纯函数，健康（唯一问题：产出 2 个**从未展示**的字段，见 §6） |
| `features/story/storyFlow.ts` | 228 | 纯函数 + 依赖注入，健康 |
| `features/onboarding/onboardingFlow.ts` | 159 | 纯校验 + 注入，健康 |
| `features/habit/habitTemplates.ts` | 124 | 纯数据 + `yearlyEffect`，健康 |
| `features/habit/CreateHabitForm.tsx` | 260 | 薄壳，校验在 flow，正确 |
| `features/habit/AnnualGoalPanel.tsx` | 98 | 薄壳，数字来自 `projectAnnual` 与 `buildAnnualPanelCopy`，正确 |
| `features/habit/AchievementPanel.tsx` | 64 | 薄壳，正确 |
| `time/timeProvider.ts` | 149 | 好模块：接口 + 实现 + 单例，可测 |
| `util/playChime.ts` | 81 | 好模块 |
| `auth/authProvider.ts` | 49 | 接口 + 本地实现 + 单例，正确 |
| `FoundationPanel.tsx` | 107 | dev-only 诊断薄壳，正确 |

### 1c. 引擎（红线 #1 —— 明确不动）

`engine/engine.ts`(587) + `types.ts`(141) + `engine.test.ts`(885)。
- 它是**唯一测试接缝 + 刻意的深模块**：只 import `./types`，不依赖 UI/存储/网络/设备时钟；全部时间由调用方注入；状态不可变。
- 逐项检查过坏味道：导出面约 8 个函数 + 3 个接口，内部 helper（`businessParts`/`daysBetween`/`pruneFormationDates`/`sumTrajectory`）都服务同一领域（习惯数学）。虽有「note 构建 + 日期工具 + 成就 + 年度投影」四类子域，但每类都很小且高内聚，**够不上拆分标准**。
- **结论：值得保留，明确建议不动。** 任何拆分都会动到 885 行测试（`engine.test.ts` 直接 import `AchievementInput` 等），风险远超收益。唯一「未来再看」信号：若引擎将来 >1000 行或开始夹带跨域关注点，再考虑抽 `businessDate.util.ts`（纯日期）+ `achievements.ts`，但**现阶段标记为不值得动**。

---

## 2. 拆分建议（对每个巨型文件）

### 2a. `HabitScreen.tsx`（1674 → 目标 ~650）

它是最大的重构红利。**关键事实：没有任何测试 import 任何 `.tsx`**（已 grep 确认全部测试 import 的是 `.ts` 逻辑模块），所以**这些拆分对 344 个测试零影响**——纯文件移动 + props 透传。

现有内含物拆分：

| 目标文件 | 职责 | 预期行数 | 依赖 |
|---|---|---|---|
| `HabitScreen.tsx`（保留） | 主壳：取数（profile/habit/identity/annualGoal/badHabitDesc/vision/pet/habits/checkins/businessDate/scale/plan/achievements）+ 全部内联 handler（checkin/rest/cap/rename/delete/schedule/reminder/sound/export/import）+ 渲染骨架 | ~650 | `earthStorage`/`timeProvider`/`engine`/`habitFlow` |
| `HabitPanel.tsx` | 主线习惯卡：目标读数 / 打卡入口 / 目标调节 / 习惯管理。**已是一个 props 化组件**（20 个 props + 2 个 useState），直接搬走 | ~260 | `habitFlow`/`engine`/`util.playChime` |
| `SideHabitCard.tsx` | 支线习惯折叠卡（自含状态 + 自调 flow，只吃 5 个 props） | ~300 | `habitFlow`/`engine`/`util.playChime` |
| `SettingsPanel.tsx` | 设置折叠区（作息/宠物提醒/时间校准/音效/身份编辑/数据导出导入） | ~200 | `earthStorage`/`timeProvider`/`onboardingFlow`/`habitFlow` |
| `OneTapButton.tsx` | 底部固定「一键打卡」按钮（含 disable 态） | ~30 | — |
| `CelebrationToast.tsx` | 打卡庆祝 toast（1s 消退） | ~25 | — |

进一步把 `HabitPanel(260)` 细分（可选，第二阶段）：

| 子组件 | 职责 | 行数 |
|---|---|---|
| `TargetReadout` | 今日目标大数字 + 缺勤回退 + 21 天养成进度 + 戒除触底完成态 | ~70 |
| `CheckinEntry` | 打卡语 textarea + 「多做了？」(overdo) + 「今天不想做？」(rest) 两个折叠 + 提交按钮 | ~120 |
| `GoalTuner` | 目标调节（固定 cap 输入 + 固定/调整按钮） | ~40 |
| `HabitManager` | 改名 + 删除（二次确认） | ~30 |

> 注意：`HabitPanel`/`SideHabitCard` 内部有同款 `role="status"` 反馈块、`role="alert"` 错误块，拆出后应顺手替换为 §3 的公共组件，避免把重复又复制一遍。

### 2b. `storage/storage.ts`（分层，见 §4）

### 2c. `habitFlow.ts`（480 → 可选拆）

| 目标文件 | 职责 | 行数 |
|---|---|---|
| `habitFlow.ts`（保留为 barrel） | 校验 + 编排（createHabit/performCheckin/setCap/rename/delete/switchSchedule/planToday/容量） | ~320 |
| `habitCopy.ts` | 文案构建（`buildAnnualPanelCopy`/`buildCheckinResultNotice`/`buildOverachievementNotice`/`habitBadgeLabel`/`isPrefillableHabitDesc`/`formatBusinessDateReadable`） | ~160 |
| `habitFlow.ts` 桶 | `export * from './habitCopy'` | — |

约束：`habitFlow.test.ts`(1211) 直接 import 上述全部函数名。**必须让 `./habitFlow` 重导出 `habitCopy` 的全部符号**（`export * from './habitCopy'`），测试才能原样通过。

---

## 3. 公共 UI 提取清单（`src/components/ui/`）

**最重要发现：这个项目的「公共 UI」几乎全被内联样式复制。** 颜色/圆角/尺寸 tokens 在几乎所有 `.tsx` 里重复出现（`#141428/#1b1b33/#2c2c4a/#7c5cff/#7ee0a8/#8b8ba3/#5a5a74/#ff7a7a/#d9b64a`），且每个文件重写 `panel`/`row`/`smallLabel`/`inputStyle`/`primaryBtn`/`ghostBtn`/`labelStyle` 等常量。**这是最高价值、最低风险的提取。**

### 3a. 应抽且重复出现 ≥2 次的模式

| 公共组件 | 建议路径 | 重复出现的位置与次数 | 风险 |
|---|---|---|---|
| `theme.ts`（色彩 + 尺寸 tokens + 共享样式对象） | `src/components/ui/theme.ts` | 几乎每个 `.tsx`（≥10 处重复声明 `panel`/`inputStyle`/`primaryBtn`/`row`/`smallLabel`/`labelStyle`） | **最低（纯常量搬移）** |
| `FeedbackBanner`（`role="status"` 成功/中性） | `ui/FeedbackBanner.tsx` | `HabitScreen`×2（HabitPanel 反馈、SideHabitCard 反馈），样式完全相同（`ok? #153a2c : #3a2c15` / `#7ee0a8 : #ffd27a`） | 低 |
| `ErrorText`（`role="alert"`） | `ui/ErrorText.tsx` | `HabitScreen`×3 + `CreateHabitForm` + `OnboardingScreen` + `StoryPanel` + `PetCard` + `AdoptPetScreen` ≈ **8 处** | 低 |
| `StatCard` | `ui/StatCard.tsx` | `ScalePanel`(内联 `statBox` ×3) + `StoryPanel`(`Stat` 组件 ×3) = **2 套实现** | 中 |
| `Collapsible`/`FoldSection` | `ui/Collapsible.tsx` | 原生 `<details>` ×3（App 诊断、HabitScreen 设置、AchievementPanel）+ **手写按钮折叠 ×3**（HabitPanel overdo/rest、SideHabitCard open）= **6 处折叠** | 中高（触发样式差异大，见下） |
| `EmptyState` | `ui/EmptyState.tsx` | `HabitScreen`(解析时间中 / CreateHabitForm 分支) + `StoryPanel`(无记录) ≈ 3 处 | 低 |
| `Modal`/`Overlay` | `ui/Modal.tsx` | `StoryPanel`(`role="dialog"` 全屏覆盖) ×1 | 中（1 处，优先级低） |
| `Toast` | `ui/Toast.tsx` | HabitScreen 庆祝 toast（顶部 fixed）×1 | 低（1 处，可与 FeedbackBanner 合并考虑） |
| `ProgressBar` | `ui/ProgressBar.tsx` | `AnnualGoalPanel`(年度进度) + `PetCard`(心情条)（语义不同） | 中（优先级低） |

### 3b. 折叠区的「手写 vs 原生」不一致（P2 注明）

现状折叠**两套做法并存**：
- 原生 `<details>/<summary>`：`App.tsx:45` 诊断面板、`HabitScreen.tsx:581` 设置区、`AchievementPanel.tsx:18`。
- 手写按钮 + `useState` 切换：`HabitPanel` 的 overdo/rest 两个折叠、`SideHabitCard` 的 open 状态。

统一成 `Collapsible` 时**能统一语义（`aria-expanded`/键盘可达性），但因各处触发按钮样式差别很大（金/绿/紫/灰边、`▸/▾` 箭头），需要引入「变体」或「把样式化 trigger 交给调用方」。**因此列为 P2（价值最高、但单点差异大，别在第一阶段做，否则容易「为了统一而统一」改变视觉）。**

### 3c. 先做什么（公共 UI）

**第一阶段只做 `theme.ts`**：把 tokens 与共享样式对象集中，先让每个文件改为 import，不改任何视觉/文案。其余（FeedbackBanner/ErrorText/StatCard/Collapsible）第二阶段做。

---

## 4. storage 分层建议

现状：`storage.ts`(477) 一文件混入四层。建议拆成：

| 文件 | 内容 | 说明 |
|---|---|---|
| `storage/types.ts`（保留） | 领域数据模型 | 不动（141 行） |
| `storage/schema.ts` | `normalizeHabit`/`normalizeCheckin`/`normalizeSettings`/`normalizeProfile`/`normalizeAuditScores`/`validateData`/`isRecord`/`emptyData`/`DEFAULT_SETTINGS`/`STORAGE_KEY`/`CURRENT_VERSION` + `serializeData`/`parseData`（纯 schema 与格式层） | 纯函数，无副作用 |
| `storage/migrations.ts` | `migrations` 记录 + 版本迁移函数 | 只依赖 `schema` |
| `storage/storage.ts` | `EarthStorage` 类 + `StorageBackend` 接口 + `defaultBackend` + `update`/`read`/`reset`/`replaceAll` 读写原语 + 便捷 CRUD + `earthStorage` 单例；**作为桶 `export * from './schema'` + `export { migrations } from './migrations'`** | 只读写，不承载 schema/迁移逻辑 |
| `storage/index`（可选） | 面向 feature 的门面 | 不强求 |

**保留测试的硬约束（务必遵守）：**
`storage.test.ts`(666) 从 `./storage` import：`CURRENT_VERSION, DEFAULT_SETTINGS, EarthStorage, STORAGE_KEY, emptyData, migrations, parseData, serializeData`，并且**在 `afterEach` 里 `delete migrations[0]`、测试里 `migrations[0] = ...`（可变对象）**。
- 因此 `./storage` 必须保留为可 import 的模块，并**重新导出**（`export * from './schema'` / `export { migrations } from './migrations'`）这些符号。
- `migrations` 必须是**同一个 live 对象引用**（重导出同一 binding，切勿浅拷贝/解构），否则 `delete migrations[0]` 会失效。
- 主风险：若把 `parseData`/`serializeData` 移进 `schema.ts`，确保 `schema` 内部引用 `CURRENT_VERSION`/`validateData` 不产生循环依赖（它们同文件即可，无循环）。

---

## 5. 迁移顺序（分阶段，低→高风险）

> 原则：**单独、可独立验证、每步跑 `npm test`（344 全绿）再做下一步。** 引擎最后 / 建议不动。

| 阶段 | 动作 | 风险 | 预期影响（测试） | 工作量 |
|---|---|---|---|---|
| **P1（推荐首个）** | 抽 `HabitScreen.tsx` 的 `SideHabitCard` + `HabitPanel` 到独立文件（纯搬移 + props） | **极低** | **0 个测试受影响**（无测试 import .tsx）。HabitScreen 1674→~1050 | **S** |
| **P2** | 抽 `SettingsPanel`（设置折叠区）+ `OneTapButton` + `CelebrationToast` | 低（需 props 透传 schedule/soundOn/reminder 等） | 0 测试影响（纯组件） | **M** |
| **P3** | `theme.ts` + 共享样式对象落地，全 `.tsx` 改 import | **低**（纯常量搬移，零行为/文案变化） | 0 测试影响 | **M**（文件面广，偏机械） |
| **P4** | 公共 UI：`FeedbackBanner`/`ErrorText`/`StatCard`/`EmptyState`（优先这 4 个高重复低差异的） | 低-中（改 3-8 个文件的样式引用） | 0 测试影响 | **M** |
| **P5** | `storage` 分层（schema/migrations/读写） | **中**（storage.test 依赖具体符号 + 可变 `migrations`，需 barrel 重导出） | storage.test(666) 必须原样绿；onboardingFlow.test 也 import `STORAGE_KEY, CURRENT_VERSION`，一并保住 | **M** |
| **P6** | `habitFlow` 文案层拆出（`habitCopy.ts`）+ `OnboardingScreen` 抽样式常量 | 低-中（habitFlow.test import 这些函数名） | habitFlow.test(1211) 必须绿（重导出保住） | **M** |
| **P7** | 公共 UI：`Collapsible`（统一折叠）/`Modal`/`Toast`/`ProgressBar` | **中-高**（各处 trigger 样式差异大，需变体；易无意改视觉） | 0 测试影响 | **L** |
| **engine** | **建议不动** | —— | —— | —— |

**推荐第一阶段 = P1**（见 §汇报）。

---

## 6. 风险与护栏（如何保住 344 测试 + 机制诚实 + UI 薄壳）

### 6a. 保测试（价值金库 344 测试）

- **铁律：任何拆分后，用「重导出桶」替换旧入口文件。** 测试 import 的入口是固定的：`engine/engine`、`engine/types`、`storage/storage`、`storage/types`、`features/<f>/<flow>.ts`、`features/habit/habitTemplates`、`time/timeProvider`、`auth/authProvider`。只在这些入口**新增**重导出，不改变已在用的符号名。
- **storage**：`./storage` 桶必须仍导出 `EarthStorage`（类）、`migrations`（**同一 live 对象**）、`STORAGE_KEY`、`CURRENT_VERSION`、`DEFAULT_SETTINGS`、`emptyData`、`parseData`、`serializeData`（storage.test 全部引用，且 `migrations` 被 `delete/mutations`）。
- **habitFlow**：`habitFlow.test` import 了 `createHabit/performCheckin/planToday/setCap/buildOverachievementNotice/buildCheckinResultNotice/buildAnnualPanelCopy/isZeroTarget/deleteHabit/renameHabit/switchSchedule/habitBadgeLabel/isPrefillableHabitDesc/formatBusinessDateReadable/MAX_HABITS/isAtHabitCapacity` + 类型。拆文案层后 `./habitFlow` 必须 `export * from './habitCopy'`。
- **组件层（.tsx）零测试依赖**：已 grep 确认没有任何测试 import 组件文件，所以所有组件拆分/公共 UI 提取**对测试无感**。这是本项目最大的重构红利。
- **引擎（红线）：不动 → engine.test(885) 天然保住。**

### 6b. 机制诚实（产品灵魂，红线 #3）

- 所有机制/文案都在 `engine`（未动）与 `habitFlow`/`habitTemplates` 的**纯函数**里，已有测试以**精确字符串断言**锁定（例如 `'今日达标 ✓ 以新身份行动的一天'`、`'储蓄日：超额 5 中 3 已存为休息券（当前 3 张）'`、`'66,795 个'`）。因此**移动这四个文案构建函数是安全的**（测试就是护栏），但**一个字符都不能改**。
- 重构中**不得**：
  - 改动 `checkIn`/`planToday`/`formatBusinessDateReadable`/`yearlyEffect`/`buildAnnualPanelCopy` 的任何字符串（被 habitFlow.test/habitTemplates.test 精确断言）。
  - 重排或删除「最低版本/休息/戒除坚持」的 early-return 分支顺序（`mode==='minimal' → playChime('minimal')` 等），只搬不移。
  - 改变「零输入」路径（`note === undefined` 自动生成）。
  - 改变「不惩罚」文案（储蓄日 / 冻结不清零 / 漏一天没关系）。

### 6c. UI 薄壳（红线 #2）

- 领域规则必须继续留在 `*.flow.ts` / `engine`；`.tsx` 只做**展示 + 编排**。当前原则**成立**（各域 flow.ts 承载规则、组件只 `import` flow 调用；在 6 个 feature 里都核对了，没有发现规则泄漏到组件）。
- 注意一个**轻微「壳偏厚」**：`HabitScreen` 的 handler 里内联了若干**领域感知编排**（`result.mode === 'minimal'`→播 'minimal' 音、`recordPetMood` 按 `backoffDays`/`warning` 选事件）。这**不是规则泄漏**（规则语义仍在引擎/flow），是「编排层偏厚」。重构时**保留在 screen，不要下放到子组件**，免得把编排散落。

### 6d. 高危点汇总

| 阶段 | 高危点 | 缓解 |
|---|---|---|
| P5 storage | `migrations` 被测试 mutate；`./storage` 是多个测试的入口 | 桶重导出同一 `migrations` 引用；跑 storage.test + onboardingFlow.test |
| P6 habitFlow | 文案函数被 habitFlow.test 精确断言 | `export * from './habitCopy'`；字符串零改动 |
| P7 Collapsible | 各折叠区 trigger 样式差异大，易无意识改视觉 | 需「变体」设计，先小范围试点，UA 走查 |
| P2 SettingsPanel | 大量 props 透传，可能遗漏 state 同步（如 `schedule`/`soundOn`/`reminderEnabled`） | 改造后人工点一遍：切作息/提醒/音效/身份/导出导入 |
| 全局 | 「机械诚实」文案改动 | 以现有测试断言为准绳，绝不手工重写字符串 |

---

## 7. 可删减项（诚实评估「该删 vs 该拆」）

重构有时是减法。以下是诚实的「可能该删该简化」清单，每条都给了证据与建议：

1. **`scaleFlow.globalPercent` + `GLOBAL_PERCENT_MIN/MAX` + `achievedRate`（死字段）** —— `ScalePanel.tsx` **渲染的是 `actionDays`/`totalAmount`/`weeklyActionRate`，从不渲染 `globalPercent`/`achievedRate`**；文档 `analysis-features.md` 明确「全球 X% 纯示例数据，BaaS 前隐藏」。
   - 但 `scaleFlow.test.ts` 仍对 `globalPercent`/`achievedRate` 有断言（约 5 条）。所以它是**「被测试锁定的死字段」**。
   - 建议：**标注为「低价值保留字段」而非「该删」**。若产品确认永不展示 → 删 `globalPercent`/`GLOBAL_PERCENT_*`/`achievedRate` 并**同步删 scaleFlow.test 中对应断言**（这会让测试数下降，属**减法收益**）。若 BaaS 后要用 → 保留现样。**当前不建议删**（有测试保护、删要动测试、且文档说「届时恢复」）。
2. **`PlayerProfile.personaName`（从未写入的留位字段）** —— grep 显示：只在 `types.ts` 定义、`storage` normalize/updateProfile 默认 `null`、测试 fixture 里写 `null`。**没有任何业务逻辑读过/写过它**（onboarding.submit 不设、updateProfile 不设）。注释是「工单 04 可复用，先留位」。
   - 建议：**这是最接近真「可删」的字段**。若产品确认不再回到「替身人格」设定 → 删除该字段 + storage 中的 normalize/默认值 + 相关测试 fixture。属减法。**因牵动 storage.test 多个 fixture，需一并清理，建议放 P5 一起做。**
3. **`FoundationPanel.tsx`（dev-only 诊断面板）** —— 生产构建不暴露（`import.meta.env.DEV`）。它**不是死代码**（dev 排查用），但**与主界面 `HabitScreen` 的「设置折叠区」存在重复**（都做作息切换、时间源、业务日展示）。可考虑与 `SettingsPanel` 合并或让 `FoundationPanel` 复用同一套 toggle。属「去重」而非「删除」。
4. **「三层目标」的月度/明日任务** —— `analysis-features.md` 列为 P0 缺口「最大缺口」，目前**只有年度主线实现**，未实装月度/明日。**当前没有对应死代码**，属「未做」，不算「该删」。
5. **`HABIT_TEMPLATES` 的 `tip`/`unit` 等** —— 均被 CreateHabitForm 使用，非死代码。

**结论：真正「该删」的，只有 `personaName`（若确不用）和潜在过后的 `globalPercent/achievedRate`（若确不展示）。其余是「该拆」或「该去重」而非「该删」。** 这个判断很重要：不要把「保留位字段」误当死代码删掉。

---

## 8. 每阶段工作量估算（粗略 S/M/L）

| 阶段 | 内容 | 预估 |
|---|---|---|
| P1 | 抽 `SideHabitCard` + `HabitPanel` | **S**（~0.5 天） |
| P2 | 抽 `SettingsPanel` + `OneTapButton` + toast | **S**（~0.5 天） |
| P3 | `theme.ts` + 样式落到各 `.tsx` | **M**（~1 天，文件面广但机械） |
| P4 | `FeedbackBanner`/`ErrorText`/`StatCard`/`EmptyState` | **M**（~1 天） |
| P5 | `storage` 分层（schema/migrations/读写，含删 `personaName`、可能 `globalPercent`） | **M**（~1–1.5 天，必跑 storage/onboarding 测试） |
| P6 | `habitFlow` 文案层拆分 + Onboarding 样式常量 | **S–M**（~0.5–1 天） |
| P7 | `Collapsible`/`Modal`/`Toast`/`ProgressBar` 公共化 | **L**（~2 天，视觉回归风险高，需体验官走查） |
| — | 全程每阶段跑 `npm test`（344 全绿门禁） | 计入各阶段 |

---

## 9. 一句话总结

**复杂度真实且集中在 `HabitScreen.tsx`（1674 行，单文件 3 个组件）和 `storage`（四职责混居）与「全站内联样式复制」。引擎是黄金资产，明确不动。** 用「低风险增量式」路径：先从**无任何测试依赖、纯文件搬移**的 `P1`（拆 SideHabitCard/HabitPanel）切入——它独立、低风险、见效最快；再渐进到主题提取、公共 UI、storage 分层、文案层拆分。每一步守住「344 测试全绿 + 机制诚实 + UI 薄壳」三条红线。
