# promptwiki-cli

CLI tool for contributing to [PromptWiki](https://pmptwiki.com) — a community-driven guide to working with AI.

## Install

```bash
npm install -g promptwiki-cli
```

## Usage

### Create a new document

```bash
promptwiki new
```

Interactive prompts will guide you through creating a properly structured markdown file.

### Validate a document

```bash
promptwiki validate ko/guide/beginner/my-guide.md
```

Checks frontmatter schema, required fields, and minimum content length before submission.

### Submit via Pull Request

```bash
promptwiki submit ko/guide/beginner/my-guide.md
```

Automatically forks `promptwiki/content`, creates a branch, and opens a Pull Request. Requires a GitHub Personal Access Token with `repo` scope (you'll be prompted on first use).

### Logout

```bash
promptwiki logout
```

Removes stored GitHub credentials from `~/.config/promptwiki/auth.json`.

## Workflow

```
promptwiki new          # create file interactively
# edit the file in your editor
promptwiki validate     # check before submitting
promptwiki submit       # fork → branch → PR
```

Once your PR is merged into `promptwiki/content`, the site at pmptwiki.com updates automatically.

## License

MIT
