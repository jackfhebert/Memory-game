import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { celebrateCorrectAnswer } from "../js/effects.js";

function setUpDom() {
  const dom = new JSDOM("<button class=\"answer-correct\"></button>");
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  return dom;
}

test("celebrateCorrectAnswer does nothing when given no anchor", () => {
  setUpDom();
  assert.doesNotThrow(() => celebrateCorrectAnswer(null));
  assert.equal(document.querySelectorAll("canvas").length, 0);
});

test("celebrateCorrectAnswer doesn't throw and leaves no canvas when 2D context is unavailable", () => {
  // jsdom has no canvas backing (the `canvas` npm package isn't installed),
  // so getContext("2d") returns null here — the same no-op path real
  // browsers would never hit, but it must still degrade safely.
  setUpDom();
  const anchor = document.querySelector(".answer-correct");
  assert.doesNotThrow(() => celebrateCorrectAnswer(anchor));
  assert.equal(document.querySelectorAll("canvas").length, 0);
});
