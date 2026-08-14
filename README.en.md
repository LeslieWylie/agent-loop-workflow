# agent-loop-workflow · Multi-Agent Collaboration Workflow Skeleton

[简体中文](README.md)

## What is this

A **project-agnostic** multi-agent collaboration workflow skeleton. Any agent squad composed of DRI + reviewer + lead + ops can load it to get consistent workflow rules, without duplicating them across every agent's instructions.

## Core Capabilities

| Module | Content |
|--------|---------|
| **Role Topology** | DRI (doer), reviewer, lead (decision/routing), ops (automation) — four roles with clear responsibility boundaries |
| **Loop Guard (6 invariants)** | Turn limit, progress stall detection, repeated error fuse, timeout warning, explicit exit gate, single authoritative writer |
| **Standard Handoff Format** | 6-field handoff template: owner, goal, input, permitted writes, acceptance criteria, failure evidence |
| **Risk-based Routing** | fast / standard / high lanes, routing to different reviewers based on change scope |
| **Delivery Sequence** | verify → commit → push → Draft MR → /ready → in_review (fixed order) |
| **Review→Close Protocol** | Automatic in_review dispatch, reviewer metadata, reject/retry, escalation |
| **Anti-loop Protection** | Idempotent issue creation, state-change filtering, human-source-only new task trigger |
| **Red Lines** | Secret isolation, token permission separation, destructive operation confirmation |

## Install

```bash
dsh plugin --profile web add "github:LeslieWylie/agent-loop-workflow"
```

After restart, load the skill in any session:

```
load agent-loop-workflow
```

## Design Principles

- **Project-agnostic**: Only defines collaboration flow rules. Project-specific knowledge goes in `*-conventions` / `*-engineering` / `*-review-rules` skills
- **Zero dependencies**: No external services required, only the DSH skill loading mechanism
- **Complementary to octo-loop**: octo-loop provides Octo infrastructure operations, this skill provides collaboration flow rules

## License

MIT