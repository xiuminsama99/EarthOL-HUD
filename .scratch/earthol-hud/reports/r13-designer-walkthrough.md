# R13 重构后 · 游戏设计师走查报告（回归验证）

> static walkthrough（无 shell，未跑 dev server/vitest，基于 src/** 行级 code review）。运行时回归需 supervisor 跑命令确认。

## 结论
**R13 重构后整体视觉一致性是「更统一」，不是更乱；重构未引入任何视觉回归或机制不诚实。**
theme.ts 把分散在十几个文件的主色调收拢成单一来源 COLORS，各屏灰字/紫强调/绿成功/金警示/红危险语义一致，无颜色打架。机制诚实保住：打卡/储蓄/休息/保底/明日预告/成就判定/庆祝 toast 文案行为对齐真实结果。

**评分参考历史口径：视觉 7.5/10（比 refactor 前更整齐），机制诚实未破坏（R13 面满分），游戏感闭环（庆祝 toast/进度条/成就墙/音效/成长 ✨）仍完整。**

## 一、视觉一致性（确认协调）
- 深色全局统一（body 径向 #12122a，#root 限宽 480 居中，无白底残留）
- 主面板统一（panelPage/panelScreen/panelCard 全是 panelBg/cardBg 系）
- 强调/状态色统一（主 CTA accent #7c5cff 紫+白字；成功绿/警示金/危险红语义一致）
- 弱文字/边框统一（#8b8ba3 / #2c2c4a 贯穿）
- celebrationPop 动画 + playChime 音效仍在，奖励即时反馈闭环没拆掉

## 二、无设计回归
StatCard 两态、FeedbackBanner ok/compact、Modal overlay(rgba(8,8,18,.92))、Collapsible（只补语义不改 trigger 视觉）、panelScreen 给 OneTapButton 预留 paddingBottom:120——全部与调用方原用法一一对应，无样式错位/丢失。

## 三、机制诚实未破坏（红线）
- 打卡：达标 `今日达标 ✓`/未达标 `做了 X / 目标 Y，明天继续（进度冻结）`/超额储蓄 `超额 X 中 Y 已存为休息券`（Y=min(超额,目标) 防刷币）
- 休息：用券 -1、券不足明确指导；做1个免券但拉低 7 天行动率（两行小字如实说明）
- 明日目标诚实：planToday 用 postCheckin 状态算真实 tomorrowTarget（修复 R11「预告6实际11」）
- 奖券通胀修复仍在：streakCoin 用不被窗口裁剪的原始 streakDays
- 成就诚实：computeAchievements 只按真实 earnedAt 点亮，未达成 ???
- 庆祝只真达成时触发：minimal/quit-maintain 提前 return 不弹，warning→储蓄/formed→养成/ok→达标，无假成功

**R13 未破坏任何机制诚实——最要紧的一条，确认无恙。**

## 四、游戏感闭环
成就墙 + 一年之约进度条（linear-gradient #7c5cff→#7ee0a8）+ 庆祝 toast（rise+fade）+ 音效（不同音高）+ 宠物成长 ✨——R13 后全保留、无断链。

## 五、发现的轻微问题（未到必须修，均非 R13 回归）
1. **P2**：选中/激活态背景色两处差一位—CreateHabitForm `#241a4a` vs AdoptPet `#241b4a`，肉眼几乎无差，建议统一 accent-tint token。
2. **P2**：若干「语义变体色」仍在文件裸写未进 theme（#181830 卡底 / #a9a9c4 次弱文字 / #241a3e 渐变尾 / #9d8bff 等浅紫变体 / heatmap 档位色 / story 状态色 #7cc7d9）。不造成颜色打架，且部分（反愿景忧伤紫/数据档位/状态色）本就有意，列为 P2 建议。
3. **P2**：CreateHabitForm 提交钮、HabitScreen「我的故事/再加一个」仍内联 #7c5cff 而非复用 primaryBtn/token，值与 theme 一致零视觉差异，只是未吃到 token 红利。
4. **P2（无害）**：CelebrationToast 带 `className="celebration-toast"` 但 CSS 无该规则，动画靠内联 animation 驱动，功能正常，仅多空类名。

## 特别标注（红线核查结果）
- **未发现 R13 引入的视觉回归**（无颜色打架/无样式错位/无样式丢失）
- **未发现 R13 引入的机制不诚实**（打卡/储蓄/休息/保底/预告/成就/庆祝全部如实）

## 遗留风险（非 R13 引入，供上级知悉）
- **负向习惯（戒除）被「超额→储蓄券」奖励扭曲**（pre-existing 引擎语义）：对戒除习惯，「超额」= 做了**更多**坏习惯（amount > 当天允许量），引擎仍进入 warning 并给 min(超额,目标) 张休息券（UI「多做了？」折叠也允许精确输入大数）。等于「坏习惯做多了反而攒券」，机制自相矛盾。属老问题、非本轮回归，但作为设计师必须点名。
- 同理，戒除日 amount < 目标被判「未达标」（`做了 X / 目标 Y，明天继续`），虽不惩罚，但「少做了坏事」读起来像「没达标」。也非 R13 改坏，建议后续单独评估（负向习惯 over/under 判定口径）。

## 结论
- **视觉一致性**：比 refactor 前更统一，仅剩少量语义变体色未收进 theme（P2 优化项，不构成回归）。
- **机制诚实**：保住（R13 面零破坏，红线未触碰）。
- 唯一需人类点头：遗留风险「负向习惯超额奖励」（老问题，建议单独开单评估）；以及受限于无 shell 未能运行时验证 dev server。
