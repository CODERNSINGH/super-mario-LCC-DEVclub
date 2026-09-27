# Sakai IDE — standard evaluation interface
#
#   export AI_API_KEY="<PROVIDED_API_KEY>"     # read from the environment only; never stored in the repo
#   make setup      install + configure everything
#   make run        launch Sakai IDE (desktop app) already connected to the model from AI_API_KEY
#   make test       unit tests + type-checks
#   make clean      remove generated artefacts
#
# Optional:  AI_PROVIDER (deepseek|qwen|qwen-cn|groq|openai|anthropic|ollama, default deepseek)
#            AI_MODEL, AI_BASE_URL, GITHUB_TOKEN (headless private repos)

SHELL := /bin/bash
.DEFAULT_GOAL := help
NODE_MIN := 20

.PHONY: help setup run test clean distclean solve dmg install-app check-tools

help: ## Show this help
	@echo "Sakai IDE — make targets"; echo
	@awk 'BEGIN{FS=":.*## "} /^[a-zA-Z_-]+:.*## /{printf "  make %-12s %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo; echo "Evaluator flow:  export AI_API_KEY=\"<key>\"  &&  make setup  &&  make run"

check-tools:
	@command -v node >/dev/null 2>&1 || { echo "✗ Node.js $(NODE_MIN)+ is required (https://nodejs.org)"; exit 1; }
	@command -v npm  >/dev/null 2>&1 || { echo "✗ npm is required"; exit 1; }
	@command -v git  >/dev/null 2>&1 || { echo "✗ git is required (macOS: xcode-select --install)"; exit 1; }
	@node -e 'process.exit(+process.versions.node.split(".")[0] >= $(NODE_MIN) ? 0 : 1)' || { echo "✗ Node.js $(NODE_MIN)+ required, found $$(node -v)"; exit 1; }
	@echo "✓ node $$(node -v), npm $$(npm -v), $$(git --version)"

setup: check-tools ## Install dependencies and build the harness
	@echo "Setting up Sakai IDE…"
	npm install --no-audit --no-fund
	@node node_modules/electron/install.js   # make sure the Electron binary is present
	@cd app && (npx electron-rebuild -f -w node-pty >/dev/null 2>&1 || echo "  (node-pty rebuild skipped — the integrated terminal may be unavailable)")
	npm run build -w server
	@echo "✓ Setup complete. Next:  export AI_API_KEY=\"<key>\"  &&  make run"

run: ## Launch Sakai IDE (evaluation mode: model auto-connected from AI_API_KEY)
	@test -d node_modules || { echo "✗ Dependencies missing — run: make setup"; exit 1; }
	@if [ -z "$$AI_API_KEY" ]; then echo "! AI_API_KEY is not set — the app will ask you to connect a model."; else echo "✓ AI_API_KEY detected (provider: $${AI_PROVIDER:-auto-detect}, model: $${AI_MODEL:-default})"; fi
	@echo "Starting Sakai IDE…"
	AI_API_KEY="$(AI_API_KEY)" AI_PROVIDER="$(AI_PROVIDER)" AI_MODEL="$(AI_MODEL)" AI_BASE_URL="$(AI_BASE_URL)" npm run dev

test: ## Run unit tests and type-checks
	@test -d node_modules || { echo "✗ Dependencies missing — run: make setup"; exit 1; }
	@echo "Running tests…"
	AI_API_KEY="$(AI_API_KEY)" npm test -w server
	npm run typecheck

solve: ## Headless: make solve REPO=<url|path> ISSUE=<n> | TASK="…" [COMMIT=1]
	@test -d node_modules || { echo "✗ Dependencies missing — run: make setup"; exit 1; }
	@test -n "$$AI_API_KEY" -o "$${AI_PROVIDER}" = "ollama" || { echo "✗ AI_API_KEY is not set:  export AI_API_KEY=\"<key>\""; exit 2; }
	@cd server && AI_API_KEY="$(AI_API_KEY)" npx tsx src/cli.ts $(if $(REPO),--repo "$(REPO)") $(if $(ISSUE),--issue "$(ISSUE)") $(if $(TASK),--task "$(TASK)") $(if $(COMMIT),--commit) $(if $(STEPS),--steps "$(STEPS)")

clean: ## Remove generated artefacts (keeps node_modules and built installers)
	rm -rf server/dist server/dist-bundle app/out web/dist .vite coverage
	@echo "✓ Clean"

distclean: clean ## Also remove node_modules and installers
	rm -rf node_modules app/node_modules server/node_modules web/node_modules app/release
	@echo "✓ Distclean"

dmg: ## Build the macOS installer (app/release/Sakai-IDE-*-arm64.dmg)
	npm run dist

install-app: dmg ## Build and install Sakai IDE into /Applications (no security prompt: built locally)
	@rm -rf "/Applications/Sakai IDE.app"
	@cp -R "app/release/mac-arm64/Sakai IDE.app" /Applications/
	@xattr -cr "/Applications/Sakai IDE.app" 2>/dev/null || true
	@echo "✓ Installed. Search “Sakai IDE” in Spotlight."
	@open -a "Sakai IDE" || true
