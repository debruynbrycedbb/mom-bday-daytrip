# Happy birthday, Mom: a pixel day trip

A birthday surprise site. Mom, Dad and the two dogs travel a winding path on a pixel-art map of the day, drawn entirely in code: a walk through Lucca, breakfast in Piazza dell'Anfiteatro, a stroll through a park (where dog 2 chases a lizard up a tree), a drive up the Serchio valley (with a 7-second cutscene of the family in the car) and a spa day in the marble baths of Bagni di Lucca, ending with a birthday message.

Everything on the map is to scale: Mom and Dad are 15-16px tall (about 1.7 m), so 1 m ≈ 9px. Doors are about 2 m, houses have 1-3 floors, trees are 6-7 m and the dogs come to about half a person's height. The lizard is drawn a little larger than life so it can be seen. Only the distances between places are shortened. The family's map sprites are hand-drawn pixel art in `js/sprites.js` (a shrunk copy of the artwork turns to mush this small).

Tap the next signpost (or the button at the bottom) and the family walks or drives there; a card then opens with that stop's scene, animated in code on top of the artwork.

Live (once GitHub Pages is on): https://debruynbrycedbb.github.io/mom-bday-daytrip/

## Change the words

All stop text is in `js/stops.js`. Anything in `[square brackets]` is a placeholder and shows highlighted on the site until you replace it:

- `[Start time]`, `[Meeting point]`
- `[Breakfast time]`, `[Café name]`
- `[Spa name]`, `[Spa time]`, `[What to bring]`
- `[Your birthday message to Mom]`, `[Your names]`
- `[Dog 2’s name]` shows in the status line during the lizard chase (in `js/main.js`, `updateHud`)
- `[Date of the trip]` is on the title screen, in `index.html`

After any change, bump the version (currently `?v=6`, so next `?v=7`) in `index.html`, in every `import` line in `js/*.js` and in `loadImage` in `js/main.js`, so browsers fetch the new files.

## How it's built

Plain HTML, CSS and JavaScript modules. No build step, no libraries.

- `js/world.js`: draws the whole map in code (Lucca's walls and gates; inside them a grid town of lanes with centre lines and zebra crossings (`ROADS_V`, `ROADS_H`), blocks of clustered houses with gardens, trees, benches and lamps, the fountain square (`SQUARE`); the oval piazza with its two passages, Torre Guinigi, the park, the river, the Ponte della Maddalena, fields, trees, Bagni di Lucca and the spa) and defines the route (`ROUTE`) and the lizard's run (`CHASE`). The ground is painted in 256px tiles as the camera needs them.
- `js/main.js`: camera, travelling family, the lizard chase (timeline in `EV`), HUD, stop cards.
- `js/scenes.js`: the animated scenes on the stop cards (clouds, petals, strolling people, rippling water, steam, candles, fireworks).
- `js/cutscene.js`: the drive cutscene. The car picture is cut into layers (car, front, Mom's and Dad's heads, both dogs) so the countryside can stream past, the car bumps, Mom and Dad bob, and the dogs hop about the back seat and turn to look out of each side, barking ("YIP!" for dog 1, "WOOF!" for dog 2, with a bark sound for each and wind noise if sound is on). They always stay inside the car. The dogs' moves are in `ROUTINE`, the barks in `BARKS`. The scenery is removed from the picture by filling out from the sky and the view through the windscreen, stopping at dark outlines, so the frame and Mom's hat stay intact. Timing: 3 s of driving on the map, the 7 s cutscene, then about 3 s more to the baths (`DRIVE_BEFORE_CUT`, `CUT_LENGTH`, `DRIVE_AFTER_CUT`).
- `js/sprites.js`: Mom, Dad and the dogs on the map (with walking frames), the convertible, the signposts and the lizard.
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

Then open http://localhost:8765/. Add `?debug` to the address to use these from the browser console:

- `__trip.jump(3)`: go straight to a stop
- `__trip.park()`: walk into the park just before the chase
- `__trip.chase(6)`: jump into the chase at 6 seconds
- `__trip.drive()`: stand by the car and set off on the drive (the cutscene starts after 3 s)
- `__trip.freeze()` / `__trip.freeze(false)`: hold time still to look at a moment

The page has `<meta name="robots" content="noindex">` so it stays out of search results. Remove that line if you want it to be findable.
