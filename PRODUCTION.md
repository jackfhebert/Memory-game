# Production Overview — Memory Game

See also: [README](README.md) · [Design Doc](DESIGN.md) ·
[Implementation Plan](IMPLEMENTATION_PLAN.md)

## Where this stands

This is a static, no-backend web app (see [DESIGN.md](DESIGN.md) and
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)) — no database, no
server-side logic. That keeps "getting it running" mostly a question of
how the static files get served, not a question of infrastructure.

## Branch policy: `main` is live

Cloud Run's continuous deploy (set up below) redeploys on every push to
`main` — there's no staging slot in between. That makes `main` the de
facto production branch: whatever's there is what's running for real
users, usually within a minute or two of the push.

Practically, that means:

- Do feature/content work on a separate branch, not directly on `main`.
- Before merging into `main` (or pushing straight to it), run `npm test`
  and, for anything touching module content or the flashcard/answer UI,
  the manual browser walkthrough in [TESTING.md](TESTING.md). Don't rely
  on Cloud Run's build succeeding as the only check — a clean Docker
  build just means the static files copied correctly, not that the app
  behaves correctly.
- Treat a broken `main` as urgent — fix forward or revert promptly,
  since it's live the moment it's pushed.

## Running locally

The app loads module JSON via `fetch()`, which most browsers block over a
plain `file://` URL — so `index.html` needs to be served over `http://`,
not just opened directly. Any plain static file server works, e.g.
`python3 -m http.server` or `npx serve` from the project root. No install
or build step beyond whatever serves the files.

## Sharing with others — Cloud Run

The repo now has what Cloud Run needs to serve the app as a container:

- `Dockerfile` — an `nginx:alpine` image that copies in `index.html`,
  `css/`, `js/`, `data/`, and `images/`, and serves them as static files.
- `deploy/nginx.conf.template` — nginx config that listens on `$PORT`
  (Cloud Run sets this env var; nginx's built-in template substitution
  fills it in at container startup), serving everything from one
  `location /` block since there's no routing to speak of.
- `.dockerignore` — keeps `node_modules`, `test/`, and the docs out of the
  image.

No app-server logic, no secrets, no persistent storage — the container is
just a file server.

### Recommended setup: Cloud Run's built-in continuous deploy (no laptop needed)

Cloud Run can watch a GitHub branch and rebuild/redeploy on every push,
entirely through the GCP Console's web UI — no `gcloud` CLI, no YAML
workflow file, no service-account keys to manage. This is the path to use
if you're setting this up from a phone:

1. Go to [console.cloud.google.com](https://console.cloud.google.com) →
   **Cloud Run** → **Create Service**.
2. Pick **Continuously deploy from a repository** → **Set up with Cloud
   Build**.
3. Authorize the **Cloud Build GitHub App** for your GitHub account and
   select the `jackfhebert/Memory-game` repo.
4. Branch: `^main$`. Build type: **Dockerfile** (auto-detected, since one
   exists at the repo root).
5. Service name: `memory-game`. Region: pick one close to you (e.g.
   `us-central1`). Authentication: **Allow unauthenticated invocations**
   (so anyone with the link — i.e. your family — can open it without a
   Google login). CPU/memory defaults are fine; leave minimum instances at
   0 so it scales to zero (and costs ~nothing) when no one's playing.
6. Create. The first build+deploy kicks off immediately — that's the
   "test version," live at the `*.run.app` URL Cloud Run gives you.
7. From then on, every push to `main` triggers a new Cloud Build → Cloud
   Run deploy automatically. No further setup needed.

This requires its own GCP project with billing enabled (Cloud Run's free
tier should cover a low-traffic personal/family app, but a billing account
still needs to be attached to create the service). Steps 1–6 are a
one-time setup only you can do, since it's tied to your Google/GCP
account — but every step is a tap-through in a mobile browser, no laptop
or CLI required.

### Alternative: GitHub Actions workflow

If finer control over the build/deploy step is ever needed (e.g. running
`npm test` as a deploy gate, or deploying to a separate staging service
before production), the usual pattern is a `.github/workflows/deploy.yml`
that builds the `Dockerfile`, pushes it to Artifact Registry, and deploys
via `google-github-actions/deploy-cloudrun`, authenticating with Workload
Identity Federation (no long-lived keys). That needs a handful of one-time
`gcloud`/Console steps to wire up the trust relationship between this repo
and a GCP service account — more setup than the Console option above, so
not worth it unless the simple version stops being enough.

### Other open questions

- Custom domain vs. the default `*.run.app` URL — doable later via Cloud
  Run's **Manage Custom Domains**, same Console.
- Whether to put any access control in front of it before it's sharable
  more broadly (it's a personal/family MVP today, so this hasn't mattered
  yet — see [DESIGN.md](DESIGN.md)'s note on localStorage-based,
  account-free players).

## A note on tooling

This Claude Code session built and tried to test the `Dockerfile` locally,
but this sandbox's network policy blocks the Docker Hub CDN
(`production.cloudfront.docker.com` returns a policy-denied 403), so the
image couldn't actually be built or run here — only written and reviewed.
The `Dockerfile`/`nginx.conf.template` follow a standard, well-documented
pattern (nginx's own template-substitution feature for `$PORT`), but
they're untested by me. Worth doing one build of the image — either via
the Cloud Run Console setup above (which builds it for you on Google's
side) or from any machine with working Docker — to confirm the static
file paths resolve before relying on it as the "test version."

The actual one-time GCP setup (creating a project, attaching billing,
authorizing the GitHub App, creating the Cloud Run service) has to happen
in your GCP/GitHub accounts directly — that's not something this session
can click through on your behalf, but as noted above it's all
browser-based and phone-friendly.

## Open questions

- Custom domain and access-control, as noted above.
- Whether the GitHub Actions/Workload Identity Federation path is ever
  worth the extra setup over the Console's built-in continuous deploy.
