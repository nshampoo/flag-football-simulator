# Flag Football Defense Simulator

Simulates 7v7 rec flag football plays to find the best defense, rusher, and personnel against an
opponent archetype ("loves go routes", "scared QB", ...). It will live on shampoe.com.

See [docs/DESIGN.md](docs/DESIGN.md) for the league rules, model, and roadmap.

## Develop

```
cd app
npm install
npm test
npm run sim -- [archetype|all] [plays] [coverage]   # ranks every defense, rusher, and rush mode
npm run best -- [archetype]                          # searches the best setup, including who plays where
npm run dev                          # play viewer and best-setup search
```

Archetypes: `gunslinger`, `dinkAndDunk`, `heroBall`, `scrambler`, `scaredQb`, `balanced`.

## Deploy

```
cd infra
npm install
AWS_PROFILE=personal npm run deploy
```

`npm run deploy` builds the app, then deploys the `FlagFootballSimSite` stack: a private S3 bucket
behind CloudFront. Everything, including the best-setup search, runs in the browser.

shampoe.com serves the stack's CloudFront domain (the `CloudFrontDomain` output) at `/flag/app/`
through the `apps` list in the personal-website repo's `infra/bin/infra.ts`.

| Path | What |
| --- | --- |
| `app/src/engine/` | Sim engine (pure TypeScript, shared by the browser and Node) |
| `app/src/ui/` | Play viewer (Vite + React) |
| `app/scripts/` | Node scripts run with `tsx` (Monte Carlo batches) |
| `infra/` | CDK stack (S3 + CloudFront) |
| `docs/DESIGN.md` | Design and roadmap |
