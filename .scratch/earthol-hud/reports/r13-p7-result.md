# R13 P7 结果报告：抽取公共 UI（Collapsible / Modal）——低风险试点，视觉零改动

## 决策摘要（诚实优先，"宁可不抽"）
P7 目标清单为 `Collapsible`/`Modal`/`Toast`/`ProgressBar`。按报告 §3 与任务"宁可不抽、绝不勉强统一、差异过大就保留原样"的决定，我做了**区分化处理**：

| 公共组件 | 是否抽取 | 覆盖处数 | 理由 |
|---|---|---|---|
| **Modal** | ✅ 抽取 `src/components/ui/Modal.tsx` | 1（StoryPanel） | 最安全（role=dialog 全屏覆盖层），语义真实 |
| **Collapsible** | ✅ 抽取 `src/components/ui/Collapsible.tsx` | **1**（SideHabitCard 迁移） | 唯一真正的无障碍缺口（可点击 div 无 aria） |
| **Toast** | ⏸ **未抽**（已覆盖） | 0 新增 | P2 已抽成 `CelebrationToast.tsx`（专组件），再抽泛型冗余且仅 1 用法 |
| **ProgressBar** | ⏸ **未抽**（保留原样） | 0 新增 | 两处差异过大 + 语义不同，按任务指引不强抽 |

提交 `3af0d4c`，已推送。

---

## 1. Modal（抽取 + 接线 StoryPanel）
```ts
interface ModalProps {
  label: string        // aria-label
  children: ReactNode
  style?: CSSProperties  // 覆盖层顶层样式覆盖
}
```
只做「覆盖层 + role=dialog 壳」，内容（sheet/头部/关闭钮/主体）由调用方渲染。`overlay` 常量移入 Modal，值与 StoryPanel 原 `overlay` **逐字一致**（`position:fixed; inset:0; zIndex:50; background:rgba(8,8,18,0.92); overflowY:auto; padding:24px 0 60px`）。
**替换**：StoryPanel 的 `<div style={overlay} role="dialog" aria-label="我的故事">` → `<Modal label="我的故事">`，`sheet` 与全部内容原样保留，`overlay` 常量已移除。覆盖层渲染值/背景/滚动/内边距**完全一致**。

## 2. Collapsible（抽取 + 迁移 SideHabitCard）
```ts
interface CollapsibleTriggerProps {
  open: boolean; toggle: () => void
  'aria-expanded': boolean; role: 'button'; tabIndex: number
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void
}
interface CollapsibleProps {
  open: boolean; onToggle: () => void
  trigger: (props: CollapsibleTriggerProps) => ReactNode  // 触发器渲染（调用方全权控制样式）
  children: ReactNode
  contentStyle?: CSSProperties
}
```
设计：**语义层**（aria-expanded / 键盘可达 / 默认收起）由组件统一注入；**触发器样式与内容完全由调用方通过 `trigger` render-prop 控制**，不改变任何 trigger 视觉。受控组件。

**实际覆盖：仅 SideHabitCard（1 处）。**
原触发器 `<div style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}} onClick={()=>setOpen(v=>!v)}>`（**无可点击语义、无 aria**）。迁移后：触发器 div 保留**完全相同 flex 布局与样式**，新增 `role="button"`+`tabIndex={0}`+`aria-expanded`+`onKeyDown(Enter/Space)`（无障碍补全，**零视觉变化**）；内容原 `<div style={{marginTop:12}}>` 由 `contentStyle={{marginTop:12}}` 传入，内容子元素原样保留，**渲染值与交互完全一致**。

## 3. 两套折叠做法的处理（如实报告）
P7 前折叠**两套并存**（原生 `<details>` ×3 + 手写 button/div ×3）。处理如下：

