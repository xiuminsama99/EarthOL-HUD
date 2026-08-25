# AGENTS

<!-- CARRY-MODE START -->
> **每轮对话开始时，阅读一遍本文件。**

## Carry Mode（带飞模式）

只带飞不执行：接需求 → 选招 → 派发 Sub-Agent → 收反馈决策 → 汇报人类。

### 出招表

所有已安装技能的 name + 一句话功能 + description 对照表。一句话功能是路由短信号，单招（平A）可单独触发。

<!-- MOVELIST START -->
| 技能名 (name) | 一句话功能 | 效果 (description) |
|---|---|---|
| ask-matt | 推荐适合当前情况的技能或流程 | Ask which skill or flow fits your situation. A router over the skills in this repo. |
| carry-mode | 安装带飞系统并注入项目规则 | 安装 Carry Mode 带飞系统——扫描技能库生成出招表与连招表，注入项目规则文件，让主 Agent 永久接管带飞。 |
| codebase-design | 给出深模块设计的共享词汇与改进思路 | Shared vocabulary for designing deep modules. Use when the user wants to design or improve a module's interface, find deepening opportunities, decide where a seam goes, make code more testable or AI-navigable, or when another skill needs the deep-module vocabulary. |
| code-review | 双轴审查某点以来的变更（标准+规格） | Review the changes since a fixed point (commit, branch, tag, or merge-base) along two axes: Standards (does the code follow this repo's documented coding standards?) and Spec (does the code match what the originating issue/spec asked for?). Runs both reviews in parallel sub-agents and reports them side by side. Use when the user wants to review a branch, a PR, work-in-progress changes, or asks to \"review since X\". |
| diagnosing-bugs | 诊断疑难 bug 与性能回归 | Diagnosis loop for hard bugs and performance regressions. Use when the user says "diagnose"/"debug this", or reports something broken/throwing/failing/slow. |
| domain-modeling | 构建打磨项目领域模型 | Build and sharpen a project's domain model. Use when discussing codebase terminology, writing or editing a CONTEXT.md, or recording or editing an ADR. |
| grilling | 拷问用户的计划、决定或想法 | Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases. |
| grill-me | 拷问打磨计划或设计 | A relentless interview to sharpen a plan or design. |
| grill-with-docs | 边拷问打磨边产出 ADR 与术语表 | A relentless interview to sharpen a plan or design, which also creates docs (ADR's and glossary) as we go. |
| handoff | 压缩当前对话为交接文档 | Compact the current conversation into a handoff document for another agent to pick up. |
| implement | 按规格或工单实现功能 | Implement a piece of work based on a spec or set of tickets. |
| improve-codebase-architecture | 扫描代码库深化机会并出可视化报告 | Scan a codebase for deepening opportunities, present them as a visual HTML report, then grill through whichever one you pick. |
| prototype | 建一次性原型验证设计问题 | Build a throwaway prototype to answer a design question. Use when the user wants to sanity-check whether a state model or logic feels right, or explore what a UI should look like. |
| research | 用一手资料调研并落 Markdown 存档 | Investigate a question against high-trust primary sources and capture the findings as a Markdown file in the repo. Use when the user wants a topic researched, docs or API facts gathered, or reading legwork delegated to a background agent. |
| resolving-merge-conflicts | 解决进行中的 git 合并冲突 | Use when you need to resolve an in-progress git merge/rebase conflict. |
| setup-matt-pocock-skills | 初始化工程技能套件（tracker/标签/领域文档） | Configure this repo for the engineering skills: set up its issue tracker, triage label vocabulary, and domain doc layout. Run once before first use of the other engineering skills. |
| tdd | 测试先行地开发功能或修 bug | Test-driven development. Use when the user wants to build features or fix bugs test-first, mentions "red-green-refactor", or wants integration tests. |
| teach | 在工区内教用户新技能或概念 | Teach the user a new skill or concept, within this workspace. |
| to-questionnaire | 把悬而未决的决定转成问卷 | Turn a decision you can't fully answer into a questionnaire for someone else to fill in. |
| to-spec | 把对话合成 spec 发布到工单系统 | Turn the current conversation into a spec and publish it to the project issue tracker: no interview, just synthesis of what you've already discussed. |
| to-tickets | 把计划拆成带依赖的工单集 | Break a plan, spec, or the current conversation into a set of tracer-bullet tickets, each declaring its blocking edges, published to the configured tracker (edges as text in one file per ticket locally, or native blocking links on a real tracker). |
| triage | 分类验证 issue 与 PR 并写简报 | Move issues and external PRs through a state machine of triage roles, categorise, verify, grill if needed, and write agent-ready briefs. |
| wait-what | 重新表述上一条没送达的消息 | Stop. That last message did not land: re-pitch it. |
| wayfinder | 用决策工单地图规划超大型工作 | Plan a huge chunk of work (more than one agent session can hold) as a shared map of decision tickets on your issue tracker, and resolve them one at a time until the way to the destination is clear. |
| wizard | 生成交互式向导引导人工步骤 | Generate an interactive bash wizard that walks a human through steps only they can perform. Use when provisioning infrastructure, setting up credentials or CI secrets, walking an unfamiliar third-party dashboard, or running a one-off migration or cutover. Don't invoke this for steps the agent can perform itself. |
| writing-for-agents | 按 agent 视角撰写修改文档 | Writing documents for agents. Use when creating or editing skills, or modifying AGENTS.md or CLAUDE.md. |
<!-- MOVELIST END -->

### 连招表

命名的技能组合（操作宏）。先选连招，按合成序列派活。`→` 串行，`∥` 并行。🟢 基础（2-3 招）、🟡 进阶（3-4 招）、🔴 超必杀（5-6 招）。

<!-- COMBOS START -->
| 连招名 | 合成序列 | 完成的功能（一句话） |
|---|---|---|
| 🟢 需求定稿 | grilling → to-spec | 拷问打磨模糊需求并合成 spec 发工单 |
| 🟢 排期开工 | to-tickets → implement | 把计划拆成带依赖工单并逐一实现 |
| 🟢 快速除虫 | diagnosing-bugs → tdd | 定位疑难 bug 后测试先行修复 |
| 🟢 审查交接 | code-review → handoff | 双轴审查变更并压缩成交接文档 |
| 🟢 调研落档 | research → domain-modeling | 一手资料调研并把结论沉淀进领域文档 |
| 🟢 打磨模型 | grill-with-docs → domain-modeling | 边拷问边产出 ADR/术语表并打磨领域模型 |
| 🟢 接单派活 | ask-matt → to-spec → to-tickets | 选对流程、定 spec、拆工单三步走 |
| 🟢 平冲突稳上线 | resolving-merge-conflicts → code-review → handoff | 解决合并冲突、审查结果、交接文档 |
| 🟡 全流程交付 | triage → to-spec → to-tickets → implement | 分类验证需求后从 spec 一路实现到交付 |
| 🔴 深度改造超必杀 | improve-codebase-architecture → codebase-design → prototype → tdd → code-review → handoff | 扫深化机会、定设计、原型验证、测试驱动、审查、交接 |
<!-- COMBOS END -->

### 带飞流程

#### 步骤零：捋操作流程

派活前，先把新功能与已有功能串起来，把用户从打开到完成的每一步操作流程完整说一遍；确认新需求与已有功能的操作逻辑前后配合合理，才可派活。

#### 步骤一：接需求，判断大小

- 脆皮（需求明确、体量小）：查连招表选一套匹配连招，直接放。
- 坦克（需求模糊、复杂）：打消耗战——拆成多轮，每轮一个 2-3 招短连招，打完一轮停下汇报，人类确认后打下一轮，每轮可纠偏。
- 连招表无匹配：查出招表单招触发，或临时组招；用顺手的临时组招沉淀回连招表（土狗原则：短、串行为主、有名字、有功能说明）。

#### 步骤二：点名派发

1. 说出选择理由："选 X 因为当前任务是 Y"
2. 派发指令：动词 + 对象 + 结果，只说做什么
3. 绑定四件套（task + skill + sub_agent + auth），派给 Sub-Agent

完成标准：理由已说出、四件套齐备。说不出理由，重新选招。

#### 步骤三：收反馈决策

按连招合成序列执行：`→` 等前一步完成再派下一步，`∥` 同时派发。独立任务并行，有依赖串行。

- 反馈不合格：同招重派，最多 3 次；连续 3 次失败上报人类。
- 反馈合格：按序列派下一招；连招打完，任务未完则选下一套连招或单招，任务完成则汇报。

完成标准：每个反馈已处理（合格派后置 / 不合格重派 / 失败上报）。

#### 步骤四：汇报人类

生成战报。

完成标准：战报已交付。

### 必须请示人类

涉及人类拍板的问题，向人类推荐解决方案，其他问题自行推理解决。

- 需求目的不明确
- 涉及优先级、时机判断
- 逻辑不清晰
- 判断不明确，模棱两可
- 连续重试仍失败

***

**每轮对话开始时，阅读一遍本文件。**
<!-- CARRY-MODE END -->

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature>/`（本地 Markdown tracker）。See `docs/agents/issue-tracker.md`.

### Triage labels

五个规范角色映射到默认标签：`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`。See `docs/agents/triage-labels.md`.

### Domain docs

Single-context 布局：根目录一个 `CONTEXT.md` + `docs/adr/` 存放 ADR。See `docs/agents/domain.md`.
