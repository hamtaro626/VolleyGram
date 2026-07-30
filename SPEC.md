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

## Tests

```
node test/migration.js    # 255 checks — storage, migration, roles, formations, quiz
node test/contrast.js     # colour contrast and hue separation
```

`migration.js` also asserts no source file contains a NUL byte. One slipped in
during v0.10 from a mis-written escape; it ran fine but made the file binary to
`grep`, `git diff` and editor search.

`migration.js` boots the real `script.js` against a stubbed DOM, so it tests the
shipped code rather than a copy of the logic. Covers every historical shape,
round-tripping, missing `activeId`, Simple mode, and nine kinds of corrupt input.

`contrast.js` parses the colours straight out of `style.css` for the same reason
— a hand-copied palette in the test would drift from the real one.

## Planned next

**Formation presets** — base / serve receive / defense per rotation. Needs a
real table of serve-receive positions per system, not a formula.

## Still does NOT do — on purpose

These are all good ideas. They are not next.

- Serve receive formations
- Defensive formations
- The setter's switch to the setting position after contact
- Overlap-legality checking
- Reordering the lineup (who starts in which slot)
- Multiple teams or saved lineups
- Sharing a diagram with someone else
- 5-1 or 6-2 systems
- Export to image