| 折叠区 | 类型 | 处理 | 原因 |
|---|---|---|---|
| SideHabitCard | 手写 div + onClick | ✅ **迁入 Collapsible** | 真实 a11y 缺口（可点击 div 无 aria） |
| HabitPanel「多做了？」 | 手写 `<button aria-expanded>` | ⏸ **保留原样** | 已是原生 button + aria-expanded，语义正确；迁入有 **double-toggle 风险**（原生 button 在 Enter/Space 触发原生 click，再注入 onKeyDown 会二次切换），无收益 |
| HabitPanel「今天不想做？」 | 手写 `<button aria-expanded>` | ⏸ **保留原样** | 同上 |
| App.tsx 诊断 | 原生 `<details>` | ⏸ **保留原样** | 已是规范语义披露；受控（open+onToggle）；样式包在 details 元素上，迁移风险视觉回归 |
| SettingsPanel | 原生 `<details>` | ⏸ **保留原样** | 同上（边框/内边距在 details 元素上） |
| AchievementPanel | 原生 `<details>` | ⏸ **保留原样** | 同上（背景/边框/圆角在 details 元素上） |

**说明**：原生 `<details>/<summary>` 是浏览器原生披露语义，本身已具备 `aria-expanded` 等价行为；改成 button 体系反而要手动重造，且背景/边框/内边距深度绑在 `<details>` 元素上，迁移必然改视觉。故按"宁可不抽、绝不勉强统一"保留原样。**Collapsible 定位为「非原生 button 触发器」的语义补全原语**（当前用于 SideHabitCard），不是强改既有原生披露。

## 4. 逐替换点"渲染值/交互与原一致"核对
- **Modal**：覆盖层样式与 StoryPanel 原 `overlay` 逐字一致；内容（title/关闭钮/时间线正文）原样。零视觉。
- **Collapsible → SideHabitCard**：触发器 flex 布局/颜色/字号/箭头（`{open?'▾':'▸'}`）原样；内容各区块样式原样；仅**新增** role/tabIndex/aria-expanded/onKeyDown（不可见 a11y）。
- 未改 `engine`/`flow`/`storage`/`theme`/P4 组件/`CelebrationToast`。

## 5. 验证（全绿）
- `NODE_ENV=development npx vitest run` → **334 全绿**（12 文件）
- `NODE_ENV=development npx tsc -b` → **0 错误**
- `NODE_ENV=development npx oxlint` → **干净**
- `NODE_ENV=development npm run build` → **成功**（precache 12 项）
- 改动仅 4 文件：2 改（SideHabitCard/StoryPanel）+ 2 新增（Collapsible/Modal），diff 28+/28-，范围克制。

## 6. 已知限制 / 残余风险（供体验官走查）
1. **无组件渲染测试**（项目无 React 组件测试 harness，测试全走 `.ts`）。已用 tsc + build + JSX 平衡三重覆盖，但**未见真浏览器点击**。dev server（http://localhost:5173/）可人工走查：故事页打开/关闭全屏覆盖层、支线卡片折叠展开、键盘 Tab+Enter/Space 开关支线。
2. **Collapsible 注入 role/tabIndex/onKeyDown** 仅对**非原生 button** 触发器有意义；对原生 button 触发器（HabitPanel 两处）**不要使用**（会 double-toggle）。此边界已在组件注释说明，但体验官/后续开发者需知悉。
3. **Collapsible 目前仅 SideHabitCard 1 处消费**：为可复用原语但当前覆盖少；若后续要统一原生 `<details>`，需另设「变体」并按各 trigger 样式小心试点（非本阶段）。
4. **Modal 未加 `aria-modal="true"`**：为保守（任务红线"不新增设计"）仅保留原 `role="dialog" aria-label`；如需更强的模态语义可后续补。
5. **Toast / ProgressBar 未抽取**：Toast 已由 P2 `CelebrationToast` 覆盖；ProgressBar 差异大（height 6 vs 8、radius 3 vs 999、flex/none、gradient vs solid、transition vs none）保留原样，属有意克制，非遗漏。

## 提交
`3af0d4c refactor: R13 P7 - extract shared Collapsible & Modal (low-risk pilot, visual unchanged)`
