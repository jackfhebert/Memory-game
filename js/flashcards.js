import { recordAnswer } from "./storage.js";

const ACTIVE_LEARNING_POOL_SIZE = 5;
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

export function buildActivePool(items, mode, rng = Math.random) {
  if (mode === "all-cards" || items.length <= ACTIVE_LEARNING_POOL_SIZE) {
    return [...items];
  }
  return sampleWithoutReplacement(items, ACTIVE_LEARNING_POOL_SIZE, rng);
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

function buildCard(items, pool, previousItemId, rng) {
  const item = pickNextCard(pool, previousItemId, rng);
  const distractors = pickDistractors(items, item, DISTRACTOR_COUNT, rng);
  const choices = buildAnswerChoices(item, distractors, rng);
  return { item, choices };
}

export function startFlashcardSession(container, { player, moduleId, items, mode, onExit }) {
  const pool = buildActivePool(items, mode);
  let card = buildCard(items, pool, null);
  let answered = false;

  function renderCurrentCard() {
    renderFlashcard(container, {
      card,
      answered,
      onChoose,
      onNext,
      onExit,
    });
  }

  function onChoose(choiceId) {
    if (answered) return;
    const wasCorrect = choiceId === card.item.id;
    recordAnswer(player, moduleId, card.item.id, wasCorrect);
    answered = true;
    renderCurrentCard();
  }

  function onNext() {
    card = buildCard(items, pool, card.item.id);
    answered = false;
    renderCurrentCard();
  }

  renderCurrentCard();
}

function renderFlashcard(container, { card, answered, onChoose, onNext, onExit }) {
  container.innerHTML = "";

  const exitButton = document.createElement("button");
  exitButton.className = "flashcard-exit";
  exitButton.textContent = "×";
  exitButton.setAttribute("aria-label", "Exit to module select");
  exitButton.addEventListener("click", onExit);
  container.appendChild(exitButton);

  const image = document.createElement("img");
  image.className = "flashcard-image";
  image.src = card.item.image;
  image.alt = card.item.alt;
  container.appendChild(image);

  const fact = document.createElement("p");
  fact.className = "flashcard-fact";
  fact.textContent = card.item.fact;
  container.appendChild(fact);

  const grid = document.createElement("div");
  grid.className = "answer-grid";
  card.choices.forEach((choice) => {
    const button = document.createElement("button");
    button.className = "answer-button";
    button.textContent = choice.name;
    if (answered) {
      button.disabled = true;
      if (choice.id === card.item.id) {
        button.classList.add("answer-correct");
      } else {
        button.classList.add("answer-wrong");
      }
    } else {
      button.addEventListener("click", () => onChoose(choice.id));
    }
    grid.appendChild(button);
  });
  container.appendChild(grid);

  if (answered) {
    const nextButton = document.createElement("button");
    nextButton.className = "next-button";
    nextButton.textContent = "Next";
    nextButton.addEventListener("click", onNext);
    container.appendChild(nextButton);
  }
}
