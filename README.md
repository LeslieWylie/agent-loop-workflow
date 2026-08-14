# agent-loop-workflow · 多 agent 协作工作流骨架

[English](README.en.md)

## 这是什么

一个**项目无关**的多 agent 协作工作流骨架。任何由 DRI + review + lead + 运维组成的 agent 小队都能加载它，拿到统一的工作流规则，不必在每个 agent 的 instructions 里各抄一份。

## 核心能力

| 模块 | 内容 |
|------|------|
| **角色拓扑** | DRI（执行者）、reviewer（评审）、lead（决策/路由）、运维（自动化）四类角色及其职责边界 |
| **Loop Guard 六不变量** | 轮次上限、无进展检测、同错熔断、耗时预警、显式退出门、单一权威写入 |
| **标准 handoff 格式** | 负责人/目标/输入/写操作/验收标准/失败证据 六字段交接模板 |
| **风险三档分流** | fast / standard / high 三档，按改动范围自动路由到不同 reviewer |
| **交付顺序** | 验证→commit→push→Draft MR/PR→就绪信号→in_review 固定流程 |
| **review→收口协议** | in_review 自动派发、reviewer 结论 metadata、打回重试、升级机制 |
| **防回环** | 幂等建单、状态变更不触发重复派发、人工来源甄别 |
| **通用红线** | 密钥保密、token 权限分离、破坏性操作确认 |

## 安装

```bash
dsh plugin --profile web add "github:LeslieWylie/agent-loop-workflow"
```

重启后，在任意会话中加载 skill：

```
load agent-loop-workflow
```

## 设计原则

- **项目无关**：只定义协作流程骨架。具体项目的代码坑、评审清单、仓库路径放在各项目自己的 `*-conventions` / `*-engineering` / `*-review-rules` skill 里
- **零依赖**：不需要任何外部服务，只依赖 DSH 的 skill 加载机制
- **不绑定平台**：本 skill 只描述协作流程本身，不指定任何 issue 追踪器或代码托管平台——把「issue」「MR」映射到你自己那套即可。

## 许可证

MIT