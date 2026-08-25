# Architecture Decision Records (ADR)

本目录存放本仓库的架构决策记录（ADR）。命名规范：`NNNN-<slug>.md`，从 `0001` 起连续编号。

- 消费规则见 `docs/agents/domain.md`
- ADR 由 `/domain-modeling`、`/grill-with-docs` 等技能在决策落地时惰性创建（lazy creation），无需预先占位
- 当前还没有任何 ADR——当第一个架构决策被记录时，从 `0001-<slug>.md` 开始

## ADR 模板（供创建时参考）

```markdown
# ADR-0001: <决策标题>

## 状态
Accepted（Proposed / Accepted / Deprecated）

## 背景
为什么需要这个决策？什么上下文？

## 决策
我们决定做什么。

## 后果
正面 / 负面后果，以及相关取舍。
```
