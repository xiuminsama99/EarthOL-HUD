# 13: R10b-1 一年之约（年度大目标面板）

**What to build:** 把等差数列的复利力量可视化——主界面新增「一年之约」年度成就面板。用户核心诉求：让用户看到"坚持一年 = 多少总量"的震撼大数（小目标每天多做一个 + 上限可定 + 漏卡从总数扣但总量依然巨大）。

**Status:** ready-for-agent

## 设计

主界面新增「一年之约」面板（习惯卡片上方或天平下方，放主界面顶部区域）：

```
🏆 一年之约
坚持一年 = 66,795 个俯卧撑        ← 大目标（等差数列总和，触达上限则恒定）
████████░░░░░░  3,724 / 66,795   ← 进度条（已累计 / 理想年度总量）
今天 30 个（第 30 天）· 上限 50   ← 小目标 + 递减 + 上限
```

## 一、引擎新增投影函数（测试接缝）

`projectAnnual(state, businessDate)` → `{ idealAnnual, projectedAnnual, achievedTotal, dayIndex }`：

- **idealAnnual（理想年度总量）**：假设第 1 天起按理想轨迹执行 365 天的总和——每天目标 = min(base + (day-1), cap)，365 天累加。无 cap = 等差和（1+2+…+365 = 66,795 当 base=1）；有 cap = 触顶后恒定段。**这个数字恒定不变（愿景）**
- **achievedTotal（已累计）**：state.totalAmount（历史累计量）
- **projectedAnnual（预计年度总量）**：achievedTotal + 从现在起（次日开始）按当前轨迹到第 365 天的总和——当前轨迹起点 = 今日目标值（考虑回退后），递增到 cap。**漏卡/回退时此值下降（体现"从总数扣"），但不归零、总量依然巨大**
- **dayIndex**：当前是第几天（从创建日起；无创建日数据时用 actionCount/已知数据近似，迁移写明）

注意：
- 若 cap 支持"固定目标"，理想/预计都按 cap 恒定计算
- 戒除（反向）习惯：年度总量语义不同——可用持平/负向表述（或沿用工单 12 的 yearlyEffect 方向分叉：戒除显示"一年能省出 X"的净值口径，ideal/projected 对戒除显示"省出"值），保证方向正确
- 引擎测试：base=1 无 cap → ideal=66,795；cap=30 → 触顶恒定段正确；中途第 30 天 → 预计=已累计+（30→365 轨迹）；漏卡回退后预计 < 未漏卡预计；戒除方向 sum 正确

## 二、UI 面板（AnnualGoalPanel 组件）

- 大数字「坚持一年 = X 单位」（formatted 千分位）
- 进度条：achievedTotal / idealAnnual（百分比）
- 副行：「今天 N 个（第 M 天）· 上限 C」；无上限则不显示上限
- 漏卡/回退时（projectedAnnual < idealAnnual）：面板底部小字「漏了几天，年度预估少了 Z 个——但一年依然是 X 大数，继续就好」（Z = ideal - projected，不吓人、量级对比）
- 与现有 yearlyEffect/「365 累计」文案对齐：若已有重复文案（如打卡语/习惯卡片内 365 累计），统一指向面板或移除重复，避免数字打架（体现 R10a 口径一致性）
- 放置：主界面（habit 列表区之上），移动端自上而下顺序合理
- 组件无独立测试设施，逻辑全部走引擎投影 + 面板纯渲染；文案进 flow（如 buildAnnualPanelCopy）可测

## 三、验收
- 250 现有测试保持全绿 + 新增投影用例（>=8 个：等差/封顶/中途/回退/戒除/边界 dayIndex）
- `npx tsc -b` 0 错误；`npx oxlint` 干净；`NODE_ENV=development npm run build` 成功
- 提交 + push（commit 如 `feat: one-year pact - annual grand-total panel with arithmetic-progression projection`）
- 更新工单 + analysis-features.md（R10b-1 记录）

## 四、交付汇报
- 投影函数签名与语义、公式说明（含 cap 处理、dayIndex 来源、迁移）
- 面板文案（旧→新如有替换）
- 测试变化
- 提交 hash
