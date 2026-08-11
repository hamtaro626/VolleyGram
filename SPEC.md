# Volleyball Rotation Reference — v0.1

## The job

Open it courtside on my phone, pick a rotation, see where all six players
stand at the moment of serve.

## Decisions

- **System:** 4-2. Two setters, opposite each other, setter always front row.
- **Formations:** Base rotation only — legal starting positions at serve.
- **Device:** Phone first. Must work one-handed, standing up, in a gym.
- **No backend.** No accounts, no saving, no database. Static files only.

## Roles

Six players, three pairs:

| Code | Role |
|------|------|
| S1, S2 | Setters |
| MB1, MB2 | Middle blockers |
| OH1, OH2 | Outside hitters |

## Starting lineup

Listed in rotation order, starting at slot 1:

```
S1, MB1, OH1, S2, MB2, OH2
```

The setters are three slots apart. That gap is what guarantees exactly one
setter is front row in all six rotations — the whole point of a 4-2.

## Court slots

Volleyball's numbering, net at the top:

```
  4   3   2     front row
  5   6   1     back row  (1 serves)
```

Players rotate clockwise: 2→1, 1→6, 6→5, 5→4, 4→3, 3→2.

## v0.1 does

- Show the court with net and attack line
- Show six labeled players at their base positions
- Switch between rotations 1–6 (tap a number, or prev/next)
- Highlight which setter is front row
- Drag a player to adjust, and reset back to base

## v0.2 — the whiteboard

Added after using v0.1 and forming an opinion about it.

- Dragged positions save **per rotation**, so all six are independent diagrams
- Players slide between rotations, so the movement is visible
- Editable roster — real player names instead of S1/MB1/OH1
- Colour-coded by role: setters gold, middles teal, outsides indigo
- Small role label under each name, toggleable
- Everything survives a refresh (localStorage — still no server)
- Reset the current rotation, or reset all six

## v0.3 — bigger rosters

- Add players beyond six, up to 12
- The rotation becomes a ring: the first six spots are the court, the rest are
  the bench. The server rotates off, the next player returns at middle back.
- A roster of N players has N rotations, not 6
- Per-player role dropdown; off-court players dimmed
- Dropped the front-row-setter ring (the status line still names them)
- Most recently grabbed player stacks on top

Adding or removing anyone resets all layouts, since who stands where changes in
every rotation and saved coordinates would no longer mean anything.

Note: beyond six players, "exactly one setter front row" stops being guaranteed
— that property is specific to a six-person 4-2. The status line reports what's
actually true rather than pretending.

## v0.4 — undo, reordering, configurable subs

- Undo button, 40 steps deep. Snapshots the whole saved state before any change.
- Reset-all moved out of the roster panel, and now needs a 1.5s hold
- Reorder the lineup with ▲▼ in the roster panel
- "Subs enter at" setting, default **Zone 1 (right back, serve)**

Zone numbering is the standard one: 1 = right back, 2 = right front,
3 = middle front, 4 = left front, 5 = left back, 6 = middle back. Travel order
is 1 → 6 → 5 → 4 → 3 → 2 → 1.

The entry setting works by rotating the list of zones and always parking the
bench at the end of it. Whichever zone leads is where subs walk on; whichever
trails is where players rotate off. Rotation 1 still puts roster row N in zone N
whatever the setting is.

Bench seating changed with this version: players rotate off into the leftmost
seat and advance rightward, walking on from the right end — which sits next to
Zone 1 at bottom right. Only visible with 8+ players.

## v0.5 — offensive systems

A system dropdown at the top: **4-2**, **5-1**, **6-2**. Adds an Opposite role
(magenta). Switching carries names across by lineup position, so your fourth
player stays your fourth player even though their role changed; players past the
sixth are left alone.

The real distinction is which setter sets:

| System | Setters | Sets from | Front-row attackers |
|--------|---------|-----------|---------------------|
| 4-2 | 2, opposite | front row | 2 |
| 6-2 | 2, opposite | back row | 3 |
| 5-1 | 1 | anywhere | 3 when back row, 2 when front |

4-2 and 6-2 run the *same* lineup — only `setsFrom` differs. The status line
reports who's setting under the current system, and for a 5-1 also reports the
front-row hitter count, since that's what changes rotation to rotation.

## v0.6 — saved lineups

Multiple named lineups, switchable from a dropdown at the top. New, Duplicate,
Rename and Delete live in the roster panel. Undo covers all of them, including
delete.

Each lineup owns its own system, roster, layouts and entry zone. `showLabels` is
global, since it's a display preference rather than a fact about a team.

### Storage shape

```
{ version: 2, activeId, showLabels, lineups: { id: {name, system, roster, layouts, entrySlot} } }
```

The localStorage key deliberately did **not** change, so data written by every
earlier version is found and upgraded rather than orphaned. `normaliseLineup()`
accepts all four historical shapes:

| Version | Shape |
|---------|-------|
| v0.2 | `{ names: {id: name}, layouts }` — names in a side lookup |
| v0.3 | `{ roster: [...], layouts }` — names moved onto the roster |
| v0.4 | adds `entrySlot`, `fallback` |
| v0.5 | adds `system` |

It also defends against merely broken data, since the blob is editable in
devtools and one bad field shouldn't white-screen the app. Startup writes the
upgraded shape straight back, so old shapes don't linger.

## v0.7 — Simple mode and readable colours

**Simple** added to the systems dropdown: six numbered spots, no roles. Its
status line says only which rotation you're on, since there's no setter to name.
**No role** is also available per-player in any system, so a 4-2 can have an
undecided seventh. New players default to it rather than guessing a position.

All player names are now white, on every role. The old gold and teal were far
too light for white text — 2.34:1 and 3.28:1 — which is why those two used dark
text and the court looked inconsistent. Every role now sits in a 5.5–6.7:1 band:

| Role | Colour | Contrast |
|------|--------|----------|
| Setter | `#8f5f10` | 5.51:1 |
| Middle | `#116b5f` | 6.38:1 |
| Outside | `#4055b8` | 6.54:1 |
| Opposite | `#9c4285` | 5.95:1 |
| No role | `#5c5c5c` | 6.69:1 |

Hues stay 58°+ apart so roles remain tellable apart. "No role" is deliberately
neutral grey — unset shouldn't look like a position.

## v0.8 — per-rotation roles, image export, black text

- Roster button reads **Show roster** / **Hide roster**
- **Per-rotation roles.** A "Role edits apply to" setting in the roster panel
  switches between *All rotations* (the base role) and *This rotation only* (an
  override). Overridden players get a ring on their swatch, and a button clears
  all overrides. Useful for a 6-2 setter who hits when front row, or a libero
  covering a middle in the back row.
- **Save as image.** Redraws the current rotation onto a canvas and downloads a
  PNG, captioned with the lineup name and rotation.

### Colour palette, corrected

v0.7 darkened the fills so white text would pass contrast. That was the wrong
direction — bright fills with near-black text get *more* contrast, and keep the
palette vivid. The setter's gold reaches **7.59:1** this way versus 2.34:1 with
white text. Only indigo and magenta needed lightening.

| Role | Colour | Contrast with `#16181d` |
|------|--------|------------------------|
| Setter | `#d8a029` | 7.59:1 |
| Middle | `#2f9e8f` | 5.42:1 |
| Outside | `#8494e6` | 6.22:1 |
| Opposite | `#d47cbd` | 6.27:1 |
| No role | `#a8a8a8` | 7.47:1 |

### Known cost of the export

Drawing to a canvas describes the court a second time, so a CSS change can leave
the exported image looking different from the screen. Colours are read back out
of the live stylesheet with `getComputedStyle` to limit the drift, but geometry
(net, attack line, bench strip) is duplicated. Worth remembering when editing
either one.

`roleOverrides` was added without a version bump — an extra optional field that
defaults to `{}` breaks nothing, so old saves need no special handling.

## v0.9 — courtside conveniences

- **Zone numbers** on the court, faint, one per cell. Also drawn in exports.
- **Swipe** left/right across empty court to change rotation. Swipes starting on
  a player are ignored, so dragging someone sideways doesn't flip the rotation.
- **Serve ring** on whoever is in zone 1.
- **Arrow keys** for prev/next, unless focus is in a field or dropdown.
- **Save all rotations as one image** — a contact sheet, two across, titled and
  captioned. A single file rather than a burst of downloads, which browsers block
  after the first anyway.
- Labels and Save as image now share a row; roster toggle gets its own.

The export was refactored into `drawRotation(ctx, rotation, EDGE, hasBench)` so
single and batch export share one drawing routine. `describeRotation(rotation)`
now takes a rotation rather than always reading the current one.

One trap avoided: the batch export reads `saved.layouts[rotation]` directly
rather than calling `layoutFor()`, which lazily *writes* default layouts. Going
through it would have persisted layouts for every rotation the moment you
exported, whether you'd opened them or not.

## v0.10 — drag to reorder, labelled server

- **Drag handle** (`⠿`) on each roster row replaces the up/down arrows. Arrow
  keys still work when the handle has focus, since a drag-only control is
  unusable from a keyboard.
- **"Server" pill** on the ring around whoever is in zone 1, in the app and in
  exports.

Drag runs on pointer events, not HTML5 drag-and-drop, which doesn't fire on
touch. The dragged row's DOM node is moved directly rather than rebuilding the
list on each `pointermove` — rebuilding would destroy the element mid-drag and
the pointer capture with it. The roster array is rewritten once, on release, so a
drag costs one undo step rather than one per pixel.

`applyRosterOrder()` keeps any player the incoming order left out, appending them
at the end. A malformed order can shuffle the lineup but can never delete anyone.

