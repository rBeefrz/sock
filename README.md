# Sock Tycoon

An idle sock-empire game for the browser. Knit socks in a shack, grow it into a factory full of grannies and machines, send vehicles down the road to your shop, and watch pedestrians on the high street wander in and buy them.

## Run

Open `index.html` in a browser, or serve the folder:

```
npm start        # python3 -m http.server 8080
```

## Test

```
npm test         # runs the simulation tests with node --test
```

## Screen

The two canvases and a KPI strip stay on the page. Everything else (machines, research, fleet, upgrades, marketing, factory and shop upgrades, product, pricing, retirement, save) lives in the hamburger drawer. Pills under the KPIs open the drawer straight to anything that is ready to buy. Styling is neobrutalist: `css/style.css` holds the palette and the `.brut` border-and-shadow rule.

## Layout

- `js/data.js` – every balance number: producers, upgrades, sock lines, marketing tiers, prestige curve. No logic.
- `js/sim.js` – the game simulation as pure state functions. No DOM. Runs in Node too, which is what the tests use.
- `js/scenarios.js` – named test saves for jumping to a stage of the game (drawer → Test saves, or `?scenario=id`), including one for each way things go wrong.
- `js/audio.js` – Sock Radio: four looping tracks synthesised in the browser (chiptune, electro, hip hop, waltz). Each adds layers as the factory and shop grow. The radio widget in the bottom-right corner has previous, play/pause, next and volume.
- `js/format.js` – number and time formatting.
- `js/sprites.js` – drawing helpers shared by both canvases.
- `js/factory.js` – the factory canvas: the building for each level, grannies and machines inside, the stock pile, vehicles loading at the bay.
- `js/street.js` – the street canvas: neighbouring shops, your expanding shop, pedestrians and the purchases they make, vehicles unloading at the door.
- `js/ui.js` – builds the DOM once and refreshes it from state.
- `js/main.js` – game loop, autosave, offline progress.
- `test/sim.test.js` – simulation tests. `test/scenarios.test.js` – every test save is consistent and runs.

The data and sim layers are deliberately engine-agnostic so the design can be ported to Godot later by rewriting only the canvas files, `ui.js` and `main.js`.

## How the economy works

- **Two stocks.** Knitting and machines fill the factory stock. Vehicles carry socks to the shop. Customers buy from the shop stock.
- **Factory levels** from Shack to Spaceport. Each needs money and a lifetime-socks-knitted milestone, and decides which machine blueprints can be researched.
- **Research** costs money and takes time, one project at a time. Three branches so far: machine blueprints, sock patterns, and vehicles plus logistics upgrades. Add an entry to `research` in `data.js` to extend it; prerequisites can be a factory level, a shop level, or other research.
- **Vehicles** are real entities in the simulation: they load at the factory, travel for their trip time, unload at the shop, and return. Each type has a capacity and trip time; logistics research multiplies capacity and cuts trip time. Buying more of a type costs 20% more each time.
- **Hand knitting** is timed: a click starts one sock, which takes a couple of seconds. Extra clicks while a sock is on the needles do nothing. Needle upgrades and Heirloom Threads shorten the time; the Inspiring Example upgrades add a slice of factory output to each finished sock.
- **Machines** knit socks per second. Each one bought raises the next one's price by 15%.
- **Wages and maintenance.** Every machine type has an upkeep slider (0–200% of a base rate) paid continuously from cash. Grannies take bingo breaks, machines break down: at 100% about one outage per type every three minutes, taking 15% of the units out for around 40 seconds. At 0% outages are six times as frequent, at 200% a third. If cash cannot cover upkeep everything is treated as unpaid and outages are at their worst. Offline catch-up averages outages in rather than rolling them.
- **Delivery mishaps.** Each vehicle type has a per-trip chance of a mishap that delays it and may lose part of the load. Driver Training and Satnav research halve the chance.
- **News feed** under the KPIs records outages, mishaps, research, building upgrades, retirement and unpaid upkeep. It is saved with the game.
- **Sales happen on the street.** Pedestrians walk past at a rate set by marketing and the shop's pull. Each one who reaches your door comes in with a probability set by the shop's appeal and your markup. Inside, they buy a basket of socks sized by the shop level, or leave with a "🧦?" bubble if you're sold out.
- **Markup** (50%–200%) scales the sale price. Interest falls with the square of the markup, so 200% markup means a quarter of the customers. Interest is capped at 90%, so late in the game you raise prices until people start walking past.
- **Shop levels** widen the shop across the street's seven lots, raise basket size, appeal and traffic. Each level needs money and a lifetime socks-sold milestone.
- Unsold socks pile up in stock. A clearance sale dumps them at a fraction of the base price.
- When the tab is hidden the canvases pause, so the game moves and sells at the expected rates for the missing time when you return. Offline progress works the same way, capped at 8 hours. Very busy streets draw at most about two pedestrians per second and let each one stand in for several customers, so the numbers stay honest.
- **Sock lines** replace your product with a pricier one. The Devil's Sock branches off the pattern chain: it sells well and upsets the devout, who picket the shop once enough have been sold (a donation to the parish sends them home).
- **Doctrines** are exclusive research. At the Workshop you pick how the factory is run (Knitting Guild, Automate Everything, Cut Every Corner) and at the Sock Shop what kind of shop it is (Pile It High, The Velvet Rope, Everybody's Sock Shop). Each reshapes the multipliers for the rest of the run and holds until you retire.
- **Loans.** Sock Savings & Loan lends against what you own and collects in full when due; a shortfall brings the bailiffs, who seize vehicles, then machines, then the shop, then the factory. Cousin Sal's Friendly Finance lends more, asks nothing, and escalates every 90 seconds after a missed date: a visit, an uninvited granny who skims a third of production, a biker raid that clears the street and half the shelves, then the Family takes the shop.
- **Strikes.** Underpaid or unpaid grannies grumble and eventually walk out for two minutes; paying back wages settles it.
- **Bankruptcy** ends the run when there is nothing left to seize. Lifetime stats and threads already held survive; pending threads do not.
- **Retiring** converts lifetime earnings into Heirloom Threads (square-root curve) and resets the run. Each thread gives +10% production and +10% price.
