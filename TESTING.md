# Testing

This project has two layers of testing: automated unit tests, and a manual
browser walkthrough for anything that touches real content (a module's
images, facts, or alt text) or the flashcard/answer flow itself.

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

## Manual end-to-end verification

Run this after adding or changing module content, or touching the
flashcard/answer UI, before calling the change done.

### 1. Serve the app

```
python3 -m http.server 8088
```

### 2. Drive it with Playwright

There's no Playwright devDependency checked into this repo yet (it's a
static, no-build app, and Playwright's browser download is heavy/flaky in
some sandboxes) — install it ad hoc in a scratch directory rather than
touching `package.json`:

```
mkdir -p /tmp/verify-scratch && cd /tmp/verify-scratch
npm init -y && npm install playwright
npx playwright install chromium
```

If the browser download fails partway through, look for an
already-downloaded Chromium binary elsewhere on the machine (e.g. under
`~/.cache/ms-playwright/` or wherever an earlier attempt landed) and pass
it via `executablePath` instead of retrying the download.

Then drive the app with a script like:

```js
import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
page.on('pageerror', (err) => console.log('PAGEERROR', err.message));

await page.goto('http://127.0.0.1:8088/index.html');

// Add a player (first-run screen)
await page.locator('.tile-add').click();
await page.locator('.add-player-form input').fill('Tester');
await page.locator('.add-player-form button').click();

// Open the module under test, then "All Cards"
await page.locator('.tile', { hasText: 'Composers' }).first().click();
await page.getByText('All Cards', { exact: false }).first().click();

// Inspect a card
console.log(await page.locator('.flashcard-image').getAttribute('src'));
console.log(await page.locator('.flashcard-fact').innerText());
console.log(await page.locator('.answer-button').allTextContents());

// Answer it. .next-button does two different things depending on state:
// first click reveals correct/wrong (adds .answer-correct/.answer-wrong
// classes to the buttons), second click advances to the next card.
await page.locator('.answer-button').first().click();
await page.locator('.next-button').click(); // reveal
await page.locator('.next-button').click(); // advance

await page.screenshot({ path: '/tmp/verify-scratch/card.png' });
await browser.close();
```

### 3. What to check

- The module tile on the module-select screen shows the right name/icon
  and an accurate `"0 of N"` count.
- Spot-check several cards (not just the first), confirming each image
  actually matches its `alt` text and facts.
- Click through the answer flow for at least one correct and one
  incorrect choice, confirming `.answer-correct`/`.answer-wrong` styling
  and the running `✓`/`✗` tally update as expected.
- No `pageerror` console output.
- Actually open the screenshot — a blank or broken-looking frame is a
  failure even if no script error was thrown.

### Gotchas

- `.next-button`'s label/behavior changes between "Answer" (pick a
  choice first) and "Next Question" (advance) — one click reveals, a
  second click advances. Don't expect a single click to do both.
- Playwright's browser download can die partway through in this
  environment; reusing a previously-downloaded binary's `executablePath`
  is more reliable than retrying `playwright install`.

## Content-pipeline QA (photo-sourced modules)

Before the full browser walkthrough above, use `tools/contact_sheet.py`
(documented in `tools/README.md`) to lay out a module's freshly-fetched
images in one grid PNG — much faster than opening each file individually
to catch a bad crop, wrong subject, or a non-free image that needs
replacing.
