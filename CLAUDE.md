# Instructions for Claude Code in this repo

- **Never push to `main`.** Always stop after pushing to a feature branch
  and wait to be asked before merging/pushing to `main`, even if a prior
  session was told to push to `main` — that approval doesn't carry over.
- **Don't run the Playwright manual browser walkthrough** (see
  [TESTING.md](TESTING.md)) unless explicitly asked to. It's slow (browser
  download, multi-step driving script) relative to the value it's added so
  far — `npm test` is the default verification step. If a change genuinely
  needs browser verification, ask first rather than doing it proactively.
- Keep changes scoped to what was actually asked. Don't proactively rewrite
  other docs (DESIGN.md, IMPLEMENTATION_PLAN.md, etc.) to "fix" discovered
  inconsistencies — flag the discrepancy and ask first.
