# Skill Creator Workspace

这个目录是 Skill Creator HTTP 服务的默认数据层。每个子目录代表一个候选 skill，网页上传的资料写入该候选目录的 `materials/`，系统根据 frontmatter 管理状态，材料足够后自动生成 skill 草案并向用户发起确认。

## 目录模型

```text
data/skill_creator/
├── _template/
└── <skill_slug>/
    ├── index.md
    ├── materials/
    │   ├── text/
    │   ├── audio/
    │   │   ├── <material_id>.md
    │   │   └── uploads/
    │   └── transcripts/
    ├── draft.md
    └── proposal.md
```

`index.md` 是候选 skill 的唯一状态入口。`materials/text/` 存放人工收集的纯文本。`materials/audio/uploads/` 存放录音等原始音频，`materials/audio/<material_id>.md` 记录音频元信息和 ASR 状态。ASR 生成的纯文本放到 `materials/transcripts/`。每份可用于提炼的文本都用 markdown frontmatter 记录元信息。

## Candidate Frontmatter

`index.md` 使用 frontmatter 管理候选 skill 状态：

```yaml
---
slug: workflow_example_skill
title: Example Skill
status: collecting
target_category: Workflow
promotion_intent: auto_propose
requires_user_confirmation: true
rules_target:
created_at: 2026-04-28
updated_at: 2026-04-28
material_count: 0
usable_material_count: 0
---
```

推荐状态：

- `collecting`: 继续收集材料
- `ready_to_draft`: 服务根据材料事实判断已足够，等待自动蒸馏
- `drafted`: 已生成 `draft.md`
- `proposed`: 已生成 `proposal.md`，等待用户确认
- `approved`: 用户确认，可以晋升
- `promoted`: 已写入 `rules/skills/`
- `archived`: 停止处理

## Material Frontmatter

人工文本材料：

```yaml
---
id: 20260428_001
type: text
status: usable
source_file:
source_url:
uploaded_at: 2026-04-28T00:00:00+08:00
topics: []
confidence: medium
asr:
  required: false
  status:
---
```

正文放人工文本、ASR 转录、摘录、用户备注或链接摘要。对于录音转录，`source_file` 指向 `materials/audio/uploads/<filename>`，`asr.status` 记录 `pending`、`done` 或 `failed`。

录音材料：

```yaml
---
id: 20260428_002
type: audio
status: raw
source_file: materials/audio/uploads/20260428_002.m4a
uploaded_at: 2026-04-28T00:00:00+08:00
topics: []
confidence: medium
asr:
  required: true
  status: pending
  transcript_file:
---
```

## HTTP 服务映射

未来 Web 服务可以直接映射到文件状态机：

- `GET /skills`: 读取所有 `*/index.md` frontmatter
- `POST /skills`: 从 `_template/` 创建新候选目录
- `POST /skills/:slug/materials/text`: 创建 `materials/text/<material_id>.md`
- `POST /skills/:slug/materials/audio`: 保存上传文件，创建 `materials/audio/<material_id>.md`
- `POST /skills/:slug/materials/:id/asr`: 写入 `materials/transcripts/<material_id>.md`，更新音频材料的 `asr.status`
- `POST /skills/:slug/draft`: 根据 usable materials 生成或刷新 `draft.md`
- `POST /skills/:slug/propose`: 生成 `proposal.md`，把状态改为 `proposed`
- `POST /skills/:slug/approve`: 用户确认后把状态改为 `approved`
- `POST /skills/:slug/promote`: 写入 `rules/skills/`，更新 `rules/skills/INDEX.md`

## 自动蒸馏规则

自动化可以主动生成草案和提案，但晋升到 `rules/skills/` 必须经过用户确认。默认门槛：

- `usable_material_count >= 2`，或存在一份完整高质量 transcript
- `draft.md` 能清楚说明触发条件、流程、边界和失败模式
- `proposal.md` 明确列出将写入的目标文件和对现有行为的影响

晋升动作只发生在 `status: approved` 且 `requires_user_confirmation: true` 已满足之后。
