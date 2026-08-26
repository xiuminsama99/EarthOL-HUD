# 15: R10b-3 支线打卡时间源统一（防作弊缺口）

**What to build:** R10b-2 引入的副作用——支线习惯打卡用设备时钟 `new Date()` 而非主线使用的网络时间锚点。防作弊体系（网络时间锚点 + 业务日 Asia/Shanghai + 作息切换守卫）是产品核心防线，支线必须与主线同源。

**Status:** done (ab9503c, 277/277 green)

## 修复
- 支线习惯打卡路径（HabitScreen 中 SideHabitCard 的 checkin 调用）改为注入与主线相同的时间源（networkTimeProvider / timeSource）
- 确认支线作息切换当日禁打守卫同样生效（若支线不走 switchSchedule 公共函数，补齐）
- 其余逻辑不动

## 验收
- 现有 277 测试全绿；如支线时间源入 flow 纯函数则补用例
- `npx tsc -b` / `npx oxlint` / build 全绿
- 提交 + push（commit 如 `fix: side-habit checkin uses network-time anchor like main`）
- 更新工单

## 交付汇报
- 修复点、测试变化、提交 hash