Curved perimeter text was considered for the server label and rejected: at phone
size it renders about five pixels tall, less readable than the plain ring it was
meant to clarify.

## v0.11 — formations

Three tabs under the court: **Base**, **Serve receive**, **Defense**. Each keeps
its own set of six per-rotation layouts, so they're three independent
whiteboards. Dragging in one never touches the others.

### Generated, not tabulated

Base positions come from the rulebook. Receive and defense don't have one right
answer, so they're **computed** from who's on court and what they play rather
than looked up in a fixed table. A table would be more authoritative and would
break the moment there are seven players, a reordered lineup, or a per-rotation
role override — all of which this app allows. Drag fixes anything the rules get
wrong, and a dragged position always wins.

**Serve receive keeps everyone in their own row.** A back-row player never runs
up to the net; a front-row player never drops in behind them. That's what keeps
the formation legal at the moment of serve, and it's how the two rows actually
play. The first version of this got it wrong and had back-row players releasing
to the net.

Passers are taken from the **back row first** — they're already there, and pulling
a front-row hitter back to pass costs an attacker. In a 4-2 each row holds one
setter, one middle and one outside, so three passers works out to exactly the back
row, including the back-row setter (who isn't the one setting). Passer count is
selectable: 2, 3, 4, or 5. Three back plus two front is the classic W.

Two different orderings, deliberately:

- **Passers** are placed left to right by where they already stand, so they don't
  cross on the way to their spot.
- **Front-row players at the net** are placed by role — middle to the middle,
  outside to the left pin — whatever zone they rotated in from. That crossing
  *is* the switch, and it's what front-row players actually do.

The setter goes to the setting spot, or stays behind the attack line if they're
back row; they come up after the serve is contacted, not before it.

This is the switch that base positions can't express — where people actually go
once the ball is in the air. It was explicitly out of scope in v0.1.

**Defense** puts the two front-row players nearest the ball on the block, pulls
the third off to cover, and gives the back row the three dig spots. Perimeter and
Rotation / 6-up are both available, and the attack side flips (perimeter against
an attack from your left is the mirror of one from your right).

### Libero

A sixth role, in no system's default lineup — it exists if you assign it and
stays out of the way otherwise. It always passes and, being a back-row
specialist, naturally lands on a dig spot. Real libero substitution (swapping for
a middle rotating to the back) is **not** implemented.

### Storage

`layouts` is now keyed by formation first: `{ base, receive, defense }`, each
holding rotations. A save whose `layouts` has numeric top-level keys is
pre-v0.11, and everything in it was a base layout.

`layoutFor()` is gone. It lazily *wrote* default layouts as a side effect, which
made merely reading a rotation persist data. `positionsFor()` replaces it and
writes nothing: generated defaults with dragged positions spread on top. Reset
now deletes the dragged bucket rather than freezing defaults into it.

## v0.12 — quiz mode and transparent export

### Quiz

**Start quiz** picks a random rotation and a random on-court player, hides
everyone, and asks which zone that player is in. Tap a cell on the court to
answer. Right answer turns green, wrong turns red and names the correct zone.
Either way the formation is **revealed** once you answer, so a wrong guess still
teaches you the whole rotation instead of just marking you down.

Score tracks correct/asked plus current and best streak. Session only — not
persisted.

The answer comes from `slotFor()`, the same function that draws the court, so the
quiz can never disagree with the diagram. `ZONE_REGIONS` maps the six zone
*areas* (front row is the top third, back row the bottom two thirds), as distinct
from `SLOT_POSITIONS`, which says where a player stands within one.

While a quiz runs, the pickers, formation tabs, rotation buttons, roster and
status line are hidden, and swipe and arrow keys are disabled — all of them would
either give away the answer or navigate away from the question.

### Transparent export

A checkbox in the roster panel. When on, exports skip the page background *and*
the court fill, leaving lines, zone numbers and players on transparency. PNG
already carries an alpha channel, so "transparent" is just not painting those two
rectangles. Filenames get a `-transparent` suffix.

The court lines are deliberately kept — they're what you line the diagram up
against when compositing over real footage.

## v0.13 — controls in thumb order

The formation tabs moved up to sit directly under the court. Choosing between
base, serve receive and defense is the thing this app is for, so it shouldn't be
below two rows of buttons. Everything else fell in behind it, roughly in the
order you reach for it: formation tabs, formation options, prev/next, undo and
reset, then the rotation numbers.

A base `button` rule came back into `style.css`, having gone missing somewhere
around v0.12 — buttons were rendering as plain white iOS controls on a phone.
`-webkit-appearance: none` is the part that matters: without it, Safari paints
its own control styling straight over yours.

### Redo, added and dropped

Redo shipped in the first v0.13 commit and was gone by the second.
`applySnapshot()` and `syncHistoryButtons()` went with it, collapsing back to the
`undo()` and `syncUndoButton()` that are there now.

Neither commit message records *why* it was dropped, which is a gap worth
filling — a feature that was built and then deliberately removed is exactly the
kind of decision this document exists to hold onto.

## v0.14 — VolleyGram

Named at last, after Rotato and VballPlan. The `<h1>` now carries both the name
and what it is — "VolleyGram – A Volleyball Rotation Reference" — on a single
line at any width, via `clamp(0.7rem, 3.3vw, 1.1rem)` plus `white-space: nowrap`.
The `<title>` stays short, because tabs and home-screen shortcuts truncate. The
lineup picker became "VolleyGram Name" rather than "Team/Rotation Name": one
word for the thing the app makes.

### The ring moved to the setter

The ring used to mark the server. It now marks whoever is **setting** this
rotation, and the server keeps the labelled pill on its own.

Two rings on one court compete for attention, and of the two facts the setter is
the one worth pointing at — which setter it is changes with the system and the
rotation, whereas the server is always just whoever is in zone 1.

`settersThisRotation()` feeds both the ring and the status line, so the diagram
and the words under it can't drift apart. Exports draw the same ring from the
same function.

### Crimson for no role

`#a8a8a8` grey → `#e8707f`.

**This reverses v0.7**, which made unset deliberately neutral grey on the grounds
that unset shouldn't look like a position. The reason recorded in the CSS is
clearance: crimson is the last hue with real separation left, since green and
cyan sit too close to the middle's teal and anything oranger runs into the court
underneath. It lands 37° from the opposite's pink — the tightest pair on the
court, and the reason `contrast.js` checks hue separation as well as contrast.

What isn't recorded is why grey needed replacing at all. The two versions
disagree in this document on purpose, until that's settled.

### The quiz keeps the server visible

The server is no longer hidden along with everyone else, and can no longer be
the subject of the question. Knowing who's in zone 1 turns the question from
blank recall into something you can reason out — and if the server *were* the
answer, it would be sitting right there in plain view.

## v0.15 — share links and Save to Photos

### The link is the data

The whole VolleyGram is packed into the URL itself, so sharing needs no server,
no accounts and no database. The app stays three static files on GitHub Pages.

The payload rides in the **hash** (`#g=…`) rather than a query string, which
means it is never sent to GitHub's servers — fragments stay in the browser.
Encoding is URL-safe base64: `+`, `/` and `=` all mean something inside a URL, so
they're swapped out. `TextEncoder` runs first, because `btoa` can't handle a name
with an accent or an emoji in it.

This only works because `layouts` stores dragged positions and nothing else. An
untouched VolleyGram carries no coordinates at all, so a typical link is around
800 characters rather than tens of kilobytes. Past 8000 the app refuses and says
so, rather than handing out a link that arrives truncated.

Opening a shared link **adds** a VolleyGram. It must never overwrite what the
person already has. The hash is cleared either way once it's been read, so a
refresh can't import a second copy and a broken link can't fail twice.

### Save to Photos

A plain `<a download>` is the desktop path, and on iOS it drops the file into
Files — there's no way to reach the camera roll from a download. The share sheet
can: it offers "Save Image", plus Messages and AirDrop, which is what you
actually want courtside. So `saveCanvas()` tries `navigator.share({ files })`
first and falls back to downloading.

A cancelled share sheet rejects the same way an unavailable one does, so the
fallback deliberately does *not* fire on failure. Downloading the file after
someone taps Cancel would be worse than doing nothing.

### `.setting` was matching the player circles

The setter ring's class is `is-setter`, not `setting`. A bare `.setting` rule
further down the stylesheet styles the roster panel's labelled rows, and it
happily matched the player circles too — greying the name, forcing it onto one
line with the role, and resizing it. `migration.js` now checks that no class
used on a player is also a bare CSS selector.

## v0.16 — a tap is not a drag

### Tapping a player used to pin it

`endDrag()` wrote into the saved layout unconditionally, so merely *touching* a
player converted its generated position into a dragged one. Dragged always beats
generated, so that player then stopped responding to the passer count and the
defensive system — a stray tap courtside quietly broke the formation it landed
on, and cost an undo step for nothing.

Dragging now needs 3px of travel (`DRAG_MIN`) before it moves anything, pushes
history or saves. `pushHistory()` moved from `startDrag()` to the first
qualifying `onDrag()`, so a tap costs neither a stored position nor an undo step.
Same reasoning as `applyRosterOrder()`, which already refused to act on a reorder
that reordered nothing.

### Coordinates are checked, not trusted

Dragged coordinates arrive from localStorage and from share links, both of which
anyone can hand-edit. They were copied into the store unchecked. A `null`
position survived the spread in `positionsFor()` and threw on `position.x` in
`render()`, white-screening the app before it drew anything — reachable by
anyone who could get a link tapped, not just via devtools.

`normalisePositions()` now requires finite numbers and clamps them to the same
bounds a live drag is held to, so a hand-edited value can't park someone off the
edge of the diagram where they can't be grabbed back. Out-of-range numbers are
clamped rather than dropped: the coordinate was real, so the player is pulled
back onto the court instead of snapping to wherever the formation would have
generated for them. `normaliseRotations()` drops non-numeric rotation keys and
empty buckets, which were dead weight in every save and every share link.

### Cache busting

`?v=` on both `style.css` and `script.js`, with a test asserting the two stay in
step. Bump it on any release that touches either file, or phones that already
have VolleyGram open will go on serving themselves the previous version — which
looks exactly like a fix that didn't work.

## v0.17 — fewer button rows

### The stack below the court was getting long

Five separate rows of buttons sat under the rotation numbers, each its own
`.actions` block, and every version had added one. Now three:

| Row | Buttons |
|-----|---------|
| 1 | Labels · Save image · Share |
| 2 | Quiz Mode · Show roster |
| 3 | Hold to reset all |

Grouped by what they're for: get the diagram out of the app, open a panel that
takes over the screen, and then the destructive one. **Hold to reset all moved
last and stays alone** — it's the control you least want a thumb to find on the
way past, so nothing sits beside it and nothing follows it.

Two labels shrank to fit three across: "Save as image" became "Save image" and
"Share this VolleyGram" became "Share". Three columns on a 320px phone leaves
about 100px each, which is narrower than a word and a half at the default size,
so `.actions.compact` drops to the same 0.8rem the formation tabs already use
rather than letting the labels wrap.

### Smaller things

- **Formation tabs carry `aria-pressed`.** Which tab was selected had been
  conveyed by colour alone, which says nothing aloud. Set in
  `syncFormationControls()` next to the `active` class, so the two can't drift.
- A mangled comment in `drawRotation()` — an edit had dropped a clause and left
  a sentence that didn't parse. The same thought is stated correctly on
  `positionsFor()`.
- **This document caught up.** v0.13, v0.14 and v0.15 had shipped undocumented,
  and the "Still does NOT do" list was claiming seven delivered features were out
  of scope. Reconstructed from the commit diffs rather than the commit subjects,
  which turned out to matter: the v0.12 quiz work actually shipped inside the
  commit titled "v0.13: redo support, reordered controls".

## v0.18 — version marker and a watermark

### The version, in the corner

A small `v0.18` pinned bottom-right, dim and `pointer-events: none` so it can
never swallow a tap.

The number is **read out of this script's own URL** — `document.currentScript.src`,
parsed by `versionFrom()` — rather than kept in a constant beside it. A constant
would be a third place the version lives and a third place it can drift.

More usefully, reading the served URL makes the marker answer the question you
actually have. `index.html` carries no cache buster of its own, so it's the file
most likely to be stale on a phone. If a phone is holding an old `index.html`, it
requests the old `script.js?v=`, and the corner reports the **old** number —
which is exactly what you want to see when someone says a fix didn't land.

Falls back to `dev` when there's no `?v=`, which is what you get opening the file
straight off the filesystem.

### Watermark on exports

`drawWatermark()` puts a small "VolleyGram" on every exported image,
right-aligned opposite the caption and dimmer than it, so it signs the diagram
rather than competing with the court.

Drawn **once per file, not once per court** — a contact sheet of six rotations
wants one mark, not six. So it's called from `exportImage()` and
`exportAllRotations()` rather than from the shared `drawRotation()`, which is the
opposite of where the setter ring and zone numbers live.

The caption and the contact sheet's title now take an explicit width, since
they're sharing a line with the mark and a long lineup name would otherwise run
underneath it.

It draws on transparent exports too. Like the court lines, it's ink rather than
background — a diagram composited over real footage is precisely the one most
likely to travel without the app attached.

## v0.19 — overlap legality

### The rule

FIVB 7.4: at the moment the ball is hit by the server, every player must hold
their rotational order relative to their neighbours.

- **Laterally:** 4 left of 3, 3 left of 2; 5 left of 6, 6 left of 1
- **By column:** 4 ahead of 5, 3 ahead of 6, 2 ahead of 1

Only *adjacent* pairs are compared. Zone 4 against zone 2 isn't a rule — it
follows from the two lateral checks. Standing exactly level is legal: the rule is
about crossing a neighbour, and a diagram that cried wolf over a hair's
difference would be worse than useless.

The app doesn't model which team is serving, so all six checks apply uniformly.
In the real rule the server is exempt from being *inside* the court, which this
doesn't attempt to represent.

### Base only, on purpose

Running the rule against the app's own generated formations before building
anything gave the reason:

| System | Base | Serve receive |
|--------|------|---------------|
| 4-2 | 0 violations | 4 |
| 5-1 | 0 | 8 |
| 6-2 | 0 | 12 |
| Simple | 0 | 10 |

Base is clean everywhere — legal by construction, since the positions *are* the
zones. Serve receive breaks the rule in every system, and every breach is
lateral, because v0.11 places front-row players by role: middle to the middle,
outside to the left pin, whatever zone they rotated in from. That crossing is the
switch, and a switch made before the serve is contacted is exactly what an
overlap violation is.

So the receive view is drawing the moment *after* contact. Checking it would
flag the app's own defaults in every rotation of every system, which reads as a
broken app rather than an early switch. Defense is further past contact still,
when the rule has stopped applying at all.

That leaves base — where every flag is something **you** dragged, which is the
mistake worth catching. `test/migration.js` now asserts base is legal across all
four systems, all six rotations, and two entry zones, so the invariant can't
rot quietly.

### Surfacing

Off by default, toggled from the roster panel beside the transparent-export
checkbox — no new row in the main column.

When on and base is showing, offending players get a dashed red **outline** and
the status line reports the count. An outline rather than another box-shadow: the
setter ring already owns box-shadow and two rings on one circle would fight.

The status line says `overlap legal` when the court is clean, not just when it
isn't — otherwise a legal court is indistinguishable from the check being off.
Each flagged player's tooltip names the specific rule, since a red ring alone
doesn't say which way to drag.

`checkOverlap` defaults to `false`, so older saves need no version bump.

### `endDrag()` has to redraw now

`endDrag()` never called `render()`. It didn't need to: `onDrag()` had already
moved the circle, so there was nothing left to update, and skipping the redraw
kept a drag cheap.

Overlap checking broke that assumption. The marks and the status count are worked
out **inside** `render()`, from where the player just landed — so without a
redraw a breach stayed invisible until something else triggered one. Changing
rotation did, which made it look like violations only appeared after rotating
away and back.

Worth remembering when adding anything else that reads positions: **whatever
mutates a layout has to redraw**, even when the pixels already look right. The
guard is in `test/migration.js` §39, which drags a player into a breach and
asserts the status line updates without any manual `render()` call.

### Tab order

Formation tabs are now Base · Defense · Serve receive. Purely presentational —
everything reading `FORMATIONS` iterates or indexes into it, so storage is
untouched.

## v0.20 — short-handed rosters

Turn up with five and you can still diagram it.

### Five players is not a five-player game

The tempting model is a roster size of five meaning five court slots. It's wrong.
Short a player, you still play a **six-zone, six-rotation** game — you have five
bodies and one *vacancy*, and the vacancy rotates around the court exactly like a
player would. Model it as five slots and you get five rotations, a five-zone
court nobody plays on, and an overlap table for the wrong shape.

So roster size and court size are separate things. `cycleLength()` is
`max(rosterSize, COURT_SPOTS)`: above six it grows, because the extras have to
cycle through the bench; below six it does **not** shrink.

`rotationCount()` returns that, and `cycleIndex()` takes its modulus from it,
which is the whole mechanism. The hole travels because the cycle is longer than
the roster.

Two things fell out for free. Nobody is ever benched short-handed —
`cycleIndex` can't reach `COURT_SPOTS` when the cycle is only that long, so
`slotFor` never returns null. And `overlapViolations()` already skipped pairs
where either zone was empty, so an absent player is vacuously legal with no
change at all.

### It used to delete your team

```js
if (roster.length < COURT_SPOTS) roster = rosterFromSystem(system);
```

Anything under six was discarded and rebuilt from the system default — names and
all. A hand-edited share link with five players came back as the stock six and
nothing said why. The floor is now `MIN_PLAYERS`, and between that and six the
roster is kept exactly as saved.

`MIN_PLAYERS` is 2, deliberately more permissive than any league's forfeit rule.
This is a diagramming tool rather than a referee, leagues disagree, and a smaller
court will eventually want to go below four. Below the floor a save is likelier
corrupt than deliberate, so it still rebuilds.

Removing a player is no longer restricted to the seventh and beyond — that
restriction was the only thing making a short roster unreachable from the UI.
Every row gets a remove button until the roster is down to `MIN_PLAYERS`.

### The rotation that costs you

Once per cycle the vacancy reaches zone 1 and there is nobody to serve. The
status line says `no server, zone 1 is empty`, because it's the rotation that
actually costs you something and it's hard to read off a diagram — the answer is
an absence, and absences don't draw.

What it costs is a league question: a lost rally, a forfeit, or nothing. So the
app states the fact and stops. `zoneOccupied(zone, rotation)` is the new
predicate behind it.

### Passer counts clamp to who's there

Receive generation already clamped to the queue length, so nothing was broken —
but the dropdown offered five passers with four players on court, which quietly
meant something else. It now only lists counts you could field. The stored
preference is untouched, so it comes back if the missing players do; only the
displayed value is clamped, since assigning a select a value it doesn't have
blanks it and reads back as 0.

## v0.21 — playing surface

A **Surface** setting in the roster panel: *Indoor — clay*, *Grass — green* or
*Beach — sand*. Appearance only — no rule, formation or court dimension changes
with it. Beach *doubles* remains unbuilt and out of scope for the reasons in
*Still does NOT do*; this is paint.

### It belongs to the lineup, not to the app

`surface` sits on each VolleyGram beside `system` and `roster`, not at the top
level beside `showLabels`. The rule that decides it is the one v0.6 set: a
display preference is global, a fact about a team is per-lineup. Where you play
is the second kind. Keep an indoor lineup and a grass lineup and each remembers
its own court instead of being repainted every time you switch.

Two things fall out of that. It rides in share links with no extra code, since
the payload is the lineup object. And when grass quads eventually lands, the
per-lineup `discipline` field it needs can *drive* this field rather than
migrating it out of the top level.

Changing it deliberately does **not** go through `changeLineup()`, which wipes
every dragged position. That's correct when who-stands-where changes and wrong
for a repaint — nobody moves, so the whiteboard survives.

### Why this green

`#2f5e2c`, at hue 116. Grassier greens were tried and rejected on clearance:

| Court | Hue | Nearest role | Gap | vs court lines |
|-------|-----|--------------|-----|----------------|
| `#c87a45` clay | 24° | Setter gold | **17°** | 3.01:1 |
| `#567d3a` | 95° | Libero green | **11°** | 4.34:1 |
| `#4a7c3f` | 109° | Libero green | 25° | 4.49:1 |
| `#2f5e2c` | 116° | Libero green | 32° | 6.91:1 |

The libero's `#7aad30` is the constraint — the same collision the `.role-NONE`
comment already worried about ("anything oranger runs into the court
underneath"), just rotated round the wheel. The chosen green also holds the
white boundary and attack lines far better than clay does.

Worth recording, since it's the opposite of what you'd assume: **clay is the
tighter pair.** At 17° from the setter's gold it's the closest role-to-court
match that ships. Grass is the better-separated surface, not a compromise.

### Beach is dark on purpose

`#665132` — noticeably darker than sand actually is, and the reason is that
**sand is gold.** Every sandy hue lands at 35–44°, and the setter's gold is 41°.
There is no shade of sand that clears the hue rule, so hue can't do the
separating here and lightness has to.

A real pale sand was tried first and dropped on the numbers:

| Role on `#d9c08a` pale sand | Contrast |
|------|----------|
| Setter | 1.32:1 |
| Libero | 1.51:1 |
| Outside | 1.61:1 |
| Opposite | 1.60:1 |
| No role | 1.68:1 |
| Middle | 1.85:1 |

It isn't the setter that washes out, it's **all six** — because v0.8 committed
the whole palette to bright fills with near-black text, which assumes a court
darker than the players. Pale sand also holds the white court lines at 1.61:1,
against the 3:1 floor. Dark boundary lines, as a real beach court has, would
have rescued the lines and done nothing for the players. Light sand isn't a
matter of taste; it's incompatible with the palette.

At `#665132` the gold clears the court at 3.22:1 and the lines at 6.84:1.

### The court was never tested

`contrast.js` checked roles against their text and against each other, and never
against the thing they stand on. One court colour made that invisible; a second
would have shipped unverified while the suite said ALL PASS — precisely the
drift the quads note below predicted.

It now pulls every court out of `style.css` and checks each role against each
surface. A role has to clear the court **either way**:

- **Hue**, by 15° — lower than the 25° between two roles, because a role sits
  *on* a court rather than beside it and every circle carries a dark border. It
  isn't zero, and clay at 17° from the gold is the reason it isn't 25.
- **Contrast**, by 3:1 — WCAG's non-text figure.

Two routes rather than one because the constraint that makes hue decisive
between roles doesn't apply to the court. Every role fill is held to a 5.4–7.6:1
band against the same text, so the roles all sit at a similar lightness and hue
is genuinely all they have to separate them. A court is under no such
constraint, so it can separate by being darker instead — which is the only thing
that makes beach possible.

Courts are also held to 3:1 against the white lines. Clay passes at 3.01:1,
close enough to the edge to be worth knowing.

**What this wouldn't catch.** Because the routes are OR'd, a court could be
low-contrast against every role and still pass on hue alone — five of the six
roles passed that way on the rejected pale sand, at ratios between 1.5:1 and
1.9:1. That's deliberate rather than an oversight: contrast ratio measures
lightness and says nothing about chromatic difference, and a teal circle 131°
away on a pale court really is legible. Pale sand was still rejected, but by the
line check and the setter, not by the other five.

`migration.js` checks the cross-file link the other way: every key in `SURFACES`
needs a rule in `style.css` to paint it, or picking it from the dropdown
silently does nothing.

### Exports needed no work

`drawRotation()` already read the court fill with
`getComputedStyle(court).backgroundColor`, so PNGs follow the surface for free.
This is the one place the v0.8 duplication warning doesn't bite — the colour was
never hard-coded into the canvas path, only the geometry was.

`surface` was added without a storage version bump, same as `roleOverrides` and
`checkOverlap`: an optional field with a default is not a new shape. An
unrecognised value becomes indoor rather than leaving the court unpainted.

## v0.22 — the scoreboard

A full-screen scoreboard: two named teams in red and blue, two big numbers, a
game number, and a match record of who won each game. Reached from the panel row
beside Quiz Mode.

### It does not touch the rotation, and that was a decision

The first build of this wired the score into the diagram. Winning a rally the
other team served is a side-out, and a side-out is *why* you rotate — so the
score could advance the rotation automatically, and the scoreboard would have
been the input the rotation model never had. It worked. Every case in the table
below was tested and passing.

| Rally | Rotation, under the removed design |
|-------|-----------------------------------|
| You win your own serve | unchanged |
| You lose your serve | unchanged |
| You win their serve | **advances** |
| They win your serve | unchanged |

It came out anyway, and this is the record of why — the gap v0.13 left when redo
was dropped without one.

It made two features depend on each other for no gain you could feel courtside.
It required a `serving` flag the app had never had (v0.19 notes explicitly that
the app doesn't model which team is serving). It required knowing who served
first in each game, which nothing on the court tells you once play is under way.
And getting that single bit wrong silently corrupted every rotation after it —
a failure with no symptom until the diagram quietly disagreed with the court.

**A scorekeeper you have to set up correctly before it can be trusted is not a
safeguard. It is a second thing to get wrong.** Rotation stays on the buttons,
where it cannot drift. Scorekeeping is a safeguard and an extra, not a driver.

What that removed: `serving` entirely, the per-team Serving/Serve badges, the
side-out rule, and the rotation line the scoreboard used to show. What it left
is smaller and independent — the rally trail no longer records a rotation to
restore, so undo is just a score again.

`test/migration.js` §43 asserts that scoring moves neither the rotation nor the
whiteboard's undo stack, and that `serving` is absent from the match. That is
the guard against the link creeping back in.

### The match record

Ending a game asks who won, and that answer is kept: `games` is a list of
`{ home, away, winner }`, and the header carries a games-won tally. It's the
thing you actually want at the end of a night and the thing nobody remembers by
game four.

A game with no points scored offers no winner — only "next game, no result" —
so a 0–0 game can't enter the record. On load, the stored game number is raised
to at least `games.length + 1`, because a match that has played three games is
on game four whatever the number claims.

### Two undo stacks, deliberately

The scoreboard keeps its own trail, one entry per point, rather than pushing to
the app's 40-step history. Sharing one stack would be wrong in both directions:
tapping points would bury the drag you wanted back, and undoing a drag would
rewind the score. They are different kinds of "back". Courtside the mis-tap is
not the rare case, it is the normal one.

The trail caps at 120, which holds a long set whole; the game record caps at 50.

### Storage

`match` is top level, beside `showLabels` — **not** on a lineup. A score is
something happening right now, not a fact about a team. That placement is also
what keeps it out of share links, which encode a lineup: a link is a diagram you
send someone, and it would be strange for it to arrive 14–11.

It does persist, because a phone will background the tab mid-set and a
scoreboard that forgets isn't one. Added with no version bump, same as
`roleOverrides`, `checkOverlap` and `surface`. Names are capped at 20 characters
— an essay is unreadable from across a gym, which is the point of the screen.

### Red and blue

| Side | Colour | Numerals | Page behind |
|------|--------|----------|-------------|
| Home | `#b8323f` | 5.35:1 | 3.02:1 |
| Away | `#2e66c2` | 5.02:1 | 3.21:1 |

The whole half of the screen carries the colour, because which half is which has
to be readable from further away than any word on this screen.

Three things are being held at once. Both carry white numerals. Both stand clear
of the page behind them at 3:1 — the filled panel is its own edge, and no border
is drawn around it. And they are within 6% of each other in **lightness**, so
neither team's half looks brighter, and so more important, than the other's;
all 137° of the separation is hue.

The blue started at `#2a5fb8`, which looked right and sat at 2.90:1 against the
page — just under the figure the courts are held to. Lightening it was cheaper
than arguing with the threshold.

Both are kept away from `#ff9f9f`, which is what an overlap violation and a
danger button look like in this app. A team is not an error.

`contrast.js` checks this palette too, on the same principle as the courts: a
second palette that ships unverified is the drift these suites exist to stop. It
asks the questions this screen actually raises — numerals, page, hue separation,
and an evenness check that fails if one team is much lighter than the other.

### Sized off vmin, not the phone

This is the one screen in the app that isn't phone-first. It's meant to be
propped on a bench and read from the far side of a court, so every size is a
`clamp()` on **vmin** — the short edge, which is what actually limits how big a
digit can be — rather than the viewport width. That's what makes it grow on an
iPad and work with a phone lying sideways.

The score uses `tabular-nums` so the number stops jittering as it climbs, and
the tap target is the entire half of the screen, because courtside you are not
aiming. `touch-action: manipulation` stops iOS reading a fast second tap as a
zoom instead of a second point. `:active` darkens rather than lightens, since
the fills already carry white text.

`.scoreboard[hidden]` needs its own `display: none`, for exactly the reason the
roster panel did: an author `display: flex` beats the browser's built-in rule
for `hidden`.

### Screen wake lock

A scoreboard whose screen sleeps mid-set is worse than no scoreboard, so opening
it requests a wake lock and closing it releases one. Every part is optional —
unsupported, denied, and a backgrounded tab all land in the same `catch`, and
the scoreboard behaves identically without it.

### What it deliberately does not know

How many points win a set, win-by-two, a shorter fifth, when to switch ends, or
how many substitutions are left. Leagues disagree on all of it. Same position
v0.20 took on the missing server: state the fact, stop before the consequence.

## v0.23 — the roster is the serving order again

### The bug

A seven-player lineup rotated in the wrong order. Roster row 7 served **second**.

```
roster  : Jen → Matt → Taylor → Evi → Cammi → Alec → Ashley
serving : Jen → Ashley → Matt → Taylor → Evi → Cammi → Alec
```

Reported as "reordering the roster doesn't follow on the court", which is
exactly how it presents: two players adjacent in the roster are drawn nowhere
near each other, and dragging rows around never fixes it.

### The cause, in v0.4

Bench slots sat at the **end** of the ring. `courtPath()` returned the six zones
in travel order and anything past index 5 was bench, so the cycle ran:

```
z1 → z6 → z5 → z4 → z3 → z2 → bench → z1
```

The player in zone 2 dropped to the bench and the bench player walked straight
into zone 1. That is what "subs enter at Zone 1" meant, and entering at zone 1
*is* entering at the front of the serving queue — so a substitute jumped six
places ahead of where the roster put them.

With exactly six players there is no bench, the ring is just the six zones, and
the order is correct. That is why this survived from v0.4 to v0.22: every test
that checked rotation order used a six-player roster.

### The fix

The bench moves to directly **after** zone 1:

```
z1 → bench… → z6 → z5 → z4 → z3 → z2 → z1
```

The server rotates off, the bench queue shuffles along, and whoever reaches the
end of it walks back on at middle back. This is v0.3's original model —
"the server rotates off, the next player returns at middle back" — which v0.4
replaced without noticing what it cost.

`cycleIndex()` collapses to one line as a result:

```js
mod(rotation - 1 - rosterIndex, cycleLength())
```

Roster row N starts N places back from the front of the ring, so it reaches
zone 1 N rotations later. That subtraction *is* the serving order.

### Why the bench has to sit there

Not a preference. Two things have to hold at once:

1. The roster list is the serving order — that's what a lineup is.
2. Rotation 1 puts roster row N in zone N.

Take (1): row *i* must serve *i*-th, so it must sit at ring position
`mod(-i, N)`. Take (2): row 0 is in zone 1, row 1 in zone 2, and so on. Put them
together and the zones are pinned to positions `0, N-1, N-2, N-3, N-4, N-5` —
which leaves positions `1 … N-6` for the bench, immediately after zone 1. There
is no freedom left. Any other bench placement breaks one of the two.

### So "Subs enter at" is gone

It has no meaning left. The setting chose where the bench block sat, and the
bench block now has exactly one legal position. Keeping the control would mean
offering five choices that quietly corrupt the rotation and one that doesn't.

`entrySlot` is read out of old saves and discarded, so nothing needs migrating
and no version bump is needed. Subs always enter at zone 6 now, which is where
they entered before v0.4.

Bench seating is unchanged to look at: players still rotate off into the
leftmost seat and advance rightward, walking on from the right end. The ring
now reaches the bench from the other side, but the seats read the same.

### The test that should have existed

The suite had 487 checks and none of them asked whether the roster order was
the serving order. Section 46 asks it directly, for 6, 7, 8 and 12 players:

- everyone serves exactly once per cycle, in roster order
- rotation 1 puts row N in zone N
- roster neighbours stay neighbours around the ring
- with seven players everyone sits exactly once per cycle
- short-handed, nobody is benched at all

Plus the reported roster by name, asserting Ashley serves seventh. Run against
the v0.4 algorithm, eight of these fail and the six-player cases pass — which
is the shape of the blind spot that let this through.

## v0.24 — the entry zone comes back, and a bigger score

### "Subs enter at" is restored

v0.23 removed it, reasoning that the bench block had exactly one legal position.
That was true only because v0.23 also insisted rotation 1 put roster row N in
zone N. Drop *that* and the setting works fine, with the serving order intact:

```
entry z6  ring [1, B, 6, 5, 4, 3, 2]   rot 1: rows 1-6 on court, row 7 sits
entry z1  ring [1, 6, 5, 4, 3, 2, B]   rot 1: row 2 sits, rows 3-7 fill z2-z6
entry z3  ring [1, 6, 5, 4, B, 3, 2]   rot 1: row 4 sits
```

All six choices keep the roster as the serving order, which was the actual v0.23
fix and is the part that must not regress.

The cost is smaller than the one v0.23 paid: with any entry zone other than
middle back, the player sitting out at rotation 1 is somewhere in the middle of
the lineup rather than last. That is the honest reading rather than a defect —
**if substitutes walk on at zone 1, whoever serves next has to be off court
right now, waiting to do it.**

v0.4 made the opposite trade: it kept rows 1–6 on court by construction and let
the bench land where it may, which shoved substitutes up the serving queue. This
keeps the queue and lets the bench land where it may.

`DEFAULT_ENTRY` is zone 6, so a v0.23 save is unchanged. A save from v0.4–v0.22
still carries the zone chosen back then and now gets what it asked for. `§46`
checks the serving order across all six entry zones, and asserts that middle
back is the only one keeping rows 1–6 together at rotation 1.

A note appears in the roster panel when the choice is anything but middle back,
saying rows 1–6 won't all be on court and the serving order still follows the
roster. v0.23 got reported as a bug precisely because that consequence was
invisible; a control with a surprising effect should say so next to itself.

### Reverting drag-to-reorder would not have helped

Offered as a possible price for getting the setting back. It isn't one — arrows
versus dragging is how you *edit* the roster, and the v0.4 bug was in how the
roster maps onto the ring. Dragging stays.

### The score was sized off the wrong thing

`clamp(3rem, 30vmin, 20rem)`. vmin is the *viewport's* short edge, so:

| Device | vmin measures | Score | Verdict |
|--------|---------------|-------|---------|
| Phone, portrait | width, ~390 | ~117pt | right |
| iPad, landscape | height, ~820 | ~250pt | far too small |

One rule answering two different questions. On a phone held upright the width
really is what limits a two-digit score, so vmin happened to be correct. On an
iPad it measured the height of a panel that had room for much more.

Fixed with container query units: `.sb-point` becomes a size container and the
score is `min(70cqh, 65cqw)` — the width and height of *the panel it sits in*
rather than of the screen. Width is the binding constraint for two digits, so
`65cqw` does the work and `70cqh` only intervenes on a panel wider than it is
tall.

Portrait phone lands within a few percent of where it was, which was already
right. An iPad gains about half again. The old `vmin` rule stays as the fallback
under `@supports (container-type: size)` rather than being replaced.

Portrait stays a supported orientation — the two halves are a 1fr 1fr grid at
any aspect, and nothing forces landscape.

### Smaller things

- **Show roster / Hide roster reads as pressed** when open, using the same white
  fill the formation tabs and rotation numbers already use for "this is the one
  you're on". One visual language for selected, rather than two.
- **"Share" became "Share team."** Same length as "Save image" beside it, so the
  three-across row that v0.17 shortened it for still fits at 320px.

## v0.25 — zone 1 is the default again

`DEFAULT_ENTRY` is 1. That was the default from v0.4 to v0.22, it's what most
people picture by "where subs come on", and v0.24's choice of middle back was
made for a reason that turns out to be the tail wagging the dog.

The roster-panel note now keys off a separate constant, `ROSTER_ALIGNED_ENTRY`
(zone 6), rather than off the default. It describes a fact about zone 6, not a
fact about what happens to be usual — tying it to the default meant changing
the default silently inverted what it said. It also stays hidden below seven
players, where there is no bench to warn about.

### Added players do not start off court, and can't

Asked for directly, and it is not available with zone 1 entry. Not an
implementation gap — the two requests are the same request pointing opposite
ways.

Entering at zone 1 means the bench feeds straight into the serve. So whoever is
off court is, by definition, **the next server**. With roster row 1 serving at
rotation 1, the player sitting is row 2. A newly added player is appended to the
roster and serves last, so at rotation 1 they are on court and an existing
player is sitting.

| Entry zone | Off court at rotation 1 | Added players start |
|------------|-------------------------|---------------------|
| Zone 6 (middle back) | last roster row | **off court** |
| Zone 1 (serve) | row 2, the next server | on court |
| Zones 2–5 | somewhere mid-lineup | on court |

Only zone 6 gives it, because only zone 6 puts the bench at the end of the
serving queue rather than in the middle of it.

Renumbering the rotations so the extras are benched at "rotation 1" was
considered and rejected: with zone 1 entry the offset that benches row 7 is the
one where **row 6 serves first**, so the fix would trade a confusing bench for a
confusing server. Worse, and harder to explain.

So this is a genuine either/or, recorded rather than papered over:

- **Added players start off court** → subs enter at zone 6.
- **Subs walk on to serve** → the player resting at rotation 1 is the next
  server, not the newest name on the list.

## v0.26 — touch

Two phone bugs, one property.

### Double-tap zoomed and panned off somewhere

Tapping empty space twice triggered iOS's double-tap-to-zoom, which zooms *and*
pans toward the tap. On a page that is mostly large buttons this fires by
accident constantly.

`body { touch-action: manipulation }`. That drops the double-tap gesture and
keeps scrolling and pinch-zoom, so nothing about reading the page gets harder.
Deliberately not `user-scalable=no` in the viewport meta, which would have
worked by taking zoom away from people who need it.

### The court ate every vertical scroll

`.court { touch-action: none }` was there so a drag wouldn't scroll the page
mid-drag. It also meant a touch starting anywhere on the court — most of the
screen — could not scroll the page at all. You had to find a margin to get
past it.

Now `pan-y`. The browser gets vertical scrolling back, horizontal movement
still reaches the swipe handler that changes rotation.

Players keep `touch-action: none` of their own and are unaffected, because a
descendant's touch-action **intersects** with its ancestors' rather than being
overruled by them: `none` inside `pan-y` is still `none`. So dragging a player
works in every direction, while empty court scrolls.

The swipe handler needed no change. A vertical drag the browser claims fires
`pointercancel`, which it already listened for — added in v0.9 for a different
reason and correct for this one.

### The guard

`§47` reads the three values out of `style.css`, the same way `contrast.js`
reads the palette. They are exactly the kind of value that gets tidied back:
`none` on the court looks more careful than `pan-y` unless you know why.

Two bugs in the check itself, worth recording because both fail *open* — they
match nothing and report nothing wrong:

- `body` in a regex begins with `\b`, a word boundary. It never matched.
- Unanchored `.player` matched `body.quiz-hide-players .player` first, a rule
  with no `touch-action` in it at all.

Selectors are now escaped and anchored to the start of a line. The check was
confirmed to fail by putting `none` back on the court.

## v0.27 — bench seats were drawn off the edge

### The bug

With seven or more players, whoever was off court was drawn about three court
widths to the right of the diagram. Reported as "newly added players after 6 are
placed way outside of bounds", which is how it looks: a bench appears the moment
you add a seventh, and its occupant is nowhere on screen.

`benchPosition()` did this:

```js
const benchIndex = cycleIndex(rosterIndex, rotation) - 1;
```

The `- 1` assumed the bench block starts at ring position 1. That was true in
v0.23, where the bench always sat directly after zone 1 and there was nothing to
configure. **v0.24 made that one case of six and this line was not updated.**

| Entry zone | Ring | Bench x |
|------------|------|---------|
| Zone 1 | `[1,6,5,4,3,2,B]` | 300% |
| Zone 3 | `[1,6,5,4,B,3,2]` | 200% |
| Zone 6 | `[1,B,6,5,4,3,2]` | 50% |

Only middle back was correct, because it is the one ring where the bench happens
to start at index 1. v0.24 shipped with it as the default, so the bug was
invisible; v0.25 changed the default to zone 1 and exposed it in every new
lineup.

### The fix

Read where the bench starts rather than assuming it:

```js
const benchStart = courtRing().indexOf(null);
const benchIndex = cycleIndex(rosterIndex, rotation) - benchStart;
```

Same shape as `slotFor()`, which already asks the ring instead of carrying its
own idea of the layout. Anything that needs to know where the bench is should go
through `courtRing()`; that is the only place the answer exists.

### What the tests were not asking

`§46` was written for the v0.23 rotation bug and checks, thoroughly, **who** is
benched in every rotation at every entry zone. It never checks **where** anyone
is drawn. A player at x = 300% is benched perfectly correctly.

`§47` now walks every entry zone against 7, 8 and 12 players and asserts each
bench seat lands inside the strip and that seats are distinct. Put the `- 1`
back and 15 checks fail.

The general shape is worth keeping in mind: this suite is strong on *state* and
blind to *geometry*, because the DOM is stubbed and nothing measures a pixel.
Coordinates are the one thing it can still assert about drawing, since they are
computed rather than rendered — so where a coordinate is computed, it should be
checked.

## v0.28 — the occasional controls fold away

Four rows of buttons had accumulated under the rotation numbers again, which is
the same drift v0.17 last cleaned up. Now:

| Row | Buttons |
|-----|---------|
| 1 | Labels · **More** · Scoreboard |
| 2 | *(More, opened)* Save image · Share team · Quiz Mode |
| 3 | Show roster |
| 4 | Hold to reset all |

**More** holds the three controls you don't reach for every time you open the
app. Save image and Share team hand the diagram to something else; Quiz Mode
takes over the screen. None of them is part of looking something up courtside,
which is what row 1 is for.

The submenu is boxed rather than flush, so it reads as belonging to the button
above it rather than as another peer row, and it closes whenever one of its
three fires — two hand you off elsewhere and the third takes the screen, so
leaving it open would only be something to tidy up later.

**Show roster** gets its own row. It opens the longest panel in the app and it
is the one you leave open while editing a lineup, so it is the odd one out among
controls you tap and forget.

`More` takes the same white pressed styling as `Show roster`, added in v0.24 —
one visual language for "this panel is open".

### `.actions[hidden]`

Third time: `.actions` sets `display: grid`, and an author rule beats the
browser's built-in `display: none` for `hidden`. The roster panel hit it in
v0.6 and the scoreboard in v0.22. Anything in this stylesheet that sets a
`display` and can also be hidden needs the matching `[hidden]` rule, and the
suite now checks this one.

### The layout is asserted

`§49` parses `index.html` and checks which buttons sit in which row, that the
submenu starts closed, that Show roster is alone, and that Hold to reset all is
still last. Same principle as `contrast.js` reading `style.css`: the arrangement
is a decision, and the next button added should have to notice it.

## v0.29 — a long press is not a text selection

Holding **Hold to reset all** started an iOS text selection partway through and
raised the callout bar over the button being held. The press lasts 1.5 seconds
by design, so it hit the selection delay every single time.

`user-select: none`, `-webkit-user-select: none` and `-webkit-touch-callout:
none`, on `button` rather than on the one control. Every button in this app is
something you press; no label in it is worth selecting, and any of them can be
held by accident.

Not applied more widely than that. Player names in the roster are inputs and
have to stay selectable.

## v0.30 — the status line stops shoving the controls

Under the court, the status line runs to one line or two depending on what it
has to say: a 5-1 naming two setters, or an overlap count appearing, tips it
over. It reserved `1.2em`, so every one of those flips pushed the formation tabs
and everything below them down a line — while changing rotation, which is the
thing you do most.

It now reserves two lines: `--status-lines: 2` with
`min-height: calc(var(--status-lines) * 1.35em)`, and an explicit `line-height`
so the arithmetic is exact rather than inherited.

A `min-height` rather than a fixed height. Two lines covers the wording the app
generates, but names are up to 14 characters each and a long enough pair can
still reach three — and clipping the status would be worse than moving the
buttons. So the common case is stable and the rare one still grows.

The reserve is a custom property so it is one number to change, and so the test
suite can read it: `§49` asserts it is at least two and that the `min-height` is
actually built from it.

## v0.31 — reordering the roster did not stick

### The bug

Drag two roster rows past each other and they swap on screen. Press `<` or `>`
and they swap back.

Reported with screenshots, which is what made it solvable: rotation 2 showed
**Matt** off court. Rotation 2 benches roster row 3, and Matt is row 3 only in
the *unswapped* array. So the reorder had never reached `saved.roster` at all —
the panel was showing a DOM that no longer matched the data behind it, and
changing rotation calls `buildRosterRows()`, which rebuilds the list from the
array and threw the display away.

### The cause

`onRowDragMove()` reorders by moving the row through the DOM. The drag handle
lives *inside* that row. Moving a node takes it out of the document for an
instant, and that releases the pointer capture the handle was holding — after
which events retarget to whatever is under the finger, the handle never sees
`pointerup`, and `endRowDrag()` never runs.

One adjacent swap is exactly one `insertBefore`, so even the simplest reorder
failed. v0.10's note that "the dragged row's DOM node is moved directly rather
than rebuilding the list" was about not destroying the node; it did not follow
that moving the node has the same effect on capture.

### The fix

Move and release now listen on the **document**, bound once, guarded on
`rowDrag`. The handle keeps only `pointerdown` and its arrow keys. Pointer
capture is still requested — it keeps a mouse drag glued to the handle — but
nothing depends on it surviving any more.

### A silent failure made it harder to see

`applyRosterOrder()` has a guard that keeps any player the incoming order left
out, so a bad order can never delete anyone. Good safety net, terrible error
message: an order of ids the lineup does not recognise resolves to nothing,
*every* player counts as missing, and the roster comes back in its original
order with no sign anything went wrong — indistinguishable from the reorder
silently failing.

It now refuses an order that names no known player, returns false, and warns.
A partially-unknown order still applies, and still warns.

### The stub learned to listen

`stubElement()` and the fake `document` discarded every `addEventListener` call.
That is why a suite with 576 checks could not see a bug in which the wrong
element was listening: **there was nothing anywhere that knew what was bound to
what.**

Both now record handlers and expose `dispatch()`. `§50` drives the real sequence
through them — pointerdown on the handle, the DOM swap, then a `pointerup` that
arrives at the **document rather than the handle**, which is the failure being
reproduced — and asserts the swap reaches the array, survives a rotation change,
and moves who ends up on the bench.

Run against the old wiring it fails 7 checks, including `and the bench follows
the new order — Matt`, which is the screenshot.

The general lesson matches v0.27's. That one noted the suite was strong on state
and blind to geometry. This one adds: it was blind to *wiring* — which handler
is attached to which element — for the same reason, that the stub only faked
what someone had thought to fake.

## v0.32 — two levels behind More

v0.28 folded three controls behind **More**. This moves two more in and gives
the pair of exports a level of their own.

| Row | Buttons |
|-----|---------|
| 1 | **More** · Scoreboard |
| 2 | *(More)* Labels · Quiz Mode · Share team |
| 3 | *(More)* **Save…** |
| 4 | *(Save…)* Save image · Save all rotations |
| 5 | Show roster |
| 6 | Hold to reset all |

Labels leaves the top row, which now holds only the two screens that take over
the app. The two exports differ solely in **how much** they draw, so they sit
behind one word rather than each taking a column and being told apart by
reading.

**Save all rotations as one image** came out of the roster panel, where it had
been the only export and the only thing in there that wasn't a lineup setting.
Its name lost "as one image", which the second level now implies.

Nesting a menu is worth being wary of, and two things keep it honest: the court
stays visible above the open menu, so nothing here is modal; and closing More
closes Save with it, or Save would be found already open the next time More was
pressed.

Labels is deliberately **not** on the close-on-use list. Save, Share and Quiz
all hand you off somewhere else; Labels is a toggle you might flip twice while
watching the court change behind the menu.

### `.submenu` is a box, not a row

It used to be an `.actions` row that happened to be boxed. It holds rows now, so
the box and the grid are separate: `.submenu` is the border and padding,
`.actions` inside it are the rows, and `.submenu .actions:last-child` drops the
trailing margin the border would otherwise have to hold open.

Which means `.submenu[hidden]` needs its own `display: none` as well as
`.actions[hidden]` — the fourth time this stylesheet has hit that, after the
roster panel, the scoreboard and the actions rows. Both are asserted.

### The setting moved with the buttons it governs

`Transparent background in exports` was in the roster panel and would have ended
up governing two buttons two levels deep in a different part of the screen. It
now sits inside `Save…` with them, and its label drops "in exports" — the menu
it lives in already says that.

This breaks the rule that preferences live in the roster panel, and it should:
that panel is for facts about a *lineup*, and this is a fact about a **file you
are about to produce**. Being next to the two buttons that produce it beats
being filed with the roster.

`.save-menu` deliberately sets no `display`, so the browser's own rule for
`hidden` still applies and it cannot become the fifth thing in this stylesheet
to ignore the attribute.

`Flag overlap violations` stays in the roster panel. It is about the diagram
rather than an export, and it belongs with the lineup it flags.
## v0.33 — the overlap flag moves onto the players

### Scoreboard first

The top row is **Scoreboard · More Options**. Scoreboard is a destination; More
Options is a drawer. The destination goes first, and "More" on its own was thin
for a button that now hides five controls and a setting.

### The status line stops reporting overlap

v0.19 put the overlap result in the line under the court, including
`overlap legal` on a clean court — the reasoning being that without it, a legal
court is indistinguishable from the check being switched off.

That reasoning was sound and the cost was too high. The note appears and
disappears as you step through rotations, which is exactly the length change
v0.30 reserved a second line for. Reserving two lines for a sentence that is
usually one is its own kind of drift, and the controls under it still shifted
whenever a long rotation description wrapped.

So the flag now lives entirely **on the players**: an `Overlap` badge above the
circle, beside the dashed red outline v0.19 already drew. A breach is marked
where the breach is, rather than counted somewhere else.

`--status-lines` goes back to **1**. The reserve stays, so an empty status can't
collapse the layout, but there is no longer a two-line case to hold room for.

**What this gives up**, recorded because v0.19 was right to raise it: a clean
court and a switched-off check now look identical on the diagram. The answer is
that the checkbox you turned it on with is still sitting in the roster panel,
which is a better place to answer "is this on?" than a sentence that had to
re-earn its space every rotation.

The badge sits **above** the circle, opposite the Server pill below it, so a
player who is both serving and overlapping doesn't stack two labels in one
place. It is `#ff9f9f` — the same red as the dashed outline it accompanies and
as `button.danger`.

Exports are unchanged: they have never drawn the overlap marks, and this does
not start. A shared image is a diagram of positions, not a rules verdict.

### The v0.19 redraw guard moved with it

`endDrag()` has to call `render()`, because the overlap marks are worked out
there and a breach you just dragged into stays invisible otherwise. That
invariant was guarded by asserting the *status line* updated after a drag with
no manual redraw — and the status line no longer says anything about overlap.

The guard now reads the `illegal` class off the player element instead. Comment
out `if (moved) render();` and it still fails, which is the whole point of it.

### The stub was letting classes go stale

`className` and `classList` were separate fields on the fake element, so
assigning `el.className = 'player role-S'` did not clear a class an earlier
render had added. Every class-based assertion could have passed for the wrong
reason.

They are one thing now, via a defined property — writing `className` rebuilds
the set, reading it joins it. Third stub gap in three versions, after event
listeners in v0.31 and `setAttribute` in v0.32, and the same root cause each
time: it only faked what someone had thought to fake.

## v0.34 — the occasional controls get a drawer

The main column is now: rotation numbers, **More Options**, **Show roster**,
**Hold to reset all**. Inside More Options:

| Row | Buttons |
|-----|---------|
| 1 | Labels · Scoreboard · Quiz Mode |
| 2 | **Share** |
| 3 | *(Share)* Share team |
| 4 | *(Share)* Save image · Save all rotations · Transparent background |

The scoreboard moves off the main column and into the drawer. It was briefly
renamed *Mobile Scoreboard* and is plain **Scoreboard** again: the extra word
described the device rather than the thing, and at seventeen characters it
wrapped in a three-across row on a narrow phone.

`Save…` becomes **Share** and takes `Share team` in with it. Three ways of
handing the diagram to someone else, behind one word: a link, one rotation as an
image, all of them as an image. The link sits on its own row above the two
exports, being a link rather than a file.

The ids followed the label — `saveMenu` and `toggleSave` are `shareMenu` and
`toggleShare`, and `.save-menu` is `.share-menu`. An id called `saveMenu`
holding a share link is the kind of small lie that costs an hour later.

Opening the scoreboard now closes the drawer behind it, like the other four.
Labels still does not, for the reason v0.32 gives: it is a toggle you might flip
twice while watching the court.

### v0.17's rule survived a challenge

The drawer was first placed **below** Hold to reset all, which broke the rule
v0.17 set: *"it's the control you least want a thumb to find on the way past, so
nothing sits beside it and nothing follows it."*

It was moved back above. The rule is worth more than the arrangement that
briefly displaced it — a terminal destructive control with nothing after it is a
property you can rely on without looking, and "it's only a shut drawer" is
exactly the kind of reasoning that erodes one.

So the order is drawer, roster, reset. Everything occasional is folded away
before you reach either of the two controls that open a panel, and the
destructive one is still last.

`§49` asserts all of it: reset is alone on its row **and** the last row of all,
and the three rows run in that order. The last-row check is the one that would
have caught the arrangement this version tried first.

## v0.35 — Scoreboard back on the column, share on one row

### Scoreboard leaves the drawer

`Scoreboard · Show options` share the top row of the group. The scoreboard is a
destination rather than an occasional setting, and a destination should not be
two taps deep. v0.34 put it in the drawer; this takes it back out.

The drawer toggle is **Show options**, matching `Show roster` below it in both
wording and case, and it flips to **Hide options** when open — the same
Show/Hide pair the roster button has used since v0.8. Naming the drawer without
saying which way it is about to go was the part that read wrong once it stopped
being called "More".

Opening the scoreboard no longer closes the drawer. The rule is that things
*inside* the drawer close it on their way out, and the scoreboard is not inside
it any more.

### All three share options on one row

Asked as a question — whether it fits, or takes too much space. It fits, but
only just, and only after shortening a label:

```
320px viewport
  288  main            (body padding 1rem each side)
  273  .submenu        (border 1px + padding 0.4rem)
  254  .nested         (margin 0.6rem each side)
   80  per column      (three columns, two 0.4rem gaps)
```

At `.actions.compact`'s 0.8rem, `Share team` and `Save image` need about 72px
each and fit. **`Save all rotations` needs about 123px** and would have wrapped
to two lines, taking the other two with it — grid items stretch to a common
height.

So it became **Save all**. Next to `Save image`, inside a menu called Share,
"all" has only one thing it can mean. The alternative was keeping the full name
and a two-line row, which costs more vertical space than the row it was meant to
save.

Nothing else could give: `.nested`'s margins are worth 19px and the shortfall
was 43px, and dropping below 0.8rem is the thing v0.17 introduced that size to
avoid.

Labels and Quiz Mode take a two-across row now that the scoreboard has left,
rather than sitting in a three-column grid with an empty third.

## v0.36 — sand becomes an off-white, and the court grows ink

Beach is `#e8e5df`. v0.21 tried a pale sand and rejected it; this is that
decision revisited, and it needed two things that did not exist then.

### Why pale sand failed before

Two separate failures, both real:

| | Pale sand, v0.21 |
|---|---|
| White court lines | 1.6:1 — invisible |
| Setter's gold on it | 1.3:1, and 0° of hue away |

The second is not a quirk of one shade. **Every sandy hue is the setter's hue** —
off-whites land at 38–41°, gold is 41° — so no sand clears the palette on hue,
and none is dark enough to clear it on contrast. v0.21 concluded light sand was
incompatible with the palette. On the rules as they stood, it was.

### What changed

**The court has ink now.** `--line`, `--line-soft`, `--line-faint`,
`--line-bench`, `--ring`, `--pill-bg` and `--pill-fg` are custom properties on
`.court`, used by the border, net, attack line, zone numbers, bench box, player
outline and Server pill. Beach overrides all seven to dark. Its lines run at
**8.4:1** — better than clay manages with white at 3.0:1.

That also fixes an existing hazard rather than adding one. `drawRotation()` had
**seven hard-coded white values**, so the canvas silently assumed a dark court
and would have drawn invisible lines on a light one. It reads the properties
through `courtInk()` instead: one definition per colour, two renderers. Same
principle that already applied to the role fills, extended to everything else
drawn on the court. `§42` asserts the export hard-codes no line colour of its
own, and that any surface flipping the ink defines the whole set.

**The player ring is per-surface.** `rgba(0,0,0,0.3)` on dark courts as before,
`0.55` on beach — a bright fill on a pale ground needs a firmer edge to read as
a disc.

### A third route through the colour check

The setter still clears beach on neither hue (1°) nor contrast (1.86:1), and it
should not have to. Both of those measure the wrong thing here: a **saturated
disc on a near-neutral ground** is not a collision, whatever the ratio says.

So `contrast.js` gains a chroma route — the court may carry at most 0.4× the
role's saturation. Beach is 0.16 against the setter's 0.69 and passes with room;
the pale sand v0.21 rejected is 0.51 and still fails, which is the check working
rather than being loosened. Clay and grass are unaffected: they clear on hue as
they always did.

Line contrast is also now measured per surface, against **its own** `--line`
rather than against white. Testing a light court against white ink was testing a
court that does not exist.

Both new checks were confirmed to fail on purpose: a saturated pale sand fails
the chroma rule, and white ink on the light court fails the line rule.

### Left alone

The overlap badge stays `#ff9f9f` — a pink pill with near-black text reads on
off-white without help. And the roles themselves are untouched: this version
changes what they stand on, not what they are.

## v0.37 — undo stops rewinding the scoreboard

### The bug

Score a few rallies, nudge a player, press Undo: the nudge comes back — and so
does whatever the score was when you nudged. One undo of a diagram edit rewound
a live match, rally trail included.

`pushHistory()` snapshotted **the whole store**, and since v0.22 the match
lives in the store. v0.22 was careful in one direction — scoring never pushes
to the diagram's history, and §44 asserts it — but never closed the other:
history *carried* the match, so restoring a snapshot restored an old score.
Fifteen call sites push history (drags, renames, roster edits, surface
changes), and any of them followed by Undo during a game armed it.

The same mechanism silently reverted `showLabels`, `roleScope`,
`transparentExport` and `checkOverlap` — harmless by comparison, but the same
category error: the snapshot said "the whole store" where it meant "the
diagram".

### The fix

The snapshot is `{activeId, lineups}` and undo restores exactly those two
fields, mutating `store` in place rather than replacing it. Everything else in
the store — the match, the display flags — is current state, not an edit, and
undo does not touch it. The match has its own undo, on its own screen, per
rally (v0.22's two-stacks decision, which this completes).

`activeId` stays in the snapshot because undo covers creating, switching and
deleting lineups, and a restored lineup set with today's `activeId` could point
at a lineup that does not exist in it.

### §51

Drives the original repro end to end: a diagram edit, eight rallies on top,
one undo — the score and trail must survive. Also asserts display flags
survive, roster edits and lineup deletion still undo, and scoring keeps
working after an undo. Run against the whole-store snapshot it fails 4 checks.

Found in a review pass rather than courtside, which is worth noting: every
prior scoreboard bug was reported from a phone. This one required scoring and
undoing in the same session and would have been diagnosed as "the scoreboard
forgot my points", with nothing pointing at Undo.

## Tests

```
node test/migration.js    # 620 checks — storage, migration, roles, formations,
                          #   quiz, sharing, dragging, short-handed rosters,
                          #   playing surface, scoreboard, rotation order, entry zones,
                          #   touch handling, bench geometry, control layout,
                          #   roster reordering
node test/contrast.js     # colour contrast, hue separation, and every role
                          #   against every court surface
```

Both suites live in `test/`. The name is only convention — nothing requires it,
and no runner is scanning for it. Plain Node scripts with no dependencies, so
there's nothing to install and nothing to keep up to date.

### Both read the real source files

This is the rule worth keeping. Neither suite contains a copy of what it's
testing:

- `migration.js` reads `script.js` off disk and runs it, so it exercises the
  shipped code rather than a re-implementation that can quietly disagree with it.
- `contrast.js` parses the colours straight out of `style.css`, so the palette
  it checks is the palette that ships.

A test holding its own copy of the thing it tests will eventually pass while the
app is broken — the copy and the original drift, and the test goes on checking
the copy. Both of these fail instead, which is the point.

`migration.js` also asserts no source file contains a NUL byte. One slipped in
during v0.10 from a mis-written escape; it ran fine but made the file binary to
`grep`, `git diff` and editor search.

Coverage runs to every historical storage shape, round-tripping, missing
`activeId`, Simple mode, nine kinds of corrupt input, and hand-edited coordinates
arriving from a share link.

### The stubbed DOM

`script.js` expects a browser: `document`, `localStorage`, `navigator`, a court
element to draw into. Node has none of that, so `boot()` hands the script a set
of fake objects with the same shape — `getElementById` returns an object with a
`style`, a `classList`, an `appendChild`, and so on.

The app can't tell the difference, so it runs normally and the test can read its
state afterwards. Nothing is drawn and nothing is displayed, which is fine: the
questions being asked are about the *logic* — who ends up in which zone, what a
corrupt save turns into — not about pixels.

The limit is worth knowing. A stub only fakes what someone thought to fake, so
these tests can't catch anything about real layout or rendering: whether three
buttons fit across a phone, whether a colour looks right, whether a drag feels
sluggish. Those still need a real browser and a real thumb.

## Planned next

**Disciplines — grass quads (4v4).** Discussed, not committed. The idea is a
`discipline` field on each *lineup* rather than a global mode, since you might
coach indoor sixes and play grass fours yourself, and the lineup picker already
switches between them. Today's module constants — `SLOT_POSITIONS`,
`TRAVEL_ORDER`, `FRONT_ROW_SLOTS`, `OVERLAP_*`, `ZONE_REGIONS` — become a
per-discipline lookup, roughly fifty references.

Two things make it cheaper than it sounds. The court box doesn't change shape:
indoor is 18×9 and outdoor 16×8, both 2:1, so only the attack line and the slot
grid move. And because formations are generated rather than tabulated, a new
discipline needs no new receive or defense tables — the same computation runs
over four players.

Doing v0.20 first was deliberate: vacancy handling now exists, so grass quads
with three players is the same mechanism and the discipline work never has to
invent it.

A palette keyed to discipline would want `test/contrast.js` to iterate palettes
rather than find one — otherwise a second palette ships unverified while the
suite still says ALL PASS, which is exactly the drift these tests exist to stop.

**Still on the shelf as of v0.21, deliberately.** Two things happened that make
it cheaper without making it due. Short-handed rosters (v0.20) mean quads with
three players is a mechanism that already exists. And the surface setting
(v0.21) is a per-lineup field of exactly the shape `discipline` wants, plus the
green court quads would need — so when it lands, `discipline` drives `surface`
rather than a second field appearing beside it. The court-vs-role checking that
v0.21 added to `contrast.js` is the palette-iteration this paragraph asked for.

What's still untouched is the expensive part: the fifty-odd references to
`SLOT_POSITIONS`, `TRAVEL_ORDER`, `FRONT_ROW_SLOTS`, `OVERLAP_*` and
`ZONE_REGIONS` that have to become per-discipline lookups.

## Still does NOT do

- **Real libero substitution.** The role exists and passes and digs, but
  swapping a libero for a middle rotating to the back row isn't modelled.
- **A serve-receive table per system.** Receive and defense are computed from
  who's on court and what they play, on purpose — see v0.11. A table would be
  more authoritative and would break the moment there are seven players, a
  reordered lineup, or a per-rotation role override.
- **Any backend.** No accounts, no database, no sync. Sharing is a link that
  carries its own data; saving is localStorage. Three static files, and it stays
  that way.
- **Redo.** Built in v0.13 and removed in the same version. Undo is 40 deep.
- **Beach doubles (2v2).** Not a mode, and not a small one. Beach has *no
  positional faults* — only serving order is fixed, and players may stand
  anywhere at service. That removes rotations through zones, the zones
  themselves, overlap checking, front and back row, the indoor roles, the
  role-driven receive and defense generation, and the quiz's only question.
  What survives is a court, drag, export and share. That's a positioning
  whiteboard, and it should be built as one deliberately — not bolted on as a
  mode that hides half the interface whenever it's selected.
- **Scoring rules for a missing server.** v0.20 reports that zone 1 is empty and
  says nothing about the consequence, because leagues disagree.

### Delivered — do not re-plan these

This list used to say these were out of scope. They shipped, and the list went
three versions without being corrected. Kept here so it isn't re-decided:

| Once "not doing" | Delivered |
|------------------|-----------|
| Serve receive formations | v0.11 |
| Defensive formations | v0.11 |
| The setter's switch after contact | v0.11 |
| Reordering the lineup | v0.4, by drag in v0.10 |
| Multiple teams or saved lineups | v0.6 |
| Sharing a diagram with someone else | v0.15 |
| 5-1 and 6-2 systems | v0.5 |
| Export to image | v0.8 |
| Overlap-legality checking | v0.19, base only |
