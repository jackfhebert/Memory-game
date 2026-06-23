import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createFakeStorage } from "./helpers/fakeStorage.js";

beforeEach(() => {
  globalThis.localStorage = createFakeStorage();
});

const { normalizePlayerName, renderPlayerSelect } = await import(
  "../js/players.js"
);
const { addPlayer } = await import("../js/storage.js");

test("normalizePlayerName trims whitespace", () => {
  assert.equal(normalizePlayerName("  Sam  "), "Sam");
});

test("renderPlayerSelect renders a tile per existing player plus an add-player tile", () => {
  addPlayer("Sam");
  addPlayer("Alex");
  const dom = new JSDOM("<div id=container></div>");
  globalThis.document = dom.window.document;
  const container = dom.window.document.getElementById("container");

  let selected = null;
  renderPlayerSelect(container, { onSelectPlayer: (name) => (selected = name) });

  const tiles = container.querySelectorAll(".tile");
  assert.equal(tiles.length, 3);
  assert.equal(tiles[2].textContent, "+ Add Player");

  tiles[0].dispatchEvent(new dom.window.Event("click"));
  assert.equal(selected, "Sam");
});

test("renderPlayerSelect's add-player tile creates a new player on confirm", () => {
  const dom = new JSDOM("<div id=container></div>");
  globalThis.document = dom.window.document;
  const container = dom.window.document.getElementById("container");

  let selected = null;
  renderPlayerSelect(container, { onSelectPlayer: (name) => (selected = name) });

  const addTile = container.querySelector(".tile-add");
  addTile.dispatchEvent(new dom.window.Event("click"));

  const input = container.querySelector("input");
  input.value = "Jamie";
  const confirmButton = container.querySelector(".add-player-form button");
  confirmButton.dispatchEvent(new dom.window.Event("click"));

  assert.equal(selected, "Jamie");
});
