# Sock Tycoon

Browser idle/tycoon game. Plain HTML, CSS and JS with no build step. Node is used only for tests.

## Run and test

- `npm start` serves the folder on port 8080 (or open `index.html` directly).
- `npm test` runs `test/*.test.js` with `node --test`. Run it after any change to `js/data.js`, `js/sim.js` or `js/scenarios.js`.
- Test saves: the drawer's "Test saves" section, or open `index.html?scenario=<id>` (ids: fresh, cottage, workshop, guild, velvet, small, bottleneck, glut, broke, loanshark, foreclosure, devil, sweatshop, retire, second, endgame). Loading one overwrites the real save on the next autosave.
- To try changes in a real browser from Claude Code, start `python3 -m http.server 8765` and drive it with the Playwright tools, then stop the server and delete any screenshots from the project folder.

## Architecture (keep these boundaries)

- `js/data.js` – every balance number: factory levels, producers, upgrades, sock lines, shop levels, marketing, vehicle types, research (including the exclusive doctrines and `branches`), `lenders`, `events` (trouble), `ruin` thresholds. No logic. Runs in Node and browser.
- `js/sim.js` – the whole game as pure state functions. No DOM, no timers. Runs in Node and browser. `tick(s, dt, mode, rng)`: mode `'expected'` (offline catch-up and tests) moves and sells at average rates and averages outages in; mode `'live'` steps vehicles individually, rolls random outages and mishaps, and does no selling. Randomness only ever comes through the `rng` parameter (defaults to `Math.random`); tests pass `() => 0` to force events and `() => 0.999999` to suppress them. `tick` returns `events` (ids of trouble that started) and `ruined` (the run ended in bankruptcy); `main.js` announces both. Effects engine: upgrades and research both carry `effect`/`effects`; `mult(s, type, producer)` multiplies every active numeric effect of a type, optionally filtered to one producer or one care kind (`care: 'wages'|'maintenance'`).
- `js/scenarios.js` – named test saves (`SockScenarios.list`, `build(id, now)`). Pure, runs in Node and browser. Built through `sim.js` helpers and normalised with a save round-trip; `test/scenarios.test.js` checks each one is consistent and runs.
- `js/audio.js` – Sock Radio: four looping tracks (chiptune, electro, hip hop, waltz) synthesised with the Web Audio API, no audio files. Each track is data (`TRACKS`): chords plus layers of kind `notes`, `chord`, `arp` or `drums`, each with a `tier`; layers fade in as `(factoryLevel + shopLevel) / 2` grows. The radio moves on after about three minutes. Starts on the first click or key press; prefs (on, volume, track, minimised) in localStorage key `sockTycoon.audio`. The widget is fixed bottom-right (`#radio`), wired in `ui.js`.
- `js/sprites.js` – drawing helpers shared by both canvases: vehicles, mishap icons, standing `person` (hat, glasses, hi-vis, granny), `placard`, `bubble`.
- `js/factory.js` – factory canvas: building per level, machines inside, knitting indicator, stock pile, vehicles at the bay; the uninvited mafia granny and striking grannies with placards in the yard.
- `js/street.js` – street canvas: shops, pedestrians (who make the actual sales via `actions.customerVisit`), vehicles unloading; trouble sprites drawn from `s.events` (picket line, Sal's enforcer, bailiffs with a van, a biker raid that makes pedestrians flee).
- `js/ui.js` – builds DOM once, refreshes from state. Drawer, KPI strip, badges, quick pills.
- `js/main.js` – state ownership, game loop, autosave (localStorage key `sockTycoon.save`), offline progress, measured rate meter.
- `css/style.css` – neobrutalist theme. `.brut` is the border-and-shadow rule; palette in `:root`.

The data and sim layers are engine-agnostic on purpose so a later Godot port only rewrites the canvases, `ui.js` and `main.js`.

## Economy in one paragraph

Hand knitting (timed, one sock per click) and machines fill `factoryStock`. Two exclusive **doctrines** (factory at Workshop, retail at Sock Shop, three options each) reshape multipliers for the rest of the run; The Devil's Sock is a lucrative side pattern that provokes the devout. **Loans** (`s.loans`): the bank lends against assets and sends bailiffs to seize vehicles, machines, shop and factory for any shortfall; Cousin Sal lends more with no collateral and escalates a missed date every 90 s (enforcer at the door, a mafia granny who skims 30% of production, a biker raid that empties the street and half the shelves, then the Family takes the shop). **Events** (`s.events`) multiply interest or traffic, skim production or stop a care kind; some can be bought off (`resolve`). `s.outrage` (Devil's Socks sold) triggers a picket; `s.grumble` (underpaid or unpaid grannies, plus a baseline under Cut Every Corner) triggers a strike. **Bankruptcy** ends the run like a retirement without new threads and forfeits pending ones. Each machine type has an upkeep slider (`s.upkeep`, wages for grannies, maintenance for machines) paid continuously; low settings make outages (`s.outages`, bingo breaks or breakdowns) more frequent. Vehicles can suffer per-trip mishaps that delay them and lose socks. Everything notable goes in `s.news` (newest first, capped). Vehicles carry socks to `socks` (shop shelves). Pedestrians pass at `footTraffic`, enter with probability `interest` (shop appeal × markup⁻²), and buy `basketSize` socks. Factory levels gate machine research by knitted milestones; shop levels gate by sold milestones. Research costs money and time, one at a time. Retiring converts lifetime money to Heirloom Threads (+10% production, price, research speed, knit speed each).

