# Production Overview — Memory Game

See also: [README](README.md) · [Design Doc](DESIGN.md) ·
[Implementation Plan](IMPLEMENTATION_PLAN.md)

## Where this stands

This is a static, no-backend web app (see [DESIGN.md](DESIGN.md) and
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)) — no database, no
server-side logic. That keeps "getting it running" mostly a question of
how the static files get served, not a question of infrastructure.

## Running locally

The app loads module JSON via `fetch()`, which most browsers block over a
plain `file://` URL — so `index.html` needs to be served over `http://`,
not just opened directly. Any plain static file server works, e.g.
`python3 -m http.server` or `npx serve` from the project root. No install
or build step beyond whatever serves the files.

## Sharing with others — Cloud Run

Once it's worth sharing beyond the house, Cloud Run is the plan. Cloud Run
runs containers, so the rough shape is: wrap the static files in a minimal
container and deploy that. Since there's no backend or database, this
should be about as simple as a Cloud Run deployment gets — no app-server
logic, no secrets, no persistent storage to provision.

Deliberately left open for when we actually get there:

- Which minimal web server/container image serves the static files.
- Hand-deploying the first time vs. setting up any CI/CD.
- Custom domain vs. the default `*.run.app` URL.
- Whether to put any access control in front of it before it's sharable
  more broadly (it's a personal/family MVP today, so this hasn't mattered
  yet — see [DESIGN.md](DESIGN.md)'s note on localStorage-based,
  account-free players).

## A note on tooling

Actually running the Cloud Run deployment will need a session with cloud
tooling (e.g. the `gcloud` CLI) and your GCP project credentials wired in
— that's a separate setup step, not something the Claude mobile app does
on its own. The mobile app is a chat client; the actual building/deploying
happens in a Claude Code session like this one, with whatever cloud access
gets connected to it. We can sort out exactly what that connection looks
like when we get to the deployment step, rather than guessing now.

## Open questions

- Everything under "Sharing with others" above.
- How cloud credentials get connected to a session for the deploy step —
  to figure out when we're ready to deploy, not before.
