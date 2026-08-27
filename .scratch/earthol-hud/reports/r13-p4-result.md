# R13 P4 结果报告：抽取公共 UI 组件 ErrorText / FeedbackBanner / StatCard / EmptyState

## 本次改动（纯 UI 提取，行为/文案/视觉零改动）
新建 4 个公共组件（`src/components/ui/`），消除跨文件重复内联 UI。**9 个 .tsx 改 import，文字/颜色/间距/字号全部原样保留**。

| 组件 | props 签名 | 覆盖的重复点 |
|---|---|---|
| `ErrorText` | `children, color?, fontSize?, style?, inline?` | **7 处** `role="alert"`（CreateHabitForm/HabitPanel/SideHabitCard/Onboarding/AdoptPet/PetCard/StoryPanel） |
| `FeedbackBanner` | `ok?, children, compact?, style?` | **2 处** `role="status"`（HabitPanel 面板级、SideHabitCard 卡片级） |
| `StatCard` | `label, value, compact?, valueColor?, style?` | **2 套实现**（ScalePanel `statBox`×3 + StoryPanel `Stat`×3 = 6 处） |
| `EmptyState` | `children, style?` | **2 处**（HabitScreen "解析时间中"、StoryPanel 无记录） |

提交 `6fd53e9`，已推送。

## 逐替换点「渲染值与原一致」处理（如实报告）

### ErrorText（7 处，3 种值+inline 变体）
| 文件 | 原值 | 处理方式 | 结果 |
|---|---|---|---|
| CreateHabitForm | `#ff7a7a` fs13 | 默认 props（不传） | 一致 ✓ |
| HabitPanel | `#ff7a7a` fs13 | 默认 props | 一致 ✓ |
| OnboardingScreen | `#ff7a7a` fs13 | 默认 props | 一致 ✓ |
| SideHabitCard | `#ff7a7a` fs12 + margin `0 0 10px` | `fontSize={12}` + `style={{margin:'0 0 10px'}}` | 一致 ✓ |
| AdoptPetScreen | `#ff7a7a` fs13 + margin `0 0 10px` | `style={{margin:'0 0 10px'}}` | 一致 ✓ |
| StoryPanel | **`#ff9a9a`**（dangerLight）fs13 + margin `0 0 12px` | `color={COLORS.dangerLight}` + `style={{margin:'0 0 12px'}}` | 一致 ✓ |
| PetCard | **`#ff9a9a`** fs11 + marginLeft 8 + **inline span** | `inline color={COLORS.dangerLight} fontSize={11} style={{marginLeft:8}}` | 一致 ✓ |

**关键决策：不硬统一颜色**。`#ff7a7a`（danger）与 `#ff9a9a`（dangerLight）是两套原样差异，用 `color` prop 保留，未改写成一样。

### FeedbackBanner（2 处，颜色相同但尺寸不同）
| 文件 | 原值 | 处理 | 一致 |
|---|---|---|---|
| HabitPanel | padding `10px 12px` fs13 margin `0 0 12px`（面板级） | 默认（非 compact） | ✓ |
| SideHabitCard | padding `8px 10px` fs12 margin `0 0 10px`（卡片级） | `compact` | ✓ |

颜色按 `ok` 取 `successBg/warnBg` + `success/goldLight`，两者原值本就相同，未改。

### StatCard（2 套实现，背景/padding/minWidth/值色不同）
| 实现 | 原值 | 处理 | 一致 |
|---|---|---|---|
| ScalePanel `statBox` | bg `#141428`(panelBg) padding `8px 10px` 无 minWidth 值色继承 | `compact`（不传 valueColor→继承） | ✓ |
| StoryPanel `Stat` | bg `#1b1b33`(cardBg) padding `10px 12px` minWidth90 值色 `#7ee0a8`(success) | 默认 + `valueColor={COLORS.success}` | ✓ |

**关键决策：不硬统一背景**。天平卡用面板底、时间线统计用卡片底，用 `compact` 区分，未改写成一样。

### EmptyState（2 处，完全一致）
| 文件 | 原值 | 处理 | 一致 |
|---|---|---|---|
| HabitScreen | padding `40px 0` fs14 `#8b8ba3` 居中 | `<EmptyState>` | ✓ |
| StoryPanel | 同上 | `<EmptyState>` | ✓ |

## 移除的内容
- `ScalePanel` 内联 `statBox` 常量定义（含 `CSSProperties` import，移除后确认不再用）
- `StoryPanel` 内联 `Stat` 组件定义（3 处使用改 StatCard）
- 各文件散落的 `role="alert"/"status"` 内联块（grep 确认 features 内已无残留，除 ui 组件自身单源）

## 验证（全绿）
- `NODE_ENV=development npx vitest run` → **334 全绿**（12 文件）
- `NODE_ENV=development npx tsc -b` → **0 错误**
- `NODE_ENV=development npx oxlint` → **干净**
- `NODE_ENV=development npm run build` → **成功**（precache 12 项）
- 9 个改动文件 + 4 个新组件，**git diff 净 -62 行**（去重收益）
- grep 确认 features 内 `role="alert"/"status"` 全部迁移到公共组件，无残留

## 已知限制 / 残余风险
1. **无组件渲染测试**：项目无 React 组件测试 harness，测试全走 `.ts`。P4 是**样式/JSX 提取**，已用 tsc + build + 逐值比对覆盖；但未见真浏览器点击验证。dev server（http://localhost:5173/）可人工走一遍：创建习惯报错、主线/支线打卡上下两状态横幅、故事页统计+空态、天平数字、宠物摸摸头错误提示、设置页错误。
2. **StoryPanel 移除 `Stat` 组件**：如后续新增需要该组件则复用 `StatCard`，无可达性影响。
3. **不同值保留为 props（color/compact/valueColor）**：有意未统一差异化值，若后续想收敛风格需单独决策（属设计改动，非本阶段）。
4. **范围克制**：只做 P4 的 4 个组件，未碰 `Collapsible`/`Modal`/`Toast`（P7）、未碰 `habitFlow`/engine/storage、未改 `.scratch/reports/*`。

## 提交
`6fd53e9 refactor: R13 P4 - extract shared UI components ErrorText/FeedbackBanner/StatCard/EmptyState`（已推送）
