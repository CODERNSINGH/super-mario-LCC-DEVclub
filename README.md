# Sakai

An autonomous AI engineer for GitHub issues. Sakai clones your repository, understands the code, fixes the issue with tool-driven edits, runs your tests, self-reviews the diff, and opens a pull request — all from a VS Code–style desktop workspace (macOS).

## How it works
```
Issue ─▶ understand ─▶ localize (search/read) ─▶ reproduce ─▶ fix ─▶ run tests ─▶ review git diff ─▶ PR
```
- **Harness** (`server/`): a text-based tool loop that works with any model (DeepSeek, Qwen, Llama via Ollama, GPT, Claude). Tools: `bash`, `search`, `read_file`, `replace`, `write_file`, `finish`. Safeguards: file access confined to the repo, unique-match edits, repeat-call detection, context compaction, mandatory test run and diff review before finishing.
- **App** (`app/`): Electron + React + Tailwind. Monaco editor and diff viewer, integrated terminal, file explorer, command palette (⌘K).
- **Auth**: GitHub OAuth Device Flow. Tokens are stored encrypted in the macOS Keychain and used for clone, push and PR creation.

## Install (end users)
1. Download `Sakai.dmg`, drag Sakai to Applications.
2. Open it, paste a repository URL, click **Connect GitHub**, then pick a model and paste your own API key (or choose Ollama / LM Studio — free, no key). Model usage is billed to your own provider account; Sakai shows a cost estimate before each run.

There is nothing else to configure: no `.env`, no OAuth app. GitHub tokens and API keys are stored encrypted in your macOS Keychain.

## Build from source (developers / publishers)
Requirements: macOS, Node 20+, git.
```bash
npm install
cp .env.example .env
```
Publisher one-time setup: create a GitHub OAuth App (github.com/settings/developers → New OAuth App, callback `http://localhost`, tick **Enable Device Flow**) and set `SAKAI_GITHUB_CLIENT_ID` in `.env`. The Client ID is public by design and is **baked into the build**, so users never see it. Model keys in `.env` are dev-only conveniences; release builds never read `.env`.

```bash
npm run dev        # builds the server and launches the desktop app
npm run dist       # produces the .dmg in app/release (Client ID embedded)
```

## Using Sakai
1. **Repository** — paste a GitHub URL.
2. **Connect GitHub** — approve the device code in your browser. (AWS, GCP, Azure, GitLab, Jira, … are marked *coming soon*.)
3. **Connect a model** — Groq, DeepSeek, Qwen, OpenAI, Anthropic, or local Ollama / LM Studio. Sakai tests the connection first.
4. **Workspace** — watch the clone logs, then pick an open issue (or describe your own task).
5. Add guidance, confirm the test command and branch, click **Estimate cost & time**, then **Solve**.
6. Review the diff tabs, then **Create pull request** or **Discard changes**.

Shortcuts: `⌘K` command palette · `` ⌘` `` terminal · `⌘J` toggle panel · `⌘S` save file.

Extras: **Quick commands** (activity bar `›_`) lets you save one-click terminal commands; **Settings** (⚙) switches model, repository or account. Files in the explorer are editable.

## Test repository
Sakai is being evaluated on [Keshavr57/Bugy-Calcu](https://github.com/Keshavr57/Bugy-Calcu) — four open bugs (subtract operand order, operator precedence, multiplication by zero, decimal handling). Full list: [docs/TEST-ISSUES.md](docs/TEST-ISSUES.md).

## Pick test issues
```bash
npm run issues -- owner/repo   # writes docs/TEST-ISSUES.md with every open issue
```

## Evaluate the harness
```bash
npm test -w server
npm run eval -w server -- cases.json   # batch over real issues
```

## Repository layout
| Path | Purpose |
|---|---|
| `app/` | Electron desktop client |
| `server/` | Agent harness + git/PR API |
| `web/` | Landing page |

## Status
The app, harness and IDE surface are built and were verified in the running Electron app (Ollama connection, editor, diff view, terminal, and an end-to-end agent run on a scripted model). Validation against DeepSeek/Qwen on real GitHub issues and the OAuth/PR path requires the credentials above. Local models under ~7B (e.g. `llama3.2:1b`) cannot follow the tool protocol; use a coder-class model.
