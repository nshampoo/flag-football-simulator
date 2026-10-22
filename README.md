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
npm run dev                          # play viewer
```

Archetypes: `gunslinger`, `dinkAndDunk`, `heroBall`, `scrambler`, `scaredQb`, `balanced`.

| Path | What |
| --- | --- |
| `app/src/engine/` | Sim engine (pure TypeScript, shared by the browser and Node) |
| `app/src/ui/` | Play viewer (Vite + React) |
| `app/scripts/` | Node scripts run with `tsx` (Monte Carlo batches) |
| `docs/DESIGN.md` | Design and roadmap |
