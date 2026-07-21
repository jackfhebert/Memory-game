import {
  recordAnswer,
  getProgress,
  isItemMastered,
  getMasteryEstimate,
  getItemMasteryEstimate,
} from "./storage.js";
import { celebrateCorrectAnswer } from "./effects.js";
import { recordAnswerEvent } from "./analytics.js";
import { dedupeByName } from "./items.js";

export const ACTIVE_LEARNING_POOL_SIZE = 5;
const DISTRACTOR_COUNT = 3;
export const ANSWER_CHOICE_COUNT = DISTRACTOR_COUNT + 1;
const DEBUG_PLAYER_NAME = "debug";

export function isDebugPlayer(player) {
  return player?.trim().toLowerCase() === DEBUG_PLAYER_NAME;
}

function sampleWithoutReplacement(items, count, rng) {
  const pool = [...items];
  const sample = [];
  while (sample.length < count && pool.length > 0) {
    const index = Math.floor(rng() * pool.length);
    sample.push(pool.splice(index, 1)[0]);
  }
  return sample;
}

function shuffle(array, rng) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function sortByPopularityDesc(items) {
  return [...items].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
}

// Seeds the pool from distinct topics (by name), not raw entries - a
// recall variant's lower popularity only staggers it behind its own base
// item, not behind *other* topics' base items, so ranking raw entries
// directly can fill the whole starter pool with several cuts of the same
// one or two most popular topics instead of a spread of different ones.
// Variants still enter later via expandPool once a topic's base item
// (and others) are mastered.
export function buildActivePool(items) {
  const topics = sortByPopularityDesc(dedupeByName(items));
  if (topics.length <= ACTIVE_LEARNING_POOL_SIZE) {
    return topics;
  }
  return topics.slice(0, ACTIVE_LEARNING_POOL_SIZE);
}

export function cardPosition(pool, itemId) {
  return pool.findIndex((item) => item.id === itemId) + 1;
}

export function pickDistractors(
  items,
  correctItem,
  count = DISTRACTOR_COUNT,
  rng = Math.random,
) {
  const candidates = items.filter((item) => item.name !== correctItem.name);
  if (candidates.length < count) {
    throw new Error(
      `Module needs at least ${count + 1} items to pick ${count} distractors`,
    );
  }
  return sampleWithoutReplacement(candidates, count, rng);
}

export function buildAnswerChoices(correctItem, distractors, rng = Math.random) {
  return shuffle([correctItem, ...distractors], rng);
}

export function pickFact(item, rng = Math.random) {
  const facts = item.facts;
  if (!facts) return undefined;
  return facts[Math.floor(rng() * facts.length)];
}

// Triggers expansion a card early (at 1 unknown left, not 0) so a player who
// just mastered the pool gets a new card immediately instead of seeing the
// same already-known cards repeat while waiting for the last one to flip.
function isPoolAlmostKnown(knownCount, poolSize) {
  return poolSize - knownCount <= 1;
}

// Only expand on the transition into "almost known", not every answer after
// it, so each mastery milestone adds exactly one card instead of piling on
// more every time the player answers correctly with one slot already free.
export function shouldExpandPool(knownCountBefore, knownCountAfter, poolSize) {
  return (
    isPoolAlmostKnown(knownCountAfter, poolSize) &&
    !isPoolAlmostKnown(knownCountBefore, poolSize)
  );
}

export function expandPool(pool, items) {
  const poolIds = new Set(pool.map((item) => item.id));
  const candidates = items.filter((item) => !poolIds.has(item.id));
  if (candidates.length === 0) return pool;
  const [next] = sortByPopularityDesc(candidates);
  return [...pool, next];
}

// A small floor keeps every candidate selectable, even a near-certain one,
// so review still happens instead of a mastered item never coming up again.
const REVIEW_WEIGHT_FLOOR = 0.05;

