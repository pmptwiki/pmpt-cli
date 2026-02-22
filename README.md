# pmpt

**Record and share your AI-driven product development journey.**

AI와 대화하며 제품을 만드는 여정을 기록하고 공유하세요.

[![npm version](https://img.shields.io/npm/v/pmpt-cli.svg)](https://www.npmjs.com/package/pmpt-cli)

**Website**: [pmptwiki.com](https://pmptwiki.com)

---

## Install

```bash
npm install -g pmpt-cli
```

---

## Quick Start

```bash
# 1. Initialize project
pmpt init

# 2. Answer 5 questions → AI prompt generated
pmpt plan

# 3. Copy the prompt to Claude/ChatGPT/Cursor and build!

# 4. Save your progress
pmpt save

# 5. Export & share
pmpt export
```

---

## Why pmpt?

- **5 questions** — Quick product planning with AI-ready prompts
- **Version history** — Track every step of your AI-assisted development
- **Share & reproduce** — Export `.pmpt` files for others to learn from

---

## Commands

| Command | Description |
|---------|-------------|
| `pmpt init` | Initialize project |
| `pmpt plan` | 5 questions → AI prompt (copied to clipboard) |
| `pmpt save` | Save current state as snapshot |
| `pmpt watch` | Auto-detect file changes |
| `pmpt history` | View version history |
| `pmpt history --compact` | Hide minor changes |
| `pmpt squash v2 v5` | Merge versions v2-v5 into v2 |
| `pmpt export` | Export as `.pmpt` file (single JSON) |
| `pmpt import <file>` | Import from `.pmpt` file |
| `pmpt status` | Check project status |

---

## Folder Structure

```
.pmpt/
├── config.json           # Config file
├── docs/                 # Working folder (MD files)
│   ├── plan.md           # Product plan
│   └── pmpt.md           # AI prompt
└── .history/             # Version history
    ├── v1-2024-02-20/
    ├── v2-2024-02-21/
    └── ...
```

---

## Workflow

```
[You]
  │
  ├─ pmpt plan ────→ 5 questions → AI prompt (clipboard)
  │
  ├─ Build with AI ─→ Create files, iterate
  │
  ├─ pmpt save ────→ Save to .pmpt/.history
  │
  ├─ pmpt export ──→ Create .pmpt file (shareable)
  │
  └─ pmpt import ──→ Reproduce someone's project
```

---

## .pmpt File Format

Single JSON file containing your entire development journey:

```json
{
  "schemaVersion": "1.0",
  "meta": { "projectName", "description", "createdAt" },
  "plan": { "productIdea", "coreFeatures", "techStack" },
  "docs": { "plan.md": "...", "pmpt.md": "..." },
  "history": [
    { "version": 1, "timestamp": "...", "files": {...} },
    { "version": 2, "timestamp": "...", "files": {...} }
  ]
}
```

---

## Use Cases

- **Side project builders** — Track your AI-assisted development
- **Startup founders** — Document MVP creation process
- **Content creators** — Share your coding journey
- **Learners** — Study how others build with AI

---

## Links

- [Website](https://pmptwiki.com)
- [GitHub](https://github.com/promptwiki/cli)
- [npm](https://www.npmjs.com/package/pmpt-cli)

---

## License

MIT
