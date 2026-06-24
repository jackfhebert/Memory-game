# Memory Game

A kids' memory/flashcard game for learning simple facts about the world —
things like continents, U.S. states, or types of sushi.

## Concept

The game is built around **modules**, where each module is a self-contained
set of flashcard content on a single topic (e.g. "Continents," "U.S.
States," "Types of Sushi"). Kids play through a module's cards to learn and
reinforce facts.

As a player works through a module, the game keeps a lightweight sense of
how well they know each fact, so it can give them more practice on the
things they haven't learned yet. This tracking is meant to be simple and
low-stakes — there's no account security or sensitive data involved, just
enough to make practice feel personalized.

## Status

This project is in early planning — the docs below are written, the app
itself isn't built yet:

- **[Design Doc](DESIGN.md)** — how the game and modules are structured,
  and the overall user experience
- **[Implementation Plan](IMPLEMENTATION_PLAN.md)** — how the design will
  be built, step by step
- **[Production Overview](PRODUCTION.md)** — what's needed to take the
  game from built to running for real users
- **[Testing](TESTING.md)** — automated unit tests, plus the manual
  browser walkthrough for verifying module content and the flashcard UI

## Branching

`main` is the production branch — every push to it redeploys the live
app (see [PRODUCTION.md](PRODUCTION.md#branch-policy-main-is-live)). Do
work on a separate branch and run the checks in
[TESTING.md](TESTING.md) before merging or pushing to `main`.
