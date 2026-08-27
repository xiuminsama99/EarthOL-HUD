# R13 P1 结果报告：从 HabitScreen 抽出 HabitPanel / SideHabitCard

## 本次改动
纯结构移动 + props 透传，**行为/文案/机制零改动**。拆出 3 个新文件：
- `src/features/habit/HabitPanel.tsx`（456 行，主线习惯卡）
- `src/features/habit/SideHabitCard.tsx`（337 行，支线习惯折叠卡）
- `src/features/habit/habitShared.ts`（16 行，共享 `Feedback` + `REJECT_LABEL`）

提交 `dfdfc4a`，已推送。

## 行数变化
| 文件 | 前 | 后 |
|---|---|---|
| `HabitScreen.tsx` | 1673 | **898**（-775） |
| `HabitPanel.tsx` | 0（内嵌） | 456 |
| `SideHabitCard.tsx` | 0（内嵌） | 337 |
| `habitShared.ts` | 0 | 16 |

目标 HabitScreen ~1050，实际 **898**（更干净，超出预期）。HabitPanel/SideHabitCard 明显高于报告估的 ~260/~300，但那些是纯含 JSX 的保守估计；行数不是问题。

## 红线核对（全绿）
- ✅ **行为/文案/机制零改动**：用 Python 对 `git show HEAD` 原始文件做字节级 diff，两个组件体 `HabitPanel`(445 行) 与 `SideHabitCard`(313 行) **逐字节 IDENTICAL**。唯一的代码改动是给函数加 `export` 前缀（让主壳 import），以及把 `Feedback`/`REJECT_LABEL` 移到共享模块。
- ✅ **UI 薄壳不破坏**：领域规则全部留在 `habitFlow`/engine，两个组件仍是纯展示 + 事件回调。
- ✅ **编排层留在 screen**：`runCheckin`/`onRestDay`/`recordPetMood`/`playChime`/`setCelebration` 等编排逻辑**全部留在 HabitScreen 主壳**，未下放。
- ✅ **未抽公共 UI / 未改 theme**（那是 P3/P4，本阶段只拆组件）。
- ✅ **未碰** `habitFlow.ts`/`engine`/`storage`。
- ✅ **`.tsx` 无测试依赖**，334 测试零影响。

## 遇到的分歧点（sideAnnualLine / fmtNum 归属）
- `sideAnnualLine` + `fmtNum`：**只被 SideHabitCard 用**（核查确认，主壳未引用 `projectAnnual`/`fmtNum`/`FORMED_DAYS`/`habitBadgeLabel` 这几个符号）。→ 已随 `SideHabitCard` 一起搬走，留在其文件内，**未共享**。这符合"只被一个组件用就搬到对应文件"的规则。
- `Feedback` + `REJECT_LABEL`：**被主壳 + SideHabitCard 共用**（`Feedback` 还被 HabitPanel 用）。→ 为避免循环引用，新开 `habitShared.ts` 放下这 2 个符号，主壳/HabitPanel/SideHabitCard 各按需 import。这是唯一为拆分需要引入的"共享"，非泛化；把 `Feedback`/`REJECT_LABEL` 定义、`RejectReason` 引用一并从主壳移除，改为 import。
- `SCHEDULE_LABEL` + `panel`/`row`/`smallLabel`：**只被主壳用**（核查确认组件体未引用）。→ 留在主壳，未搬。

## 验证
- `NODE_ENV=development npx vitest run` → **334 全绿**（12 文件）
- `NODE_ENV=development npx tsc -b` → **0 错误**（同时证明无未用 import / 类型无回归）
- `NODE_ENV=development npx oxlint` → **干净**
- `NODE_ENV=development npm run build` → **成功**（precache 12 项）
- 运行时：dev server `http://localhost:5173/` 返回 200；`HabitScreen/HabitPanel/SideHabitCard/habitShared` 四个模块经 Vite 转换全部 200、exports 正常，无解析错误。
- 字节级 diff 确认两组件体与原文件完全一致（见红线核对）。

## 已知限制 / 残余风险
1. **无组件渲染测试**：项目无 React 组件测试 harness，且测试全走 `.ts` 逻辑。P1 是**纯移动**，风险已用 tsc + 构建 + Vite 模块转换 + 字节 diff 三重覆盖；但**未见真浏览器点击验证**。dev server 可用，若需人工可开浏览器走一遍主线/支线打卡。
2. **props 数量大**：`HabitPanel` 有 20 个 props。本次为忠实搬运保留了全部 props 直传（未改签名），后续 P3 抽 `theme.ts`、P4 抽公共 UI 时可顺势简化，但那是后话。
3. **`habitShared.ts` 是新增共享**：虽是拆分必需，但形似共享模块。已刻意只放最小集（2 个被多文件共用的符号），符合"不抢 P3/P4"边界；若团队不希望引入，可改为在主壳 export 并让子组件 import（多一层耦合，不推荐）。
4. **行数估计偏差**：报告估 HabitPanel ~260/SideHabitCard ~300，实际 456/337。因估计偏"净逻辑"，未把 JSX 展开算足；不影响正确性。

## 提交
`dfdfc4a refactor: R13 P1 - extract HabitPanel and SideHabitCard from HabitScreen`（已推送）

## 工作树附注
提交前 `git status` 已确认：`.agents/skills/carry-mode/*`、`AGENTS.md`、`.pi/` 有**预先存在的**未提交改动（非本次产生）。本次只暂存/提交了 4 个 refactor 文件，**未触碰** carry-mode 相关文件。
