# Happy birthday, Mom: a pixel day trip

A birthday surprise site. Mom, Dad and the two dogs travel a winding path on a pixel-art map of the day, drawn entirely in code: a walk through Lucca, breakfast in Piazza dell'Anfiteatro, a drive up the Serchio valley and a spa day in the marble baths of Bagni di Lucca, ending with a birthday message.

Tap the next signpost (or the button at the bottom) and the family walks or drives there; a card then opens with that stop's scene, animated in code on top of the artwork.

Live (once GitHub Pages is on): https://debruynbrycedbb.github.io/mom-bday-daytrip/

## Change the words

All stop text is in `js/stops.js`. Anything in `[square brackets]` is a placeholder and shows highlighted on the site until you replace it:

- `[Start time]`, `[Meeting point]`
- `[Breakfast time]`, `[Café name]`
- `[Departure time]`, `[Drive time]`
- `[Spa name]`, `[Spa time]`, `[What to bring]`
- `[Your birthday message to Mom]`, `[Your names]`
- `[Date of the trip]` is on the title screen, in `index.html`

After any change, bump `?v=1` to `?v=2` in `index.html` and in every `import` line in `js/*.js` so browsers fetch the new files.

## How it's built

Plain HTML, CSS and JavaScript modules. No build step, no libraries.

- `js/world.js`: draws the whole map pixel by pixel (Lucca's walls, streets, the oval piazza, Torre Guinigi, the river, the Ponte della Maddalena, fields, trees, Bagni di Lucca and the spa) and defines the route (`ROUTE`). Change a stop's position there.
- `js/main.js`: camera, travelling family, HUD, stop cards.
- `js/scenes.js`: the animated scenes (clouds, petals, strolling people, passing trees, rippling water, steam, candles, fireworks).
- `js/sprites.js`: the convertible and the signposts.
- `js/title.js`: the title screen backdrop.
- `js/sound.js`: 8-bit sound effects made with the Web Audio API (off until the visitor turns them on).
- `assets/img/`: images made from the original artwork by `tools/prepare_images.py`.

## Rebuild the images

```bash
pip install pillow
python3 tools/prepare_images.py "/path/to/Mom bday vid"
```

## Test locally

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765/. Add `?debug` to the address to jump between stops from the browser console: `__trip.jump(3)`.

The page has `<meta name="robots" content="noindex">` so it stays out of search results. Remove that line if you want it to be findable.
