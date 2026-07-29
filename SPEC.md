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