## Conventions

- Adding content means adding an entry in `data.js`; the UI builds rows from data. Research prerequisites can be `factoryLevel`, `shopLevel`, or other `research` ids; research with a `branch` is exclusive within that branch. Effect types: producer, price, demand, cost, click, clickPct, upkeep, outage, basket, appeal, markupMax, markupMin, capacity, trip, safety, research, outrage, grumble, grumbleBase. Producers carry `upkeep`, `care` (wages or maintenance flavour) and `outageStart`/`outageEnd` templates; vehicle types carry `mishapChance` and a `mishaps` list with `{socks}` and `{lost}` placeholders. Sock lines may be `side` (branch off `after` another) and carry `outrage`. A new event needs an entry in `events` plus, if it should be seen, a `street` or `factory` key and a sprite in that canvas. A new lender is just a `lenders` entry: with `escalation` it climbs the event ladder, without it the bailiffs seize.
- Random events must go through the `rng` parameter so tests stay deterministic. Anything the player should notice goes through `addNews`.
- Bump `SAVE_VERSION` in `sim.js` and add a migration in `deserialize` when a save field changes meaning.
- Visual pedestrians are capped at about two per second; each stands in for several customers when traffic is high. Keep sim numbers honest, scale the visuals.
- Keep tool screenshots and servers out of the project folder.

## Ideas not yet built

- More trouble on the same hooks (each is a `events` entry plus a sprite): a health inspector under Cut Every Corner (fine, factory closed for a minute); a sock recall for the Devil's Sock (refunds); a rival shop that opens next door and halves traffic until bought out; a bulk order with a deadline; weather on the street; the Family offering "protection" once you are rich.
- A third doctrine branch for logistics (own fleet vs outsourced couriers) at Small Factory.
- Balance the new numbers: loan offers (bank 60%, Sal 200% of assets), interest, outrage and grumble rates are first guesses. Devil's Sock roughly breaks even against argyle without the community doctrine.
- Cars and a day/night cycle on the street; neighbouring shop owners reacting to buyouts.
- Warehouse or shop stock caps so overflow matters.
- Achievements, sound effects (the soundtrack exists), export/import save.
- Balance pass: mid-game around Factory Lines and the first retirement are untuned. Upkeep and mishap rates are first guesses.
