---
name: carry-mode
description: 安装 Carry Mode 带飞系统——扫描技能库生成出招表与连招表，注入项目规则文件，让主 Agent 永久接管带飞。
disable-model-invocation: true
---

# Carry Mode 安装程序

用户手动触发，把"带飞调度系统"装进当前项目。你只负责安装；带飞规则在 [AGENTS-RULES.md](AGENTS-RULES.md)，装好后由主 Agent 执行。

## 名词

- 主 Agent = 代练（调度者）、Sub-Agent = 英雄（执行者）、人类 = 老板（拍板者）。
- 带飞 = 接需求 → 选招 → 派发 → 收反馈 → 汇报。
- 出招表 = 技能对照表，单招（平A）可单独触发；连招表 = 预组合命名连招（操作宏）。
- 四件套 = 派活必须绑定 `task + skill + sub_agent + auth`。

## 安装步骤

### 步骤一：开两锁

运行 `.agents/skills/carry-mode/scripts/toggle-invocation.ps1 -Action enable`，开放其他技能的 AI 自动调用（carry-mode 与 ceo-dispatch 永远排除）。两字段：SKILL.md 的 `disable-model-invocation` 与 `agents/openai.yaml` 的 `allow_implicit_invocation`，语义反向，脚本一并处理。

不开则 Sub-Agent 调技能被系统拦（实测确认），带飞跑不通。防乱调靠带飞纪律，不靠锁。

### 步骤二：建出招表

1. 扫 `.agents/skills/*/SKILL.md`，为每个技能把 description 蒸馏成一句中文短功能（动词开头、简短），写 `oneliners.txt`（`技能名=一句话` 每行一条）。
2. 运行 `.agents/skills/carry-mode/scripts/build-movelist.ps1`：读 oneliners.txt + 扫技能库，生成三列出招表（name / 一句话功能 / description）写入 AGENTS-RULES.md 的 `<!-- MOVELIST START/END -->`。构建元数据写 state.txt，不进注入正文。
3. 去冗余：功能重叠或互相包含的技能列给人类拍板是否移除，不自动删。

### 步骤三：编连招表

读出招表，把技能预组合成命名连招，写入 AGENTS-RULES.md 的 `<!-- COMBOS START/END -->`。

**格式**（一行一个，三要素）：
`| 连招名 | 合成序列 | 完成的功能（一句话） |`
- 连招名动词开头、体现组合；`→` 串行、`∥` 并行（并行仅限互不依赖）。
- 档位：🟢 2-3 招、🟡 3-4 招、🔴 5-6 招。

**土狗原则**：80% 为 2-3 招、15% 为 3-4 招、5% 为 5-6 招超必杀；单连招 ≤6 招；总数 7-10 个；触发要清晰（主 Agent 只做选择题，不现编组合）。

**变更检测**：读 state.txt 的 `skillListChanged`——False 且 COMBOS 段非空则保留现有连招；否则重新生成。

### 步骤四：注入项目根目录

运行 `.agents/skills/carry-mode/scripts/inject-rules.ps1`，把 AGENTS-RULES.md `---` 后的正文注入项目根 AGENTS.md 的 `<!-- CARRY-MODE START/END -->` 标记段。幂等：有则替换、无则追加；注入块无时间戳；与 ceo-dispatch 标记段互不覆盖。

### 步骤五：交接

向人类汇报。此后主 Agent 自动读根目录 AGENTS.md，按出招表、连招表、带飞纪律运行，无需再触发本技能。
