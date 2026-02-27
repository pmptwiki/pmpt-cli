<div align="center">

# pmpt

**Record and share your AI-driven product development journey.**

[![npm version](https://img.shields.io/npm/v/pmpt-cli.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/pmpt-cli)
[![license](https://img.shields.io/github/license/pmptwiki/pmpt-cli?style=flat-square&v=2)](https://github.com/pmptwiki/pmpt-cli/blob/main/LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square)](https://github.com/pmptwiki/pmpt-cli)

Plan with 5 questions. Build with AI. Save every version. Share and reproduce.

[Quick Start](#quick-start) · [Commands](#commands) · [MCP Server](#mcp-server) · [Explore Projects](#explore-projects)

</div>

---

## Demo

<img src="./demo.gif" alt="pmpt plan demo" width="600" />

> Answer 5 questions → AI prompt auto-generated & copied to clipboard → Paste into Claude Code / Codex / Cursor → Start building!

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

# 4. Paste into Claude Code / Codex / Cursor → Build your product!

# 5. Save your progress anytime
pmpt save

# 6. Share with the community
pmpt login && pmpt publish

# Bonus: Explore what others are building
pmpt explore
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
| `pmpt status` | Check project status, tracked files, and quality score |
| `pmpt history` | View version history |
| `pmpt diff v1 v2` | Compare two versions (unified diff) |
| `pmpt diff v3` | Compare version vs working copy |
| `pmpt squash v2 v5` | Merge versions v2–v5 into one |
| `pmpt export` | Export project as `.pmpt` file |
| `pmpt import <file>` | Import from `.pmpt` file |
| `pmpt recover` | Recover damaged pmpt.md via AI-generated prompt |
| `pmpt -v` | Show current CLI version |

### Platform

| Command | Description |
|---------|-------------|
| `pmpt login` | Authenticate via GitHub (one-time) |
| `pmpt publish` | Publish your project (requires quality score ≥ 40) |
| `pmpt edit` | Edit published project metadata (description, tags, category) |
| `pmpt unpublish` | Remove a published project from pmptwiki |
| `pmpt clone <slug>` | Clone and reproduce someone's project |
| `pmpt explore` | Open pmptwiki.com/explore in your browser |

> Quality score below 40? pmpt copies an **AI improvement prompt** to your clipboard — paste it into your AI tool to get help improving your project.

> See the full documentation at [pmptwiki.com/docs](https://pmptwiki.com/docs)

---

## MCP Server

pmpt includes a built-in [MCP](https://modelcontextprotocol.io) server so AI tools can interact with pmpt directly. This means Claude Code, Cursor, and other MCP-compatible tools can save snapshots, check status, and review history without you typing commands.

### Setup

Add to your `.mcp.json` (or IDE MCP config):

```json
{
  "mcpServers": {
    "pmpt": {
      "command": "pmpt-mcp"
    }
  }
}
```

### Available Tools

| Tool | Description |
|------|-------------|
| `pmpt_save` | Save a snapshot after completing features, fixes, or milestones |
| `pmpt_status` | Check tracked files, snapshot count, and quality score |
| `pmpt_history` | View version history with git commit info |
| `pmpt_diff` | Compare two versions, or a version against working copy |
| `pmpt_quality` | Check quality score and publish readiness |

All tools accept an optional `projectPath` parameter (defaults to cwd).

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
    │   ├── pmpt.md        # Progress tracking & decisions
    │   └── pmpt.ai.md     # AI-ready prompt (project context & instructions)
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
    "pmpt.md": "...",
    "pmpt.ai.md": "..."
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

Don't know what to build? See what others have created with AI.

```bash
# Open the explore page
pmpt explore

# Found something interesting? Clone it and make it yours
pmpt clone budget-tracker-app
```

**[Explore Projects on pmptwiki.com →](https://pmptwiki.com/explore)**

Clone any project to see how it was planned, what prompts were used, and how it evolved step by step. The clone output shows the product idea, tech stack, and full version history.

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
