# What is unique about our solution?

**Sakai IDE turns the time you spend waiting on AI into time spent understanding code — for students, vibe coders and professional developers alike.**

Every AI coding tool makes the same trade: it writes the code, and you understand less. Students copy answers without learning the logic; non-technical "vibe coders" ship code that works but is quietly insecure; developers lose the thread of what changed and why. And all of them stare at a spinner while the agent works.

Sakai IDE is an autonomous issue-fixing harness that solves this on both sides:

1. **It really fixes the issue.** It installs dependencies, runs the repo's tests, reproduces the bug, edits with tools, re-verifies after every edit against a baseline, and only finishes when nothing regressed. It works with any text-only model (DeepSeek, Qwen, local Ollama), turning a foundation model into a reliable engineer rather than a chatbot.
2. **It keeps the human in the loop.** A live streaming chat lets you steer the agent mid-run, and every change is shown side by side (green added, red removed) with the root cause explained, so the logic is never lost.
3. **It teaches while it works.** You pick a profile. Students get bite-size fundamentals and quiz cards while the agent runs, then a "what went wrong?" multiple-choice question with the reasoning. Vibe coders get plain-language basics and a list of hidden weaknesses (security, missing checks) even when the code "works". Developers get formal, crisp reasoning. Pop-ups are humorous, use a mascot that changes per profile, and fade away on their own so there is no friction.

**Result:** the same fix, but the human ends up understanding it. The AI does the typing; people keep the thinking.

**Also:** bring-your-own-key with direct provider APIs (no gateway), a local-first design (server on 127.0.0.1, keys in the macOS Keychain), works without a GitHub login, and a standard `make setup` / `make run` / `make solve` interface for evaluation.
