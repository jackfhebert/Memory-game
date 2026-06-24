import { recordAnswer, getProgress, isItemKnown } from "./storage.js";

export const ACTIVE_LEARNING_POOL_SIZE = 5;
const DISTRACTOR_COUNT = 3;

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

export function buildActivePool(items, mode) {
  if (mode === "all-cards" || items.length <= ACTIVE_LEARNING_POOL_SIZE) {
    return sortByPopularityDesc(items);
  }
  return sortByPopularityDesc(items).slice(0, ACTIVE_LEARNING_POOL_SIZE);
}

export function pickNextCard(pool, previousItemId, rng = Math.random) {
  if (pool.length === 0) {
    throw new Error("Cannot pick a card from an empty pool");
  }
  const candidates =
    pool.length > 1 ? pool.filter((item) => item.id !== previousItemId) : pool;
  const index = Math.floor(rng() * candidates.length);
  return candidates[index];
}

export function pickOrderedOrRandomCard(
  pool,
  cardsShown,
  previousItemId,
  rng = Math.random,
) {
  if (cardsShown < pool.length) {
    return pool[cardsShown];
  }
  return pickNextCard(pool, previousItemId, rng);
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
  const candidates = items.filter((item) => item.id !== correctItem.id);
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
  return facts[Math.floor(rng() * facts.length)];
}

export function shouldExpandPool(mode, wasKnown, isKnown) {
  return mode === "active-learning" && isKnown && !wasKnown;
}

export function expandPool(pool, items) {
  const poolIds = new Set(pool.map((item) => item.id));
  const candidates = items.filter((item) => !poolIds.has(item.id));
  if (candidates.length === 0) return pool;
  const [next] = sortByPopularityDesc(candidates);
  return [...pool, next];
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

export function startFlashcardSession(container, { player, moduleId, items, mode, onExit }) {
  let pool = buildActivePool(items, mode);
  let cardsShown = 0;

  function selectItem(previousItemId, rng = Math.random) {
    const item =
      mode === "all-cards"
        ? pickOrderedOrRandomCard(pool, cardsShown, previousItemId, rng)
        : pickNextCard(pool, previousItemId, rng);
    cardsShown += 1;
    return item;
  }

  let card = buildCard(items, selectItem(null));
  let selectedChoiceId = null;
  let revealed = false;
  let correctCount = 0;
  let wrongCount = 0;

  function preloadUpcoming() {
    const targets = selectPreloadTargets(pool, card.item.id);
    preloadImages(targets.map((item) => item.image));
  }
  preloadUpcoming();

  function renderCurrentCard() {
    renderFlashcard(container, {
      card,
      cardPosition: cardPosition(pool, card.item.id),
      poolSize: pool.length,
      selectedChoiceId,
      revealed,
      correctCount,
      wrongCount,
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
      const wasKnown = isItemKnown(
        getProgress(player, moduleId).itemStats[card.item.id],
      );
      const progress = recordAnswer(player, moduleId, card.item.id, wasCorrect);
      if (wasCorrect) {
        correctCount += 1;
      } else {
        wrongCount += 1;
      }
      const isKnown = isItemKnown(progress.itemStats[card.item.id]);
      if (shouldExpandPool(mode, wasKnown, isKnown)) {
        pool = expandPool(pool, items);
      }
      revealed = true;
      renderCurrentCard();
      return;
    }

    card = buildCard(items, selectItem(card.item.id));
    preloadUpcoming();
    selectedChoiceId = null;
    revealed = false;
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
  image.src = card.item.image;
  image.alt = card.item.alt;
  container.appendChild(image);

  const fact = document.createElement("p");
  fact.className = "flashcard-fact";
  fact.textContent = card.fact;
  container.appendChild(fact);

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

  container.appendChild(tally);
}
