# 16: R10b-4 宠物情感化 + 「我的故事」时间线

**What to build:** 兑现"陪你 365 天"的承诺 + 让打卡语成为可回看的资产。四视角体验官发现：
- 宠物是装饰条：心情只涨不跌（漏 5 天毫无反应）、无互动（不能摸/不能喂）、"陪你 365 天"是文案吹牛
- 打卡语只能看最新一条，想回看"第 3 天我写了啥"无入口（存储有全部记录，无 UI）

**Status:** done

## A. 宠物情感化（petFlow + PetCard）

### A-1 心情衰减（漏卡有反应）
- 现有：打卡 +4 / 超额 +6 / 缺勤归来 -4 / 休息 ±0；漏卡再多心情不掉
- 改：连续未行动（漏卡）次日开始心情 -2/天（每天打开时结算），封顶 -20（不会饿死/归零，符合不惩罚）；打卡回归 +6（比日常 +4 略高，体现"你回来了"）
- 心情文案：低于 40 换低落文案（"糯米有点想你"）；回归打卡时开心文案（"糯米眼睛一亮"）
- 结算时机：打开主界面时（与现有 bump 逻辑一致），记入 mood 衰减记录可测

### A-2 互动（每天一次摸头）
- 主界面宠物卡片加「摸摸头」按钮：每天一次，心情 +2（当天已互动则禁用/提示"它今天已经蹭过你手心了"）
- 互动次数入档案（pet.interactDate 最后互动日）

### A-3 成长形态（21 天养成兑现）
- 宠物按养成线成长：未养成（幼年形态）→ 已养成（成长形态——SVG 尺寸/装饰变化，如猫的耳朵更精神/狗尾巴大/恐龙背鳍亮）
- 引擎已有 isFormed；PetArt 接收 formed 状态渲染差异即可（纯视觉）

## B. 「我的故事」时间线（打卡记录回看）

- 主界面打卡语区改为可点击入口：「我的故事」→ 全屏/弹层时间线：按日期倒序列出打卡语（行动/休息/最低版本/超额），每条含日期 + 习惯名 + 状态颜色
- 数据源：storage 现有 checkin 记录（确认字段：date/note/habitId/result），按天聚合多习惯
- 顶部统计：总天数 / 总打卡次数 / 休息券使用次数
- 编辑/删除单条：**仅限当天条**（历史合规留痕，防作弊体系不破坏——编辑当天记录走现有打卡撤销语义，历史只读）
- 纯 UI + 读函数（getStoryTimeline 入 habitFlow/petFlow 可测）

## 验收
- 现有 277 测试全绿 + 新增：心情衰减结算（连漏 3 天 -6、回归 +6、封顶 -20）、摸头每日一次、成长形态标志、时间线聚合排序
- `npx tsc -b` 0 错误；`npx oxlint` 干净；`NODE_ENV=development npm run build` 成功
- 提交 + push（commit 如 `feat: pet emotions - miss-you decay, daily petting, growth form; story timeline for checkin notes`）
- 更新工单 + analysis-features.md

## 交付汇报
- 心情规则变更对照（旧→新）
- 时间线数据源与聚合逻辑
- 测试变化 + 提交 hash

---

## ✅ 完成（2026-08）
**306/306 测试全绿**（+29：12 宠物情感化 + 17 故事时间线）· tsc/oxlint/build 全绿

### 心情规则对照（旧→新）
| 项 | 旧 | 新 |
|---|---|---|
| 缺勤归来打卡 | -4（低落） | **+6**（回归是开心，比日常 +4 略高） |
| 连漏衰减 | 无（心情只涨不跌） | 打开主界面结算 **-2/天**，封顶 -20 不归零 |
| 摸头互动 | 无 | 每天一次 **+2**，同日重复被拒 |
| 心情文案 | <20 低落 | <40 且带名字→「XX有点想你」；回归 +6 |
| 成长形态 | 无 | 任一习惯养成后 PetArt 叠加 ✨（兑现「陪你 365 天」） |

### 我的故事时间线
- **数据源**：全部打卡记录（CheckinRecord：businessDate/note/habitId/restDay/mode/amount/targetAmount）
- **getStoryTimeline**（storyFlow 纯函数）：按业务日倒序分组、同日习惯名排序；顶部统计（行动天数=有行动非休息的业务日数 / 打卡次数 / 休息券使用次数）
- **状态色**：达标绿 / 未达标红 / 超额金 / 休息灰 / 最低版本青
- **当天编辑/删除守卫**：仅 businessDate === 今天 可编辑 note / 删除（删除后可重新打卡走 performCheckin 守卫）；**历史只读**（防作弊体系不破坏）

### 关键文件
- `src/features/pet/petFlow.ts`（mood 规则/衰减/摸头）+ `PetCard.tsx` + `PetArt.tsx`
- `src/features/story/storyFlow.ts` + `storyFlow.test.ts` + `StoryPanel.tsx`
- `src/storage/types.ts`（Pet 增 lastMoodSettleDate/lastPettedDate）+ `storage.ts`（updateCheckinNote/removeCheckin）
- `HabitScreen.tsx`（app-open 衰减结算 effect + 「我的故事」入口/覆盖层）
