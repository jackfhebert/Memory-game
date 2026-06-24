# Testing

This project has two layers of testing: automated unit tests, and a
real-rendering browser check for anything that touches real content (a
module's images, facts, or alt text) or the flashcard/answer flow itself.

## Automated unit tests

```
npm test
```

Runs `node --test test/*.test.js` (jsdom-based) covering `js/flashcards.js`,
`js/modules.js`, `js/players.js`, and `js/storage.js`. These use small
synthetic fixtures, not real module data — they verify the game *logic*
(pool selection, answer-choice shuffling, progress tracking, storage), not
that any particular module's content actually renders correctly or that
its images load. Adding or editing a module's JSON/images doesn't need
new unit tests and won't be caught by the existing ones.

## Real-rendering browser check (runs in CI, not locally)

This layer exists to verify the two things unit tests can't see: that
**clicking** actually drives the UI through real DOM events, and that
**rendering** is correct in a real browser engine (images decode, CSS
layout looks right, answer-button styling actually applies).

### Where this runs

This check runs in GitHub Actions, not in a local agent sandbox.
GitHub-hosted runners have normal, reliable network access, and the
Playwright browser binary is cached across runs with `actions/cache`, so
a run starts from a working setup instead of re-downloading the browser
every time. Running it this way also means it's not tied to any one
agent session — anyone (or any future session) can dispatch the same
workflow and get the same result.

### Trigger model

This check is intentionally **not** run on every push — it's heavyweight
relative to `npm test`, so it only makes sense once code, docs, and unit
tests already look right. Proposed trigger: `workflow_dispatch` (manual,
on-demand from the Actions tab or `gh`/MCP tooling), not a push/PR
trigger. *(Open question: do we also want it gated on a PR label, e.g.
`needs-browser-check`, for cases where you want it before merging
without remembering to dispatch it by hand?)*

### What the workflow does

1. Checkout, `npm ci`.
2. Add Playwright as a real devDependency and `npx playwright install
   --with-deps chromium`.
3. Serve the static app (`python3 -m http.server 8088` or equivalent) in
   the background.
4. Run a driving script (e.g. `test/browser/click-and-render.mjs`) with
   headless Chromium that:
   - Adds a player, opens a module, switches to "All Cards."
   - Asserts the module tile shows the right name/icon and an accurate
     `"0 of N"` count.
   - Spot-checks several cards' `<img>` `src`/`alt` against expected
     content (not just the first card).
   - Clicks through one correct and one incorrect answer, asserting
     `.answer-correct`/`.answer-wrong` classes apply and the `✓`/`✗`
     tally updates.
   - Fails the run on any `pageerror` console event.
   - Saves a screenshot per checked card as a build artifact, so a
     blank/broken-looking frame can be caught by eye even if no script
     error was thrown.
5. Upload screenshots (and a Playwright trace, for debugging failures) as
   workflow artifacts.

The script should **assert and exit non-zero on failure** rather than
just `console.log` things for a human to read — this runs unattended in
CI, nobody's watching it live.

### How to check the results afterward

From a Claude Code session (this one or a future one), via the GitHub
MCP tools: `actions_list`/`actions_get` to find the run,
`get_job_logs` to read its output, `get_commit`/`get_check_run` to see
pass/fail status tied to a commit. For a PR specifically,
`subscribe_pr_activity` pushes the CI result automatically instead of
polling. Artifact *download* (the screenshots themselves) isn't exposed
through the current MCP toolset — viewing those today means going to the
Actions run in the GitHub UI. *(Open question: is screenshot review
something you'll do by hand in the UI, or does that need to be solved
too?)*

### Gotchas

- `.next-button`'s label/behavior changes between "Answer" (pick a
  choice first) and "Next Question" (advance) — one click reveals, a
  second click advances. Don't expect a single click to do both.

### Local iteration on the test script itself

Writing/debugging the driving script is still easier with a real browser
window open locally. That's a different machine than an agent sandbox —
if you (the human) have Playwright's browser binary cached locally
already, `npx playwright test --headed` works the normal way. This section
is about where the check *runs as part of the workflow*, not a ban on
ever opening a local browser while developing it.

## Content-pipeline QA (photo-sourced modules)

Before the full browser walkthrough above, use `tools/contact_sheet.py`
(documented in `tools/README.md`) to lay out a module's freshly-fetched
images in one grid PNG — much faster than opening each file individually
to catch a bad crop, wrong subject, or a non-free image that needs
replacing.
