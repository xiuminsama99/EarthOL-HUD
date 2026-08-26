# 17: R10b-5 数据安全感 + 游戏化薄层 + 深色背景

**What to build:** 收尾四视角反馈剩余项：
- 数据只活在 localStorage（无导出/无同步/无告知）——价值审查员："最大的硬伤"
- 零游戏感：无音效/动效/动画，达标只有文字——游戏设计师："把 Excel 规则表套了层深色皮肤"
- 深色卡片浮在白底（index.css 模板残留）——多人发现

**Status:** Done（2026-08 已落地，314 测试全绿，提交 `R10b-5` 见 git log）

> 已完成，交付记录见 analysis-features.md 迭代记录 R10b-5 条目。

## A. 数据导出/导入 + 告知
- 设置区加「数据」块：
  - 「导出存档」（下载 JSON 文件：完整 EarthData，含版本号）
  - 「导入存档」（读 JSON 文件：校验版本/结构，确认弹窗后覆盖——覆盖前自动导出一份备份文件名带时间戳）
  - 设置区醒目小字：「你的数据保存在本机浏览器（localStorage），导出可备份或迁移设备」——诚实告知
- 纯函数（serializeData/parseData 校验）入 storage 层 + 测试（导出→导入 round-trip、损坏 JSON 拒绝、版本不匹配拒绝）

## B. 游戏化薄层（零素材成本）
- **达标撒币音效**：Web Audio API 合成短音（不引音频文件），打卡成功/超额/休息各一个音（差异音高）；默认**开**，设置里可关（「音效」开关，默认开但引导后第一次打卡前弹一次说明？不弹——直接默认开+设置可关）
- **达标动效**：一键打卡瞬间按钮上轻量撒币 CSS 动画（emoji ✨ 或用纯 CSS 粒子，不引素材；精简实现：按钮文字闪金光 + 打卡语区短暂高亮）
- 实现放 util（playChime(level) 纯 Web Audio），UI 调用；测试：音效函数不做单测（无法 headless audio，标注），动效为纯 CSS
- 设置加「音效」开关持久化（settings.soundOn，默认 true）

## C. 全局深色背景
- 清理 index.css 模板残留（白底、#root 边框线、1126px 限宽）——全屏深色渐变（#141428 底 + 径向光晕），卡片化内容
- 检查明暗主题默认深色（当前浅色系统下白底刺眼）

## 验收
- 现有 306 测试全绿 + 新增（序列化 round-trip/损坏拒绝/版本拒绝）
- `npx tsc -b` 0 错误；`npx oxlint` 干净；`NODE_ENV=development npm run build` 成功
- 提交 + push（commit 如 `feat: data export/import + sound feedback layer + full dark theme`）
- 更新工单 + analysis-features.md

## 交付汇报
- 导入校验规则、音效/开关实现、背景改动点
- 测试变化 + 提交 hash + 已知限制（音效无法单测等）
