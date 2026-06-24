# Instructions for Claude Code in this repo

- **Never push to `main`.** Always stop after pushing to a feature branch
  and wait to be asked before merging/pushing to `main`, even if a prior
  session was told to push to `main` — that approval doesn't carry over.
- **Don't trigger the real-rendering browser check** (see
  [TESTING.md](TESTING.md)) unless explicitly asked to. It's heavyweight
  relative to `npm test`, which is the default verification step. If a
  change genuinely needs browser verification, ask first rather than
  triggering the workflow proactively. Never try to run a real-browser
  (Playwright/Puppeteer/etc.) check directly inside an agent sandbox —
  it's unreliable there by design; the check belongs in CI.
- Keep changes scoped to what was actually asked. Don't proactively rewrite
  other docs (DESIGN.md, IMPLEMENTATION_PLAN.md, etc.) to "fix" discovered
  inconsistencies — flag the discrepancy and ask first.