export function buildSelectionProbabilities(candidates, progress) {
  const weights = candidates.map((item) => {
    const { probabilityCorrect } = getItemMasteryEstimate(
      progress,
      item.id,
      item.popularity,
      ANSWER_CHOICE_COUNT,
    );
    return Math.max(1 - probabilityCorrect, REVIEW_WEIGHT_FLOOR);
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return candidates.map((item, index) => ({
    item,
    probability: weights[index] / total,
  }));
}

export function pickWeightedCard(pool, previousItemId, progress, rng = Math.random) {
  if (pool.length === 0) {
    throw new Error("Cannot pick a card from an empty pool");
  }
  const candidates =
    pool.length > 1 ? pool.filter((item) => item.id !== previousItemId) : pool;
  const weighted = buildSelectionProbabilities(candidates, progress);
  // Walks the weights as cumulative buckets along [0, 1) and returns whichever
  // item's bucket the roll lands in, so items get picked in proportion to
  // their weight; the final return is a float-rounding fallback, not a
  // distinct case.
  const roll = rng();
  let cumulative = 0;
  for (const { item, probability } of weighted) {
    cumulative += probability;
    if (roll < cumulative) return item;
  }
  return weighted[weighted.length - 1].item;
}

// Points reward belief shift, not just correctness: an answer that swings
// P(known) a lot (an unfamiliar item just proven known) is worth more than
// one that barely moves an already-near-certain item. SCALE is a tunable
// knob, like K_ABILITY/K_ITEM_OFFSET in storage.js - not a calibrated value.
const POINTS_SCALE = 100;

// Use a neutral popularity so points reflect only the player's accumulated
// evidence (ability + itemOffset), not the item's popularity prior. Without
// this, high-popularity items start with P(known)≈1 and every answer earns
// the minimum 1 point regardless of actual learning.
const SCORING_NEUTRAL_POPULARITY = 50;

export function pointsForAnswer(progressBefore, progressAfter, item, numChoices) {
  const before = getItemMasteryEstimate(progressBefore, item.id, SCORING_NEUTRAL_POPULARITY, numChoices)
    .probability;
  const after = getItemMasteryEstimate(progressAfter, item.id, SCORING_NEUTRAL_POPULARITY, numChoices)
    .probability;
  return Math.max(1, Math.round((after - before) * POINTS_SCALE));
}

const PRELOAD_AHEAD = 3;

export function selectPreloadTargets(pool, excludeId, count = PRELOAD_AHEAD, rng = Math.random) {
  const candidates = pool.filter((item) => item.id !== excludeId);
  return sampleWithoutReplacement(candidates, Math.min(count, candidates.length), rng);
}

function preloadImages(urls) {
  urls.forEach((url) => {
    const img = document.createElement("img");
    img.src = url;
  });
}

function buildCard(items, item, rng) {
  const distractors = pickDistractors(items, item, DISTRACTOR_COUNT, rng);
  const choices = buildAnswerChoices(item, distractors, rng);
  const fact = pickFact(item, rng);
  return { item, choices, fact };
}

export function startFlashcardSession(
  container,
  { player, moduleId, moduleVersion, items, onExit, onPointsEarned },
) {
  let pool = buildActivePool(items);

  function countKnownInPool(progress) {
    return pool.filter((item) => isItemMastered(progress, item.id, item.popularity)).length;
  }

  function selectItem(previousItemId, rng = Math.random) {
    return pickWeightedCard(
      pool,
      previousItemId,
      getProgress(player, moduleId, moduleVersion),
      rng,
    );
  }

  let card = buildCard(items, selectItem(null));
  let selectedChoiceId = null;
  let revealed = false;
  let correctCount = 0;
  let wrongCount = 0;
  let pointsEarned = 0;

  const placeholderImage = `images/${moduleId}/_placeholder.svg`;

  function preloadUpcoming() {
    const targets = selectPreloadTargets(pool, card.item.id);
    preloadImages(targets.map((item) => item.image).filter(Boolean));
  }
  preloadUpcoming();

  function buildDebugInfo() {
    const progress = getProgress(player, moduleId, moduleVersion);
    const stats = progress.itemStats[card.item.id];
    return {
      popularity: card.item.popularity,
      recent: stats?.recent ?? [],
      known: isItemMastered(progress, card.item.id, card.item.popularity),
      ...getMasteryEstimate(
        player,
        moduleId,
        card.item.id,
        card.item.popularity,
        card.choices.length,
        moduleVersion,
      ),
    };
  }

  function renderCurrentCard() {
    renderFlashcard(container, {
      card,
      cardPosition: cardPosition(pool, card.item.id),
      poolSize: pool.length,
      selectedChoiceId,
      revealed,
      correctCount,
      wrongCount,
      pointsEarned,
      placeholderImage,
      debugInfo: isDebugPlayer(player) ? buildDebugInfo() : null,
      onSelect,
      onNext,
      onExit,
    });
  }

  function onSelect(choiceId) {
    if (revealed) return;
    selectedChoiceId = choiceId;
    renderCurrentCard();
  }

  function onNext() {
    if (!revealed) {
      if (selectedChoiceId === null) return;
      const wasCorrect = selectedChoiceId === card.item.id;
      const progressBefore = getProgress(player, moduleId, moduleVersion);
      const knownCountBefore = countKnownInPool(progressBefore);
      const progress = recordAnswer(
        player,
        moduleId,
        card.item.id,
        wasCorrect,
        card.item.popularity,
        moduleVersion,
      );
      recordAnswerEvent(player, moduleId, moduleVersion, card.item.id, wasCorrect);
      if (wasCorrect) {
        correctCount += 1;
        pointsEarned = pointsForAnswer(progressBefore, progress, card.item, card.choices.length);
        onPointsEarned?.(pointsEarned);
      } else {
        wrongCount += 1;
        pointsEarned = 0;
      }
      const knownCountAfter = countKnownInPool(progress);
      if (shouldExpandPool(knownCountBefore, knownCountAfter, pool.length)) {
        pool = expandPool(pool, items);
      }
      revealed = true;
      renderCurrentCard();
      if (wasCorrect) {
        celebrateCorrectAnswer(container.querySelector(".answer-correct"));
      }
      return;
    }

    card = buildCard(items, selectItem(card.item.id));
    preloadUpcoming();
    selectedChoiceId = null;
    revealed = false;
    pointsEarned = 0;
    renderCurrentCard();
  }

  renderCurrentCard();
}

function renderFlashcard(
  container,
  {
    card,
    cardPosition,
    poolSize,
    selectedChoiceId,
    revealed,
    correctCount,
    wrongCount,
    pointsEarned,
    placeholderImage,
    debugInfo,
    onSelect,
    onNext,
    onExit,
  },
) {
  container.innerHTML = "";

  const exitButton = document.createElement("button");
  exitButton.className = "flashcard-exit";
  exitButton.textContent = "×";
  exitButton.setAttribute("aria-label", "Exit to module select");
  exitButton.addEventListener("click", onExit);
  container.appendChild(exitButton);

  const positionIndicator = document.createElement("p");
  positionIndicator.className = "flashcard-position";
  positionIndicator.textContent = `Card ${cardPosition} of ${poolSize}`;
  container.appendChild(positionIndicator);

  const image = document.createElement("img");
  image.className = "flashcard-image";
  if (card.item.image) {
    image.src = card.item.image;
    image.alt = card.item.alt;
  } else {
    image.src = placeholderImage;
    image.alt = "Image hidden for this card";
    image.classList.add("flashcard-image-placeholder");
  }
  container.appendChild(image);

  if (card.fact) {
    const fact = document.createElement("p");
    fact.className = "flashcard-fact";
    fact.textContent = card.fact;
    container.appendChild(fact);
  }

  const grid = document.createElement("div");
  grid.className = "answer-grid";
  card.choices.forEach((choice) => {
    const button = document.createElement("button");
    button.className = "answer-button";
    button.textContent = choice.name;
    if (revealed) {
      button.disabled = true;
      if (choice.id === card.item.id) {
        button.classList.add("answer-correct");
      } else if (choice.id === selectedChoiceId) {
        button.classList.add("answer-wrong");
      }
    } else {
      if (choice.id === selectedChoiceId) {
        button.classList.add("answer-selected");
      }
      button.addEventListener("click", () => onSelect(choice.id));
    }
    grid.appendChild(button);
  });
  container.appendChild(grid);

  const nextButton = document.createElement("button");
  nextButton.className = "next-button";
  nextButton.textContent = revealed ? "Next Question" : "Answer";
  nextButton.disabled = !revealed && selectedChoiceId === null;
  nextButton.addEventListener("click", onNext);
  container.appendChild(nextButton);

  const tally = document.createElement("div");
  tally.className = "score-tally";

  const correctChip = document.createElement("span");
  correctChip.className = "score-chip score-chip-correct";
  correctChip.textContent = `⭐ ${correctCount} Correct`;
  tally.appendChild(correctChip);

  const wrongChip = document.createElement("span");
  wrongChip.className = "score-chip score-chip-wrong";
  wrongChip.textContent = `🔁 ${wrongCount} Try Again`;
  tally.appendChild(wrongChip);

  if (revealed && pointsEarned > 0) {
    const pointsChip = document.createElement("span");
    pointsChip.className = "score-chip score-chip-points";
    pointsChip.textContent = `✨ +${pointsEarned}`;
    tally.appendChild(pointsChip);
  }

  container.appendChild(tally);

  if (debugInfo) {
    container.appendChild(renderDebugPanel(debugInfo));
  }
}

function renderDebugPanel(debugInfo) {
  const panel = document.createElement("div");
  panel.className = "debug-panel";

  const title = document.createElement("p");
  title.className = "debug-panel-title";
  title.textContent = "Debug: P(known) estimate";
  panel.appendChild(title);

  const rows = [
    ["P(answer correctly)", `${Math.round(debugInfo.probabilityCorrect * 100)}%`],
    ["P(known)", `${Math.round(debugInfo.probability * 100)}%`],
    ["Popularity", debugInfo.popularity],
    ["Difficulty", debugInfo.difficulty.toFixed(2)],
    ["Ability", debugInfo.ability.toFixed(2)],
    ["Item offset", debugInfo.itemOffset.toFixed(2)],
    [
      "Recent answers",
      debugInfo.recent.length
        ? debugInfo.recent.map((correct) => (correct ? "✓" : "✗")).join(" ")
        : "none yet",
    ],
    ["Known (pacing)", debugInfo.known ? "yes" : "no"],
  ];
  rows.forEach(([label, value]) => {
    const row = document.createElement("p");
    row.className = "debug-panel-row";
    row.textContent = `${label}: ${value}`;
    panel.appendChild(row);
  });

  return panel;
}
