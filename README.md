# VolleyGram

A volleyball rotation reference you can actually use courtside. Pick a rotation,
see where all six players stand at the moment of serve — base, serve receive, or
defense — then drag them where you want and save the diagram.

**[Live app → hamtaro626.github.io/VolleyGram](https://hamtaro626.github.io/VolleyGram/)**

Built phone-first: it has to work one-handed, standing up, in a gym.

## What it does

- **Rotations 1–6** for **4-2, 5-1 and 6-2** systems
- **Three formations** — base, serve receive (2–5 passers), and defense
  (perimeter, or rotation / 6-up), computed from who's on court
- **Drag players anywhere**; positions save per rotation, so all six are
  independent diagrams
- **Overlap-legality checking** — flags FIVB 7.4 violations at the moment of
  serve (base formation only, on purpose)
- **Quiz mode** — tap the zone where a player belongs
- **Rosters** of 2 to 12 players, custom names, per-rotation role overrides,
  configurable sub entry slot
- **Short-handed play** — turn up with five and the empty zone rotates with you,
  including the rotation where nobody is left to serve
- **Multiple saved lineups**, plus 40-deep undo
- **Export to image**, single rotation or all six, optional transparent
  background
- **Share links** that carry the whole diagram in the URL — no server involved

## Stack

Three static files and nothing else.

```
index.html      structure and controls
style.css       ~17 KB
script.js       ~82 KB, all application logic
SPEC.md         the design log — read this first
test/
  migration.js  424 checks: storage, migration, roles, formations, quiz,
                sharing, dragging, short-handed rosters
  contrast.js   colour contrast and hue separation, parsed out of style.css
```

**No build step. No dependencies. No package.json. No backend.** No accounts, no
database, no sync. That is a deliberate constraint to allow flexible 
compatibility across various devices — see *Still does NOT do* in [SPEC.md](SPEC.md).

## Running it

Open `index.html` in a browser. That's genuinely it — there's no fetch and there
are no ES modules, so `file://` works.

If you'd rather serve it (closer to production, and share links behave the same):

```sh
python3 -m http.server 8000
# then http://localhost:8000
```

Opened off the filesystem, the version marker in the corner reads `dev` instead
of a number. That's expected — see *Bumping the version* below.

## Tests

```sh
node test/migration.js    # 424 checks across 41 groups
node test/contrast.js     # colour contrast and hue separation
```

Plain Node scripts, no runner, no install, no config. Any recent Node works.
Both print `ALL PASS` and exit 0. Run both before opening a PR; there's no CI to
catch it for you.

### The rule that matters most

**Neither suite contains a copy of what it tests.**

- `migration.js` reads `script.js` off disk and executes it against a stubbed
  DOM, so it exercises the shipped code rather than a re-implementation.
- `contrast.js` parses colours straight out of `style.css`, so the palette it
  checks is the palette that ships.

A test holding its own copy of the logic will eventually pass while the app is
broken — the copy drifts from the original and the test keeps checking the copy.
If you add tests, keep reading from the real source files.

What the stub *can't* catch: layout, rendering, whether three buttons fit across
a phone, whether a drag feels sluggish. Those need a real browser and a real
thumb.

## How the code is organised

`script.js` is one file, top to bottom:

| Region | What's there |
|---|---|
| Constants | `SLOT_POSITIONS`, `ZONE_NAMES`, `FORMATIONS`, `DEFENSE_SPOTS`, `OVERLAP_*`, tunables like `DRAG_MIN` and `HISTORY_LIMIT` |
| Roles & systems | `ROLE_LABELS`, `SYSTEMS`, `rosterFromSystem()` |
| Storage | `STORAGE_KEY`, `STORAGE_VERSION`, `load()`, migrations |
| State | `store`, `saved`, `currentRotation`, `currentFormation`, `history` |
| Rendering | court, players, labels, zone targets |
| Interaction | drag, swipe, quiz, roster, export, share |

Court numbering, net at the top:

```
  4   3   2     front row
  5   6   1     back row  (1 serves)
```

Players rotate clockwise: 2→1, 1→6, 6→5, 5→4, 4→3, 3→2.

## Things to know before changing something

**Formations are generated, not tabulated.** Serve receive and defense are
computed from who is on court and what they play. A lookup table would be more
authoritative right up until someone has seven players, reorders the lineup, or
overrides a role for one rotation. Don't replace the computation with a table.

**Storage is versioned and must migrate.** `STORAGE_VERSION` is 2. Real users
have real saved lineups in `localStorage`; if you change the shape, migrate the
old one and add a case to `migration.js`. Its coverage already runs to every
historical shape, missing `activeId`, and nine kinds of corrupt input.

**Bump the cache-busting version on any CSS or JS change.** `index.html`
references `style.css?v=0.20` and `script.js?v=0.20`. Browsers cache by URL, so
without a bump phones keep serving the old file. Both references need it, and
`APP_VERSION` is derived from the script's own `?v=`, which is why the corner
marker reads `dev` on `file://`.

**No NUL bytes in source.** `migration.js` asserts this. One slipped in during
v0.10 from a mis-written escape — it ran fine but made the file binary to `grep`,
`git diff`, and editor search.

**Some features are browser-gated.** `navigator.share`, `navigator.canShare` and
`navigator.clipboard` aren't everywhere; image export uses `canvas.toBlob`.
Degrade, don't assume.

## Contributing

1. Fork, then branch off `main`.
2. Make the change. Match the surrounding style — the codebase uses plain
   functions, no framework, and comments that explain *why* rather than *what*.
3. Run **both** test suites.
4. Add tests for logic changes, reading from the real source files.
5. Update [SPEC.md](SPEC.md) if you changed behaviour (see below).
6. Open a PR describing what changed and why.

Poke at it on a phone before you're confident. That's the whole target platform,
and the stubbed tests can't see it.

### SPEC.md is the design log

It's not boilerplate. It records, version by version, what was built and *why* —
including things that were tried and removed (redo, in v0.13), decisions that
were reversed, and a **Delivered — do not re-plan these** table that exists
because the "not doing" list went three versions without being corrected.

Read it before proposing something; it may already have been decided, built, or
deliberately rejected. Keep it current when you change behaviour.

## Status

v0.20. Working title, actively developed, no issues or PRs open yet.

## License

[MIT](LICENSE) — © 2026 Alec Vogelsang.

Fork it, change it, build it into something else. Keep the copyright notice, and
understand it comes with no warranty.
