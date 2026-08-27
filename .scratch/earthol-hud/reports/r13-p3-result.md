# R13 P3 结果报告：抽出公共主题 theme.ts（颜色 tokens + 共享样式对象）

## 本次改动（纯常量搬移 + import，零行为/文案/视觉变化）
新建 `src/components/ui/theme.ts`（集中颜色 tokens + 跨文件共享样式对象），并让 8 个 `.tsx` 文件从 theme import，删除本地重复声明。

### theme.ts 导出清单
**色彩 tokens（`COLORS`）**——值严格取自原始文件，逐字一致：
- 面板/卡片底：`panelBg #141428`、`cardBg #1b1b33`、`deepBg #2d2d4a`
- 边框/文字：`border #2c2c4a`、`text #e5e5f0`、`textMuted #8b8ba3`、`textFaint #5a5a74`
- 强调/状态：`accent #7c5cff`、`success #7ee0a8`、`successBg #153a2c`、`successBorder #2c8a5a`
- 金/警示：`gold #d9b64a`、`goldLight #ffd27a`、`warnBg #3a2c15`
- 错误：`danger #ff7a7a`、`dangerLight #ff9a9a`、`dangerBg #3a1515`、`dangerBorder #8a2c2c`
- `white #fff`

**共享样式对象（含同名变体语义命名）**——值取自原文件，零改动：
- `panelPage`（480 宽 dashboard 型）：Onboarding / AdoptPet
- `panelScreen`（+ `paddingBottom:120`）：HabitScreen（给「一键打卡」留空间）
- `panelCard`（#1b1b33 紧凑型）：Heatmap / Scale
- `inputStyle`（fontSize15 + fontFamily inherit）：Onboarding / AdoptPet
- `inputStyleForm`（fontSize16 无 inherit）：CreateHabitForm
- `labelStyle`（marginBottom 6）：Onboarding
- `labelStyleForm`（marginBottom 4）：CreateHabitForm
- `primaryBtn`：Onboarding / AdoptPet
- `row`：SettingsPanel / FoundationPanel

### 覆盖的 .tsx 文件（8 个）
`FoundationPanel`、`features/habit/CreateHabitForm`、`features/habit/HabitScreen`、`features/habit/SettingsPanel`、`features/heatmap/HeatmapPanel`、`features/onboarding/OnboardingScreen`、`features/pet/AdoptPetScreen`、`features/scale/ScalePanel`

## 变体映射（关键——同名对象值不同，逐个锁定，绝不硬统一）
| 原文件对象 | 原始值 | theme 映射 |
|---|---|---|
| Onboarding/AdoptPet `panel` | 480 型无 paddingBottom | `panelPage` |
| HabitScreen `panel` | 480 型 + paddingBottom 120 | `panelScreen` |
| Heatmap/Scale `panel` | `#1b1b33` 紧凑型 | `panelCard` |
| Onboarding/AdoptPet `inputStyle` | fontSize 15 + inherit | `inputStyle` |
| CreateHabitForm `inputStyle` | fontSize 16 无 inherit | `inputStyleForm` |
| Onboarding `labelStyle` | marginBottom 6 | `labelStyle` |
| CreateHabitForm `labelStyle` | marginBottom 4 | `labelStyleForm` |
| Onboarding/AdoptPet `primaryBtn` | 一致 | `primaryBtn` |
| SettingsPanel/FoundationPanel `row` | 一致 | `row` |

## 如实报告：哪些值不同 / 哪些未提取
1. **同名对象值确实不一致**：`panel`（3 变体）、`inputStyle`（2 变体）、`labelStyle`（2 变体）。已用**语义命名变体**区分，**未硬统一**，各文件 import 对应正确变体，渲染值不变。
2. **单文件专属对象未提取**（只被一个文件用，非跨文件共享，保留原处）：Onboarding `ghostBtn`、Scale `statBox`、SettingsPanel `smallLabel`、FoundationPanel `box`/`label`、Heatmap `CELL_COLORS`。这些不是"重复声明"，提入 theme 反而污染单一来源。
3. **散在 JSX 内联的 hex 未改动**：项目样式深度内联（如 HabitPanel/SideHabitCard/PetArt 大量 `color:'#8b8ba3'` 直接写在 JSX），这些是**即兴样式**而非"重复声明的命名常量"，且大量嵌在字符串（如 `'1px solid #2c2c4a'`）或 rgba（如 `rgba(217,182,74,0.08)`）中，**纯 sed 替换会改变值**（违背零视觉）。P3 只提"命名共享对象 + 对象内颜色 token 化"，内联即兴样式保留，避免高风险。

## 验证
- `NODE_ENV=development npx tsc -b` → **0 错误**（证明删本地声明后无未定义引用、无未使用 import）
- `NODE_ENV=development npx oxlint` → **干净**
- `NODE_ENV=development npx vitest run` → **334 全绿**（12 文件）
- `NODE_ENV=development npm run build` → **成功**（precache 12 项）
- **零视觉逐字核对**：用 git HEAD 原始各文件对象值逐一比对 theme.ts 导入值，全部一致；`COLORS.white='#fff'`（3 位）与原始一致；Onboarding inputStyle 15+inherit / CreateHabitForm 16 无 inherit 映射锁定。
- import 别名（`panelPage as panel` 等）保留各文件局部引用名不变，JSX 使用处零改动。

## 已知限制 / 残余风险
1. **深度内联 hex 未 token 化**：大量公共色（`#8b8ba3` 等）仍散在 JSX 内联，未被 `COLORS` 引用。原因：内联是即兴样式（非命名常量重复），且嵌字符串/rgba，强行替换改动面大、风险高。**P3 阶段刻意收敛到"命名共享对象"这层**，内联公共色留待后续（若确认值得，作为独立增量用模板字符串处理，非纯 sed）。
2. **无组件渲染测试**：项目无 React 组件测试 harness，测试全走 `.ts`。P3 是**纯常量搬移**，已用 tsc + build + 逐字值比对三重覆盖；但未见真浏览器点击验证。dev server（http://localhost:5173/）可人工走一遍 Onboarding/HabitScreen/Settings/Scale/Heatmap 确认视觉未变。
3. **import 别名造成的局部名**：如 `panelPage as panel` 使 theme 语义名与实际局部引用名不同，需 review 时注意（但保证了使用处零改动）。
4. **单文件专属对象（ghostBtn/statBox/smallLabel/box/label/CELL_COLORS）仍在各自文件**，未被 theme 化——属有意保留，非遗漏。

## 提交
`a63d663 refactor: R13 P3 - extract shared theme tokens/styles into src/components/ui/theme.ts`（已推送）
