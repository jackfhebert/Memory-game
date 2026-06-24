import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createFakeStorage } from "./helpers/fakeStorage.js";

const MODULES = [
  { id: "continents", name: "Continents", dataFile: "continents.json", color: "#4F86C6", icon: "🌍" },
];

const ITEMS = [
  { id: "africa", name: "Africa", image: "africa.png", alt: "Africa map", facts: ["A continent."] },
  { id: "asia", name: "Asia", image: "asia.png", alt: "Asia map", facts: ["A continent."] },
  { id: "europe", name: "Europe", image: "europe.png", alt: "Europe map", facts: ["A continent."] },
  { id: "australia", name: "Australia", image: "australia.png", alt: "Australia map", facts: ["A continent."] },
];

function fakeFetch(url) {
  const body = url.endsWith("modules.json") ? MODULES : ITEMS;
  return Promise.resolve({ json: () => Promise.resolve(body) });
}

async function setUpApp() {
  globalThis.localStorage = createFakeStorage();
  globalThis.fetch = fakeFetch;

  const dom = new JSDOM(
    `<div id="screen-player-select" class="screen active"></div>
     <div id="screen-module-select" class="screen"></div>
     <div id="screen-mode-select" class="screen"></div>
     <div id="screen-flashcard" class="screen"></div>`,
  );
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;

  // Cache-bust so each test gets a fresh module instance (and re-runs init()).
  await import(`../js/app.js?t=${Date.now()}-${Math.random()}`);
  // Let the player-select screen's initial render (a microtask chain) settle.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return dom;
}

function activeScreen(dom) {
  return dom.window.document.querySelector(".screen.active").id;
}

test("app.js: player select -> module select -> mode select -> flashcard -> exit", async () => {
  const dom = await setUpApp();
  const { document } = dom.window;

  assert.equal(activeScreen(dom), "screen-player-select");

  const addTile = document.querySelector("#screen-player-select .tile-add");
  addTile.dispatchEvent(new dom.window.Event("click"));
  document.querySelector("#screen-player-select input").value = "Sam";
  document
    .querySelector("#screen-player-select .add-player-form button")
    .dispatchEvent(new dom.window.Event("click"));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(activeScreen(dom), "screen-module-select");
  const moduleTile = document.querySelector("#screen-module-select .tile");
  assert.match(moduleTile.textContent, /Continents/);
  moduleTile.dispatchEvent(new dom.window.Event("click"));

  assert.equal(activeScreen(dom), "screen-mode-select");
  const allCardsTile = [
    ...document.querySelectorAll("#screen-mode-select .tile"),
  ].find((tile) => tile.querySelector(".tile-name").textContent === "All Cards");
  allCardsTile.dispatchEvent(new dom.window.Event("click"));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(activeScreen(dom), "screen-flashcard");
  const answerButtons = document.querySelectorAll(
    "#screen-flashcard .answer-button",
  );
  assert.equal(answerButtons.length, 4);

  assert.equal(
    document.querySelector("#screen-flashcard .next-button").disabled,
    true,
  );

  answerButtons[0].dispatchEvent(new dom.window.Event("click"));
  assert.equal(
    document.querySelector("#screen-flashcard .next-button").disabled,
    false,
  );
  assert.equal(
    document.querySelectorAll("#screen-flashcard .answer-correct").length,
    0,
  );

  document
    .querySelector("#screen-flashcard .next-button")
    .dispatchEvent(new dom.window.Event("click"));
  assert.equal(
    document.querySelectorAll("#screen-flashcard .answer-correct").length,
    1,
  );
  assert.match(
    document.querySelector("#screen-flashcard .score-tally").textContent,
    /1 Correct|1 Try Again/,
  );

  document
    .querySelector("#screen-flashcard .flashcard-exit")
    .dispatchEvent(new dom.window.Event("click"));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(activeScreen(dom), "screen-module-select");
});
