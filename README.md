<div align="center">

# pmpt

**Answer 5 questions. Start building with AI.**

[![npm version](https://img.shields.io/npm/v/pmpt-cli.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/pmpt-cli)
[![license](https://img.shields.io/github/license/pmptwiki/pmpt-cli?style=flat-square&v=2)](https://github.com/pmptwiki/pmpt-cli/blob/main/LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square)](https://github.com/pmptwiki/pmpt-cli)

The CLI that turns your idea into an AI-ready prompt in 30 seconds.

No coding required. No complex setup. Just answer 5 questions.

[Quick Start](#quick-start) · [Commands](#commands) · [How It Works](#how-it-works) · [Explore Projects](#explore-projects)

</div>

---

## Demo

```
$ pmpt plan

┌  pmpt — Let's plan your product!
│
◆  What should we call your project?
│  my-budget-app
│
◆  What would you like to build with AI?
│  A personal budget tracking app for freelancers
│
◆  Any additional context AI should know? (optional)
│  Simple UI, mobile-friendly, works offline
│
◆  Key features to include?
│  Expense tracking; Income categories; Monthly reports; Export to CSV
│
◆  Preferred tech stack? (optional)
│  React, Node.js
│
└  Done! AI prompt copied to clipboard.

→ Open Claude / ChatGPT / Cursor → Ctrl+V → Start building!
```

---

## Install

```bash
npm install -g pmpt-cli
```

> Requires Node.js 18+

---

## Quick Start

```bash
# 1. Install
npm i -g pmpt-cli

# 2. Initialize your project
pmpt init

# 3. Answer 5 questions → AI prompt auto-generated & copied
pmpt plan

# 4. Paste into Claude / ChatGPT / Cursor → Build your product!

# 5. Save your progress anytime
pmpt save

# 6. Share with the community
pmpt login && pmpt publish

# Bonus: Explore what others are building
pmpt browse
```

---

## Why pmpt?

| | Without pmpt | With pmpt |
|---|---|---|
| **Planning** | Stare at blank screen, write vague prompts | Answer 5 guided questions, get structured AI prompt |
| **Tracking** | Lose track of what you built and how | Every version auto-saved with full history |
| **Sharing** | Share finished code only | Share the entire journey — others can reproduce it |

---

## The 5 Questions

`pmpt plan` asks just 5 questions to generate a complete AI prompt:

| # | Question | Example |
|---|----------|---------|
| 1 | **Project name** | `my-budget-app` |
| 2 | **What to build** | `A budget tracking app for freelancers` |
| 3 | **Additional context** *(optional)* | `Simple UI, mobile-friendly` |
| 4 | **Key features** | `Expense tracking; Monthly reports; CSV export` |
| 5 | **Tech stack** *(optional)* | `React, Node.js` — or let AI decide |

The generated prompt is **automatically copied to your clipboard**. Just paste it into your favorite AI tool.

---

## Commands

### Local

| Command | Description |
|---------|-------------|
| `pmpt init` | Initialize project and start tracking |
| `pmpt plan` | 5 questions → AI prompt (auto-copied to clipboard) |
| `pmpt save` | Save current state as a snapshot |
| `pmpt watch` | Auto-detect file changes and save versions |
| `pmpt status` | Check project status and tracked files |
| `pmpt history` | View version history |
| `pmpt squash v2 v5` | Merge versions v2–v5 into one |
| `pmpt export` | Export project as `.pmpt` file |
| `pmpt import <file>` | Import from `.pmpt` file |

### Platform

| Command | Description |
|---------|-------------|
| `pmpt login` | Authenticate via GitHub (one-time) |
| `pmpt publish` | Publish your project for others to discover |
| `pmpt edit` | Edit published project metadata (description, tags, category) |
| `pmpt unpublish` | Remove a published project from pmptwiki |
| `pmpt clone <slug>` | Clone and reproduce someone's project |
| `pmpt browse` | Browse and search published projects |

> See the full documentation at [pmptwiki.com/docs](https://pmptwiki.com/docs)

---

## How It Works

```
  You                          pmpt                         AI Tool
   │                            │                              │
   ├── pmpt init ──────────────→│                              │
   │                            │  Creates .pmpt/ project      │
   │                            │                              │
   ├── pmpt plan ──────────────→│                              │
   │   (answer 5 questions)     │  Generates AI prompt         │
   │                            │  → Copied to clipboard       │
   │                            │                              │
   ├── Ctrl+V ─────────────────────────────────────────────────→│
   │                            │                    Builds your product
   │                            │                              │
   ├── pmpt save ──────────────→│                              │
   │                            │  Snapshots version history   │
   │                            │                              │
   ├── pmpt publish ───────────→│                              │
   │                            │  Shares with community       │
   │                            │                              │
   └── Others: pmpt clone ─────→│  Reproduces your journey     │
```

---

## Project Structure

```
your-project/
└── .pmpt/
    ├── config.json        # Project configuration
    ├── docs/              # Generated documents
    │   ├── plan.md        # Product plan (features checklist)
    │   └── pmpt.md        # AI-ready prompt
    └── .history/          # Auto-saved version history
        ├── v1-2024-02-20/
        ├── v2-2024-02-21/
        └── ...
```

---

## .pmpt File Format

A single portable file containing your entire development journey:

```json
{
  "schemaVersion": "1.0",
  "meta": {
    "projectName": "my-budget-app",
    "description": "Budget tracking app for freelancers",
    "createdAt": "2024-02-20T10:00:00Z"
  },
  "plan": {
    "productIdea": "A budget tracking app...",
    "coreFeatures": "Expense tracking; Monthly reports",
    "techStack": "React, Node.js"
  },
  "docs": {
    "plan.md": "...",
    "pmpt.md": "..."
  },
  "history": [
    { "version": 1, "timestamp": "...", "files": {} },
    { "version": 2, "timestamp": "...", "files": {} }
  ]
}
```

Share it. Clone it. Reproduce it.

---

## Use Cases

- **Have an idea but no coding skills?** — Answer 5 questions, paste the prompt into AI, and start building
- **Startup founders** — Document your MVP creation process from day one
- **Content creators** — Share your AI-assisted building journey as reproducible content
- **Learners** — Clone published projects to study how others build with AI

---

## Explore Projects

Don't know what to build? Browse what others have created with AI.

```bash
# Discover projects from the community
pmpt browse

# Found something interesting? Clone it and make it yours
pmpt clone budget-tracker-app
```

**[Explore Projects on pmptwiki.com →](https://pmptwiki.com/explore)**

See how others planned their products, what prompts they used, and how their projects evolved step by step. Clone any project and use it as a starting point for your own.

---

## Contributing

Contributions are welcome! Feel free to open an [issue](https://github.com/pmptwiki/pmpt-cli/issues) or submit a [pull request](https://github.com/pmptwiki/pmpt-cli/pulls).

---

## Links

- [GitHub](https://github.com/pmptwiki/pmpt-cli)
- [npm](https://www.npmjs.com/package/pmpt-cli)
- [Documentation](https://pmptwiki.com/docs)

---

## License

[MIT](https://github.com/pmptwiki/pmpt-cli/blob/main/LICENSE)

---

<div align="center">

**If pmpt helps you build something, give it a ⭐**

[Explore what others are building →](https://pmptwiki.com/explore)

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?style=flat-square&logo=buy-me-a-coffee)](https://buymeacoffee.com/pmpt_cafe)

</div>
