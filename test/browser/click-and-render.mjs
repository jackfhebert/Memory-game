// Real-browser click+render check. See TESTING.md for when/how this runs —
// it drives a live Chromium against the served app, not a jsdom fixture.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const PORT = process.env.BROWSER_CHECK_PORT || "8088";
const BASE_URL = `http://127.0.0.1:${PORT}`;
const MODULE_NAME = "Continents";
const CARDS_TO_CHECK = 2;
const SCREENSHOT_DIR =
  process.env.SCREENSHOT_DIR || path.join(ROOT, "browser-check-artifacts");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function startServer() {
  return spawn("python3", ["-m", "http.server", PORT], {
    cwd: ROOT,
    stdio: "ignore",
  });
}

async function waitForServer(url, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // server not up yet, keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Server at ${url} did not respond within ${timeoutMs}ms`);
}

async function checkCard(page, cardIndex) {
  await page.locator(".flashcard-image").waitFor();

  const imageSrc = await page.locator(".flashcard-image").getAttribute("src");
  assert(Boolean(imageSrc), "flashcard image has no src");

  const factText = await page.locator(".flashcard-fact").innerText();
  assert(factText.trim().length > 0, "flashcard fact is empty");

  const choices = page.locator(".answer-button");
  const choiceCount = await choices.count();
  assert(choiceCount === 4, `expected 4 answer choices, got ${choiceCount}`);

  const correctChipBefore = await page.locator(".score-chip-correct").innerText();
  const wrongChipBefore = await page.locator(".score-chip-wrong").innerText();
  const countBefore = (text) => Number(text.match(/\d+/)[0]);

  await choices.first().click();
  await page.locator(".next-button").click(); // reveal

  const correctButtons = page.locator(".answer-button.answer-correct");
  assert(
    (await correctButtons.count()) === 1,
    "expected exactly one revealed correct answer",
  );

  const clickedClasses = await choices.first().getAttribute("class");
  const clickedWasCorrect = clickedClasses.includes("answer-correct");

  const correctChipAfter = await page.locator(".score-chip-correct").innerText();
  const wrongChipAfter = await page.locator(".score-chip-wrong").innerText();

  if (clickedWasCorrect) {
    assert(
      countBefore(correctChipAfter) === countBefore(correctChipBefore) + 1,
      "correct tally did not increment after a correct answer",
    );
  } else {
    assert(
      countBefore(wrongChipAfter) === countBefore(wrongChipBefore) + 1,
      "wrong tally did not increment after a wrong answer",
    );
  }

  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `card-${cardIndex + 1}.png`),
  });

  await page.locator(".next-button").click(); // advance to next card
}

async function main() {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const server = startServer();
  const pageErrors = [];
  let browser;

  try {
    await waitForServer(`${BASE_URL}/index.html`);

    browser = await chromium.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto(`${BASE_URL}/index.html`);

    await page.locator(".tile-add").click();
    await page.locator(".add-player-form input").fill("Browser Check");
    await page.locator(".add-player-form button").click();

    const moduleTile = page.locator(".tile", { hasText: MODULE_NAME }).first();
    await moduleTile.waitFor();
    const progressText = await moduleTile.locator(".tile-progress").innerText();
    assert(
      /^\d+ of \d+$/.test(progressText),
      `unexpected module progress text: "${progressText}"`,
    );
    await moduleTile.click();

    for (let cardIndex = 0; cardIndex < CARDS_TO_CHECK; cardIndex++) {
      await checkCard(page, cardIndex);
    }

    if (pageErrors.length > 0) {
      throw new Error(`Page errors occurred: ${pageErrors.join("; ")}`);
    }

    console.log(`Browser check passed. Screenshots in ${SCREENSHOT_DIR}`);
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}

main().catch((err) => {
  console.error("Browser check failed:", err.message);
  process.exitCode = 1;
});
