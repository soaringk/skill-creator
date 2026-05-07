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
output_language: 中文
rules_target:
created_at: 2026-04-28
updated_at: 2026-04-28
---
```

推荐状态：

- `collecting`: 继续收集材料
- `ready_to_draft`: 服务根据材料事实判断已足够，等待自动蒸馏
- `drafted`: 已生成 `draft.md`
- `promoted`: 已写入 `rules/skills/`

## Material Frontmatter

`materials/` 目前只保存可用于生成 skill 的文本材料。录音和音频上传只用于 ASR 填充文本框；用户确认保存后，才会成为 text material。

```yaml
---
id: 20260428_001
type: text
uploaded_at: 2026-04-28T00:00:00+08:00
confidence: medium
---
```

字段含义：

- `id`: material 文件名和前端短标识来源
- `type`: 目前固定为 `text`
- `uploaded_at`: 保存时间
- `confidence`: 用户给出的素材权重，供 draft agent 参考

正文放人工文本、ASR 转录、摘录、用户备注或链接摘要。

音频处理规则：

- 录音和上传音频都走 realtime ASR。
- 录音通过 WebSocket 发送 16 kHz PCM frames，边说边更新文本草稿。
- 上传音频通过流式 HTTP 响应返回 ASR 增量，边解析边更新文本草稿。
- 前端只允许选择 `audio/*`。
- 后端先校验 content type、扩展名和文件头，再用 `ffprobe` 确认临时文件只有 audio stream；非音频、混入视频或畸形文件直接拒绝并删除临时文件。

## Draft 与 Published

`draft.md` 约定包含：

- `# Publishable Skill`: 可独立运行的 skill 内容
- `## When to Use`、`## Workflow`、`## Boundaries`、`## Failure Modes`: 发布内容内部小节
- `# Draft Review`: 用户可见的草案评审信息
- `## Material Coverage`: 素材覆盖说明
- `## Refinement Notes`: 后续补充建议

`# Publishable Skill` 和 `# Draft Review` 是 draft 的稳定解析边界。候选标题保存在 `index.md`，`draft.md` 不重复写标题，避免同一信息多处维护。

发布时只把 `Publishable Skill` 内容写入 `rules/skills/`，并把同样内容写入 `published.md` 快照。草案评审信息不应成为运行时 skill 指令。

## HTTP 服务映射

Web 服务直接映射到当前文件状态机：

- `GET /api/skills`: 读取所有 `*/index.md` frontmatter
- `POST /api/skills`: 从 `_template/` 创建新候选目录
- `POST /api/text/polish`: 调用 DashScope LLM 润色文本框内容，仅返回文本，不保存候选材料
- `POST /api/asr/text-draft/stream`: 上传音频 realtime ASR，流式返回文本草稿
- `WS /api/asr/realtime`: 录音 realtime ASR，流式返回文本草稿
- `POST /api/skills/:slug/materials/text`: 创建 `materials/<material_id>.md`
- `POST /api/skills/:slug/draft`: 根据已保存材料生成或刷新 `draft.md`
- `POST /api/skills/:slug/promote`: 经过 admin token 校验后写入 `rules/skills/`，更新 `rules/skills/INDEX.md` 和 `published.md`
- `POST /api/skills/:slug/use/stream`: 使用 draft 或 published 内容进行只读流式对话

## 自动蒸馏规则

自动化可以主动生成草案，但晋升到 `rules/skills/` 必须经过 admin token 校验。默认门槛：

- 至少两份已保存素材，或存在一份完整高质量 transcript
- `draft.md` 的 `Publishable Skill` 能清楚说明触发条件、流程、边界和失败模式
- `Draft Review` 能明确说明素材覆盖和继续完善方向
