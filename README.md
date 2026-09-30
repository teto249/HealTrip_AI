# HealTrip — AI Patient Decision Assistant

A prototype for the technical assessment: a patient describes a symptom in free text — *"I have
chest pain and I'm not sure whether I should see a cardiologist, go to the ER, or seek a second
opinion"* — and the assistant tells them what to do next, using real doctors and hospitals, never
made-up ones.

**Diagram:** [`docs/architecture.html`](docs/architecture.html) — a one-page summary of the same
thing below, with a small picture of the request flow.

## Why this architecture

The core rule behind every decision here: **the AI talks, the code decides.** The model is good at
understanding what a patient says and explaining things back clearly — so that's its only job.
Anything that could actually hurt someone if it's wrong — how urgent a symptom is, which specialist
fits, which doctor is real — is handled by plain, ordinary code instead, not by asking the AI to be
careful.

**The benefit:** the AI can't invent a doctor, a fee, or a wrong emergency call — not because it's
told not to, but because it's never given a way to state those facts itself. It can only point at
real data, which is checked before anything is shown. And because the safety checks are in code,
they still work even if the AI is slow, rate-limited, or completely down. This was confirmed while
testing, not just designed for: the grounding check rejected a real reply for citing a fabricated
id, and fell back safely instead of showing it.

## Stages — what each one is for

- **Intake** — asks what's needed before anything else happens.
- **Triage** — decides how urgent it is, using fixed rules, not the AI's opinion.
- **Routing** — looks up the right specialist from a table, never a guess.
- **Matching** — searches real doctors that fit.
- **Drilldown** — answers follow-up questions about them.
- **Emergency** — a fixed safe message + nearest ER, skipping the AI entirely.
- **Handoff** — confirms the choice and hands off to a human.
- **Out of scope** — says plainly it can't help with that, and routes to a human.

## Tools — what each one does

- **record_case_facts** — saves what the patient said.
- **assess_urgency** — runs the urgency rules.
- **map_symptoms_to_specialties** — finds the right specialist.
- **search_providers** / **get_provider_details** — finds and describes real doctors.
- **find_emergency_facilities** — nearest real ERs.
- **explain_pathway** — pre-written answers to common questions.

## How it avoids making things up

The AI can only ever refer to a doctor, hospital, or specialist by its ID — never by writing out a
name, fee, or address itself. Before anything is shown to the patient, every ID it mentioned is
checked against what a real lookup actually returned that turn. If something doesn't check out, the
reply is rejected and retried once — and if that still fails, the assistant falls back to a short,
honest message instead of showing something wrong.

## Project layout

```
apps/
  api/     NestJS backend — the agent, tools, rules engine, data layer, and REST endpoint
  web/     Next.js chat UI — bilingual (EN/AR), renders a reasoning-trace panel per reply
docs/
  architecture.html   One-page summary with a diagram of the request flow
```

## Setup

Requires Node 20+.

```bash
npm install
cp apps/api/.env.example apps/api/.env   # then add a real OPENAI_API_KEY (or point it at any OpenAI-compatible endpoint — see the file's comments)
cp apps/web/.env.example apps/web/.env
npm run dev
```

This starts the API on `:4000` and the web UI on `:3000` concurrently. Without an `OPENAI_API_KEY`,
the UI still loads and the backend still boots — only `POST /chat` fails, with a clear `503`
explaining why, rather than a silent wrong answer.

**The eval harness does not need an API key at all** — it stubs the model call and exercises every
other layer (stage machine, forced tool_choice, rules engine, grounding ledger, citation guard)
against the real production code:

```bash
npm test
```

## API

```
POST /chat
{ "sessionId"?: string, "locale": "en" | "ar", "message": string }
```

Returns the disposition, message, clarifying questions, hydrated provider/facility/specialty cards,
and a reasoning trace. See `apps/api/src/common/types.ts`.

## Assumptions and non-goals

- **Synthetic data, real schema.** The seed data is fictional; `schema.sql` documents the production
  Postgres schema it mirrors, so swapping in a real database is a same-file change.
- **Session state in memory** — swappable for Redis/Postgres without touching any caller.
- **No authentication.** Out of scope for a prototype.
- **Not a validated clinical triage protocol.** The rule table is a plausible illustration for a
  demo — a real deployment needs a clinician-authored ruleset with a named clinical owner.
- **Single-agent by choice**, not an orchestra of specialist agents — the stage machine already
  gives the separation multi-agent designs are usually reaching for.

## Deploying

The web app deploys to Vercel as-is (`npm run build -w apps/web`, set `NEXT_PUBLIC_API_URL` to
wherever the API is hosted). The API is a standard Nest app (`npm run build -w apps/api`,
`node apps/api/dist/main.js`) — deployable to Railway, Render, Fly, or any Node host.
