# pmpt-cli

CLI tool for recording and sharing your AI-driven product development journey.

**Website**: [pmptwiki.com](https://pmptwiki.com)

## Install

```bash
npm install -g pmpt-cli
```

## Quick Start

```bash
# Initialize project
pmpt init

# Start product planning (6 questions → AI prompt)
pmpt plan

# Save snapshot manually
pmpt save

# Or auto-detect file changes
pmpt watch

# View version history
pmpt history
pmpt history --compact   # Hide minor changes

# Squash versions
pmpt squash v2 v5        # Merge v2-v5 into v2
```

## Folder Structure

```
.promptwiki/
├── config.json           # Config file
├── pmpt/                  # Working folder (MD files)
└── .history/              # Version history
```

## Workflow

1. `pmpt init` → Initialize project
2. `pmpt plan` → Answer 6 questions → `pmpt.md` generated
3. Copy `pmpt.md` to AI → Build with AI conversation
4. `pmpt save` or `pmpt watch` → Save progress
5. `pmpt submit` → Share to archive (coming soon)

## Commands

| Command | Description |
|---------|-------------|
| `pmpt init` | Initialize project folder |
| `pmpt plan` | Quick product planning with 6 questions |
| `pmpt save` | Save current state as snapshot |
| `pmpt watch` | Auto-detect file changes |
| `pmpt status` | Check project status |
| `pmpt history` | View version history |
| `pmpt squash` | Merge multiple versions |

## License

MIT
