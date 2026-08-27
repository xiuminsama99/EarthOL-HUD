# R13 P5 结果报告：storage 分层（schema / migrations / 读写桶）

## 本次改动
纯代码重组，**行为零改动**，把 `src/storage/storage.ts`（原 476 行）四类职责拆成三层：

| 文件 | 职责 | 行数 | 说明 |
|---|---|---|---|
| `storage/types.ts`（保留） | 领域数据模型 | 140 | **未动** |
| `storage/schema.ts`（新） | schema 表达式 + 序列化 + 校验 | 217 | 纯函数，无副作用、无 IO |
| `storage/migrations.ts`（新） | 版本迁移 `migrations` | 28 | 自包含，只依赖数据形状约定 |
| `storage/storage.ts`（改） | 读写层 + **重导出桶** | 267 | `StorageBackend`/`defaultBackend`/`EarthStorage`/`earthStorage` |

拆分后合计 512 行（原 476）——多出的行来自新文件的注释头与显式 import/re-export，属合理的分层代价。commit `753671d`，已推送。

## schema.ts → 导出的符号
`STORAGE_KEY`、`CURRENT_VERSION`、`DEFAULT_SETTINGS`、`emptyData`、`ParseErrorCode`（type）、`serializeData`、`parseData`、`isRecord`、`validateData`。
- `normalizeHabit/Checkin/Settings/AuditScores/Profile` 留在 schema.ts 内部（仅 `validateData` 用），故**未污染桶**。

## storage.ts → 重导出桶（关键）
```
export * from './schema'
export { migrations } from './migrations'
```
- **测试依赖符号全保住**：`CURRENT_VERSION / DEFAULT_SETTINGS / EarthStorage / STORAGE_KEY / emptyData / migrations / parseData / serializeData` 全部可经 `./storage` import。
- `onboardingFlow.test` 依赖的 `EarthStorage / STORAGE_KEY / CURRENT_VERSION` 亦经 `./storage` 保住。
- `HabitScreen` 的 `earthStorage / parseData / serializeData`、各 `*Flow.ts` 的 `EarthStorage`（type/class）、各 `Screen` 的 `earthStorage` 全部经桶保住。
- **`migrations` 是同一 live 引用**：storage.ts 用 `export { migrations } from './migrations'`（re-export 转发 binding，非浅拷贝/解构），storage.test 的 `delete migrations[0]` / `migrations[0] = ...` 在 **334 全绿**下直接证明生效。

## 字段保留（用户拍板：不做任何删除）
- ✅ `personaName`：仍在 `schema.ts` 的 `normalizeProfile`（1 处），**保留**。
- ✅ `globalPercent` / `achievedRate`：仍在 `scaleFlow.ts`（7 处），本阶段未触碰，**保留**。

## 循环依赖检查
- schema.ts → `./types` + `../engine/types`（无回指）
- migrations.ts → 无 import（自包含）
- storage.ts → `./schema` + `./migrations`
- **无循环**。`parseData`/`validateData`/`isRecord` 同文件内互相引用，可解。

## 验证
- `NODE_ENV=development npx vitest run` → **334 全绿**（12 文件）
- `NODE_ENV=development npx tsc -b` → **0 错误**（证明重导出 typing 完整、无未定义引用/未使用 import）
- `NODE_ENV=development npx oxlint` → **干净**
- `NODE_ENV=development npm run build` → **成功**（precache 12 项）
- 关键：`storage.test.ts`(665) + `onboardingFlow.test.ts` 原样绿（正是依赖桶重导出 + `migrations` live 引用的两条测试）。

## 遇到的分歧点解决
1. **`isRecord` / `validateData` 归属**：`isRecord` 被 schema 的 parseData/validateData 与 storage 的 read() 都用；`validateData` 被 read() 用。为避免重复定义，把二者放在 schema.ts 并 `export`，storage.ts 显式 import + 顺带经 `export *` 流出桶（对测试无影响的**增量**导出）。
2. **`migrations` 可变异对象**：storage.test mutate 它。用 `export { migrations } from './migrations'` 保同一 live binding，测试绿即证明生效。若误用 `export const migrations = [...migrations]` 拷一份，`delete migrations[0]` 会失效——已规避。
3. **外部直接 import schema/migrations 吗？** 扫描发现所有消费方都 import `./storage`（或 `storage/storage`），无一直接 import 拆分后的子模块，故 `./storage` 桶是唯一入口，无破窗。

## 已知限制 / 残余风险
1. **无组件渲染测试**：本项目无 React 组件测试 harness，测试全走 `.ts` 逻辑。P5 是纯模块重组，storage.test 已直接覆盖分层后的行为；但**未见真浏览器**读写 localStorage 的端到端点击验证。dev server（http://localhost:5173/）可用，可人工走一遍：新建习惯 → 刷新（持久化）→ 导出/导入。
2. **桶 `export *` 为增量导出**：`./storage` 现在额外导出 `isRecord`/`validateData`/`ParseErrorCode`。属**纯增量**、不改任何既有符号名，对测试/消费方无影响；若团队偏好收窄公开面，可后续改为显式 `export { x, y } from './schema'`（本阶段保持 `export *` 最稳妥，不给既有 import 留断点）。
3. **行数略增**（476→512）：来自分层注释/import/re-export，非逻辑膨胀。若在意，可后续压缩注释。

## 提交
`753671d refactor: R13 P5 - split storage into schema/migrations/storage (barrel re-export keeps tests green)`（已推送）
