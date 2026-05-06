# Skill Creator Workspace

这个目录是 Skill Creator HTTP 服务的默认数据层。每个子目录代表一个候选 skill，网页上传的资料写入该候选目录的 `materials/`，系统根据 frontmatter 管理状态，并可自动生成 skill 草案。

## 目录模型

```text
data/skill_creator/
├── _template/
└── <skill_slug>/
    ├── index.md
    ├── draft.md
    ├── published.md
    └── materials/
        └── <material_id>.md
```

`index.md` 是候选 skill 的唯一状态入口。`draft.md` 保存用户可审阅的草案，草案内可同时包含可发布内容和草案评审信息。`published.md` 保存最近一次发布到 rules skill 目录的快照。`materials/` 是扁平目录，存放收集的素材 markdown 文件。每份可用于提炼的素材都用 markdown frontmatter 记录元信息。

## Candidate Frontmatter

`index.md` 使用 frontmatter 管理候选 skill 状态：

```yaml
---
slug: workflow_example_skill
title: Example Skill
status: collecting
target_category: Workflow
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
- `promoted`: 已写入 `rules/skills/`

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

正文放人工文本、ASR 转录、摘录、用户备注或链接摘要。对于录音转录，`source_file` 指向后端保存的上传文件，`asr.status` 记录 `pending`、`done` 或 `failed`。

录音材料：

```yaml
---
id: 20260428_002
type: audio
status: raw
source_file: uploads/20260428_002.m4a
uploaded_at: 2026-04-28T00:00:00+08:00
topics: []
confidence: medium
asr:
  required: true
  status: pending
  transcript_file:
---
```

## Draft 与 Published

`draft.md` 约定包含：

- `## Publishable Skill`: 可独立运行的 skill 内容
- `## Draft Review`: 用户可见的草案评审信息
- `### Material Coverage`: 素材覆盖说明
- `### Refinement Notes`: 后续补充建议

发布时只把 `Publishable Skill` 内容写入 `rules/skills/`，并把同样内容写入 `published.md` 快照。草案评审信息不应成为运行时 skill 指令。

## HTTP 服务映射

Web 服务直接映射到当前文件状态机：

- `GET /skills`: 读取所有 `*/index.md` frontmatter
- `POST /skills`: 从 `_template/` 创建新候选目录
- `POST /skills/:slug/materials/text`: 创建 `materials/<material_id>.md`
- `POST /skills/:slug/draft`: 根据 usable materials 生成或刷新 `draft.md`
- `POST /skills/:slug/promote`: 经过 admin token 校验后写入 `rules/skills/`，更新 `rules/skills/INDEX.md` 和 `published.md`
- `POST /skills/:slug/use`: 使用 draft 或 published 内容进行只读对话

## 自动蒸馏规则

自动化可以主动生成草案，但晋升到 `rules/skills/` 必须经过 admin token 校验。默认门槛：

- `usable_material_count >= 2`，或存在一份完整高质量 transcript
- `draft.md` 的 `Publishable Skill` 能清楚说明触发条件、流程、边界和失败模式
- `Draft Review` 能明确说明素材覆盖和继续完善方向
