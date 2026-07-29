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

## Tests

```
node test/migration.js    # 48 checks — storage, migration, corrupt input
node test/contrast.js     # colour contrast and hue separation
```

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
