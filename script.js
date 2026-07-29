// Volleyball Rotation Reference
//
// Court zones use volleyball's standard numbering, with the net at the top:
//
//     4   3   2      front row
//     5   6   1      back row (1 serves)
//
// Following the rotation, a player travels 1 -> 6 -> 5 -> 4 -> 3 -> 2 -> 1.
//
// The circles on screen are *players*, not zones. Each one keeps its identity
// for the life of the page and moves when you rotate, which is what lets the
// browser animate the trip.
//
// With more than six players the rotation becomes a ring: six spots are the
// court, the rest are the bench, and the bench block sits at one point in the
// travel order. Where it sits decides which zone subs enter at and which zone
// they rotate off from -- see ENTRY_SLOT below.

// --- The data ---------------------------------------------------------

// Where each zone sits on the court, as a percentage of the court's size.
// Percentages rather than pixels, so this works at any screen size.
const SLOT_POSITIONS = {
  4: { x: 22, y: 26 },
  3: { x: 50, y: 26 },
  2: { x: 78, y: 26 },
  5: { x: 22, y: 72 },
  6: { x: 50, y: 72 },
  1: { x: 78, y: 72 },
};

// Plain-language names, so the settings dropdown doesn't rely on you and me
// agreeing about zone numbers.
const ZONE_NAMES = {
  1: 'right back (serve)',
  2: 'right front',
  3: 'middle front',
  4: 'left front',
  5: 'left back',
  6: 'middle back',
};

// The order a player travels through the zones, following the rotation.
const TRAVEL_ORDER = [1, 6, 5, 4, 3, 2];

// Where the faint zone numbers sit. Front row tucks under the net, back row sits
// just above the endline, so each number is down inside the zone it names rather
// than bunched around the attack line. Kept clear of the player circles, which
// sit at x 22/50/78 and y 26/72 with a radius of 11.5% -- test/migration.js
// checks the clearance.
const ZONE_LABEL_POSITIONS = {
  4: { x: 4, y: 6 },
  3: { x: 37, y: 6 },
  2: { x: 70, y: 6 },
  5: { x: 4, y: 91 },
  6: { x: 37, y: 91 },
  1: { x: 70, y: 91 },
};

const FRONT_ROW_SLOTS = [2, 3, 4];
const BACK_ROW_SLOTS = [1, 5, 6];
const COURT_SPOTS = 6;
const SERVE_SLOT = 1; // zone 1 serves

// Pixels of horizontal travel before a drag across the court counts as a swipe.
const SWIPE_MIN = 45;

// The bench strip sits below the court. 112% is its middle -- see .bench in
// style.css, which draws it from 104% to 120%.
const BENCH_Y = 112;
const MAX_DRAG_Y = 120;
const MAX_PLAYERS = 12;
const HOLD_MS = 1500;
const HISTORY_LIMIT = 40;

// NONE is a real role meaning "not decided yet". Listed first so it's the top
// option in the roster dropdown.
const ROLE_LABELS = {
  NONE: 'No role',
  S: 'Setter',
  MB: 'Middle',
  OH: 'Outside',
  OPP: 'Opposite',
};

// What shows under the name on the court. Unset players get nothing rather than
// the words "No role" cluttering the circle.
function roleBadge(role) {
  return role === 'NONE' ? '' : ROLE_LABELS[role];
}

// The offensive systems. `lineup` is who starts in zones 1 through 6 -- players
// three apart in that list are opposite each other, which is what puts one of
// a pair in the front row whenever the other is in the back.
//
// `setsFrom` is the real difference between a 4-2 and a 6-2: both run two
// setters in the same spots, but a 4-2 sets with the front-row one (leaving two
// front-row attackers) while a 6-2 sets with the back-row one (leaving three).
const SYSTEMS = {
  simple: {
    name: 'Simple',
    blurb: 'no roles, just six spots',
    lineup: ['NONE', 'NONE', 'NONE', 'NONE', 'NONE', 'NONE'],
    setsFrom: null,
  },
  '4-2': {
    name: '4-2',
    blurb: 'two setters, front-row setter sets',
    lineup: ['S', 'MB', 'OH', 'S', 'MB', 'OH'],
    setsFrom: 'front',
  },
  '5-1': {
    name: '5-1',
    blurb: 'one setter all six rotations',
    lineup: ['S', 'MB', 'OH', 'OPP', 'MB', 'OH'],
    setsFrom: 'any',
  },
  '6-2': {
    name: '6-2',
    blurb: 'two setters, back-row setter sets',
    lineup: ['S', 'MB', 'OH', 'S', 'MB', 'OH'],
    setsFrom: 'back',
  },
};

const DEFAULT_SYSTEM = '4-2';

// Build a starting roster for a system. `fallback` is the name shown until you
// type a real one; it's fixed at creation so it doesn't change when you reorder
// the lineup. Roles that appear twice get numbered, roles that appear once
// don't -- so a 5-1 gets one plain "Setter", not "Setter 1".
function rosterFromSystem(key) {
  const { lineup } = SYSTEMS[key];
  const seen = {};
  return lineup.map((role, index) => {
    seen[role] = (seen[role] || 0) + 1;
    const total = lineup.filter((r) => r === role).length;
    const suffix = total > 1 ? ` ${seen[role]}` : '';
    return {
      id: `${role}${seen[role]}`,
      role,
      name: '',
      // Unset players are numbered rather than called "No role 1".
      fallback: role === 'NONE' ? `Player ${index + 1}` : `${ROLE_LABELS[role]}${suffix}`,
    };
  });
}

const STORAGE_KEY = 'volleyball-rotations-v1';

// Bumped when the saved shape changes. Version 2 wrapped what used to be a
// single team into a set of named lineups. The key deliberately stays the same
// so old data can be found and upgraded rather than orphaned.
const STORAGE_VERSION = 2;

// --- State ------------------------------------------------------------

// One team's worth of setup. Several of these live side by side in the store.
function newLineup(name) {
  return {
    name,
    system: DEFAULT_SYSTEM,
    roster: rosterFromSystem(DEFAULT_SYSTEM),
    layouts: {},        // rotation -> { player id -> {x, y} }
    roleOverrides: {},  // rotation -> { player id -> role }
    entrySlot: 1,       // the zone off-court players sub in at
  };
}

// Everything in `store` is yours -- it gets written to localStorage and
// reloaded next time. showLabels sits at the top level because it's a display
// preference, not a fact about any particular team.
let store = {
  version: STORAGE_VERSION,
  activeId: 'first',
  lineups: { first: newLineup('My team') },
  showLabels: true,
  roleScope: 'all',   // whether a role edit hits every rotation or just this one
};

// A live reference into store.lineups, so the rest of the code can go on
// saying `saved.roster` and have the change land in the right lineup.
let saved = store.lineups[store.activeId];

let currentRotation = 1;
const playerElements = {}; // player id -> the circle on screen

// Snapshots of `saved`, oldest first. Undo pops the newest.
const history = [];

const court = document.getElementById('court');
const statusLine = document.getElementById('status');
const rotationButtons = document.getElementById('rotationButtons');
const rosterPanel = document.getElementById('roster');
const rosterRows = document.getElementById('rosterRows');
const undoButton = document.getElementById('undo');
const holdButton = document.getElementById('resetAll');
const entrySelect = document.getElementById('entrySlot');
const systemSelect = document.getElementById('system');
const lineupSelect = document.getElementById('lineup');

// --- Working out who stands where -------------------------------------

// JavaScript's % returns a negative result for negative input, which breaks
// wrap-around maths. This always lands in 0..m-1.
function mod(n, m) {
  return ((n % m) + m) % m;
}

function rosterSize() {
  return saved.roster.length;
}

// A full cycle takes as many rotations as there are players, not six.
function rotationCount() {
  return rosterSize();
}

// The six zones in travel order, beginning wherever subs enter. Rotating this
// list is the whole mechanism behind the "subs enter at" setting: the bench
// always sits at the end, so whichever zone leads is the one players walk on
// to, and whichever trails is the one they rotate off from.
function courtPath() {
  const start = TRAVEL_ORDER.indexOf(saved.entrySlot);
  return [...TRAVEL_ORDER.slice(start), ...TRAVEL_ORDER.slice(0, start)];
}

// Position around the full cycle: 0-5 are court zones (in travel order),
// anything higher is a bench spot. Rotation 1 puts roster row N in zone N and
// everyone past the sixth on the bench, whatever the entry setting is.
function cycleIndex(rosterIndex, rotation) {
  const start = rosterIndex < COURT_SPOTS
    ? courtPath().indexOf(rosterIndex + 1)
    : rosterIndex;
  return mod(start + rotation - 1, rosterSize());
}

// The zone this player is in, or null if they're off court.
function slotFor(rosterIndex, rotation) {
  const index = cycleIndex(rosterIndex, rotation);
  return index < COURT_SPOTS ? courtPath()[index] : null;
}

function displayName(player) {
  return player.name || player.fallback;
}

// The role a player is filling in a given rotation. A per-rotation override
// beats their base role from the roster, which is how someone can play middle
// in one rotation and right side in another -- or how a 6-2 setter can be shown
// hitting when they're front row.
function roleFor(player, rotation) {
  const overrides = saved.roleOverrides[rotation];
  const override = overrides && overrides[player.id];
  return override && ROLE_LABELS[override] ? override : player.role;
}

function hasRoleOverride(player, rotation) {
  const overrides = saved.roleOverrides[rotation];
  return Boolean(overrides && overrides[player.id]);
}

function overrideCount() {
  return Object.values(saved.roleOverrides)
    .reduce((total, map) => total + Object.keys(map || {}).length, 0);
}

// The untouched, straight-off-the-rulebook position for one player.
function defaultPosition(rosterIndex, rotation) {
  const index = cycleIndex(rosterIndex, rotation);
  if (index < COURT_SPOTS) return { ...SLOT_POSITIONS[courtPath()[index]] };

  // On the bench: spread everyone evenly along the strip.
  const benchIndex = index - COURT_SPOTS;
  const benchCount = rosterSize() - COURT_SPOTS;
  return { x: (100 / (benchCount + 1)) * (benchIndex + 1), y: BENCH_Y };
}

function defaultLayout(rotation) {
  const layout = {};
  saved.roster.forEach((player, index) => {
    layout[player.id] = defaultPosition(index, rotation);
  });
  return layout;
}

function layoutFor(rotation) {
  if (!saved.layouts[rotation]) {
    saved.layouts[rotation] = defaultLayout(rotation);
  }
  return saved.layouts[rotation];
}

// --- Undo -------------------------------------------------------------

// Called *before* anything changes, so the stack holds "how things were".
// Snapshots are whole copies of `saved` -- wasteful in theory, but the data is
// a few hundred numbers, and it means undo can never half-restore something.
// Snapshots the whole store, not just the active lineup, so undo also covers
// creating, renaming, switching and deleting a lineup.
function pushHistory() {
  history.push(structuredClone(store));
  if (history.length > HISTORY_LIMIT) history.shift();
  syncUndoButton();
}

function undo() {
  if (history.length === 0) return;

  const before = saved;
  store = history.pop();
  saved = store.lineups[store.activeId];
  if (currentRotation > rotationCount()) currentRotation = 1;
  save();

  // Rebuilding throws away and recreates every circle, which kills the slide.
  // If the same players are still there we can just redraw and keep it.
  const samePlayers =
    saved.roster.length === before.roster.length &&
    saved.roster.every((player, index) =>
      player.id === before.roster[index].id && player.role === before.roster[index].role);

  if (samePlayers) {
    buildRosterRows();
    syncSelects();
    render();
  } else {
    rebuild();
  }
  syncUndoButton();
}

function syncUndoButton() {
  undoButton.disabled = history.length === 0;
  undoButton.textContent = history.length ? `Undo (${history.length})` : 'Undo';
}

// --- Saving between visits --------------------------------------------

// localStorage is the browser keeping a note to itself on this device. No
// server involved. It can throw -- private browsing, full disk -- and a
// rotation diagram is not worth crashing over, so both sides swallow errors.
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (error) {
    console.warn('Could not save:', error);
  }
}

// Turn whatever shape a lineup was saved in into the current one, filling any
// gaps with defaults. Every version of this app that has ever written to
// localStorage has to survive coming through here:
//
//   v0.2  { names: {id: name}, layouts }        -- names in a side lookup
//   v0.3  { roster: [...], layouts }            -- names moved onto the roster
//   v0.4  { ..., entrySlot }
//   v0.5  { ..., system }
//
// It also guards against data that's merely broken, since a stored blob is
// user-editable in devtools and one bad field shouldn't white-screen the app.
function normaliseLineup(raw, fallbackName) {
  const system = SYSTEMS[raw.system] ? raw.system : DEFAULT_SYSTEM;

  let roster = raw.roster;
  if (!Array.isArray(roster)) {
    // Oldest saves kept names in a separate lookup keyed by player id.
    roster = rosterFromSystem(system).map((player) => ({
      ...player,
      name: (raw.names && raw.names[player.id]) || '',
    }));
  }

  roster = roster
    .filter((player) => player && typeof player.id === 'string')
    .map((player, index) => ({
      id: player.id,
      // An unrecognised role becomes unset rather than a guess at a position.
      role: ROLE_LABELS[player.role] ? player.role : 'NONE',
      name: typeof player.name === 'string' ? player.name : '',
      // Saves before v0.4 predate `fallback`, so derive one from the role.
      fallback: player.fallback || `${ROLE_LABELS[player.role] || 'Player'} ${index + 1}`,
    }));

  // A rotation needs six players. Anything less isn't recoverable, so start over.
  if (roster.length < COURT_SPOTS) roster = rosterFromSystem(system);

  return {
    name: raw.name || fallbackName,
    system,
    roster,
    layouts: raw.layouts && typeof raw.layouts === 'object' ? raw.layouts : {},
    // Added in v0.8. Absent in every earlier save, hence the default rather
    // than a version bump -- an extra optional field breaks nothing.
    roleOverrides: raw.roleOverrides && typeof raw.roleOverrides === 'object'
      ? raw.roleOverrides : {},
    entrySlot: TRAVEL_ORDER.includes(raw.entrySlot) ? raw.entrySlot : 1,
  };
}

function load() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    const parsed = JSON.parse(stored);

    let lineups;
    let activeId;

    if (parsed.version === STORAGE_VERSION && parsed.lineups) {
      lineups = {};
      Object.entries(parsed.lineups).forEach(([id, lineup]) => {
        lineups[id] = normaliseLineup(lineup, 'Untitled');
      });
      activeId = parsed.activeId;
    } else {
      // Written by a version that only knew about one team. Wrap it as the
      // first named lineup rather than throwing the roster away.
      activeId = 'first';
      lineups = { first: normaliseLineup(parsed, 'My team') };
    }

    const ids = Object.keys(lineups);
    if (ids.length === 0) return;

    store = {
      version: STORAGE_VERSION,
      activeId: lineups[activeId] ? activeId : ids[0],
      lineups,
      showLabels: parsed.showLabels !== false,
      roleScope: parsed.roleScope === 'rotation' ? 'rotation' : 'all',
    };
    saved = store.lineups[store.activeId];
  } catch (error) {
    console.warn('Could not load saved data, starting fresh:', error);
  }
}

// --- Building the page ------------------------------------------------

// Rebuilt from scratch whenever the lineup changes, since the number of
// circles and buttons depends on how many players there are.
function buildPlayers() {
  Object.values(playerElements).forEach((el) => el.remove());
  Object.keys(playerElements).forEach((id) => delete playerElements[id]);

  saved.roster.forEach((player) => {
    const el = document.createElement('div');
    el.className = `player role-${player.role}`;
    el.dataset.playerId = player.id;
    el.innerHTML = '<span class="name"></span><span class="label"></span>'
      + '<span class="serve-tag">Server</span>';
    el.addEventListener('pointerdown', startDrag);
    el.addEventListener('pointermove', onDrag);
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    court.appendChild(el);
    playerElements[player.id] = el;
  });
}

// Built once and never touched again -- the numbers don't change. They sit
// before the players in the DOM so circles always draw on top of them.
function buildZoneLabels() {
  Object.entries(ZONE_LABEL_POSITIONS).forEach(([zone, position]) => {
    const label = document.createElement('span');
    label.className = 'zone-label';
    label.textContent = zone;
    label.style.left = `${position.x}%`;
    label.style.top = `${position.y}%`;
    court.appendChild(label);
  });
}

function buildRotationButtons() {
  rotationButtons.replaceChildren();
  for (let r = 1; r <= rotationCount(); r++) {
    const button = document.createElement('button');
    button.textContent = r;
    button.addEventListener('click', () => setRotation(r));
    rotationButtons.appendChild(button);
  }
}

function iconButton(className, glyph, title, onClick) {
  const button = document.createElement('button');
  button.className = className;
  button.textContent = glyph;
  button.title = title;
  button.addEventListener('click', onClick);
  return button;
}

function buildRosterRows() {
  rosterRows.replaceChildren();

  saved.roster.forEach((player, index) => {
    // The panel shows what's on court right now, so it reflects any override
    // for the rotation you're looking at rather than the underlying base role.
    const effectiveRole = roleFor(player, currentRotation);
    const overridden = hasRoleOverride(player, currentRotation);

    const row = document.createElement('div');
    row.className = overridden ? 'roster-row overridden' : 'roster-row';
    row.dataset.playerId = player.id;

    const swatch = document.createElement('span');
    swatch.className = `swatch role-${effectiveRole}`;

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = player.name;
    nameInput.placeholder = player.fallback;
    nameInput.maxLength = 14;
    // One snapshot when you start editing, not one per keystroke.
    nameInput.addEventListener('focus', pushHistory);
    nameInput.addEventListener('input', () => {
      player.name = nameInput.value.trim();
      save();
      render();
    });

    const roleSelect = document.createElement('select');
    Object.entries(ROLE_LABELS).forEach(([code, label]) => {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = label;
      option.selected = code === effectiveRole;
      roleSelect.appendChild(option);
    });
    roleSelect.title = overridden
      ? `Set for rotation ${currentRotation} only — base role is ${ROLE_LABELS[player.role]}`
      : ROLE_LABELS[effectiveRole];

    roleSelect.addEventListener('change', () => {
      pushHistory();
      if (store.roleScope === 'rotation') {
        if (!saved.roleOverrides[currentRotation]) saved.roleOverrides[currentRotation] = {};
        saved.roleOverrides[currentRotation][player.id] = roleSelect.value;
      } else {
        player.role = roleSelect.value;
        // Drop this player's overrides, or the new base role would be masked in
        // exactly the rotations you'd previously customised.
        Object.values(saved.roleOverrides).forEach((map) => { delete map[player.id]; });
      }
      save();
      buildRosterRows();
      render();
    });

    // Drag handle. HTML5 drag-and-drop doesn't fire on touch, so this runs on
    // pointer events instead -- same code path for finger and mouse. Arrow keys
    // still work when the handle has focus, since a drag-only control would be
    // unusable from a keyboard.
    const handle = document.createElement('button');
    handle.className = 'icon handle';
    handle.textContent = '⠿';
    handle.title = `Drag to reorder ${displayName(player)}, or use the arrow keys`;
    handle.addEventListener('pointerdown', (event) => startRowDrag(event, row));
    handle.addEventListener('pointermove', onRowDragMove);
    handle.addEventListener('pointerup', endRowDrag);
    handle.addEventListener('pointercancel', endRowDrag);
    handle.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        movePlayer(index, -1);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        movePlayer(index, 1);
      }
    });

    row.append(handle, swatch, nameInput, roleSelect);

    // Only the extras can be removed -- the first six are the rotation.
    if (index >= COURT_SPOTS) {
      row.append(iconButton('icon remove', '×', `Remove ${displayName(player)}`,
        () => changeLineup(() => { saved.roster.splice(index, 1); })));
    } else {
      row.append(document.createElement('span'));
    }

    rosterRows.appendChild(row);
  });

  document.getElementById('addPlayer').disabled = rosterSize() >= MAX_PLAYERS;

  const clearButton = document.getElementById('clearRoleOverrides');
  const overrides = overrideCount();
  clearButton.disabled = overrides === 0;
  clearButton.textContent = overrides === 0
    ? 'No per-rotation roles set'
    : `Clear ${overrides} per-rotation role${overrides === 1 ? '' : 's'}`;
}

function syncLineupSelect() {
  lineupSelect.replaceChildren();
  Object.entries(store.lineups).forEach(([id, lineup]) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = lineup.name;
    option.selected = id === store.activeId;
    lineupSelect.appendChild(option);
  });
  // Never let someone delete their way down to no lineups at all.
  document.getElementById('deleteLineup').disabled = Object.keys(store.lineups).length <= 1;
}

function syncSelects() {
  syncLineupSelect();
  syncSystemSelect();
  syncEntrySelect();
}

// Point `saved` at a different lineup. Everything else reads through it, so
// this plus a rebuild is the entire act of switching teams.
function useLineup(id) {
  if (!store.lineups[id] || id === store.activeId) return;
  pushHistory();
  store.activeId = id;
  saved = store.lineups[id];
  currentRotation = 1;
  save();
  rebuild();
}

function addLineup() {
  const name = (prompt('Name for the new lineup?', 'New team') || '').trim();
  if (!name) return;
  pushHistory();
  const id = `L${Date.now()}`;
  store.lineups[id] = newLineup(name);
  store.activeId = id;
  saved = store.lineups[id];
  currentRotation = 1;
  save();
  rebuild();
}

function duplicateLineup() {
  pushHistory();
  const id = `L${Date.now()}`;
  const copy = structuredClone(saved);
  copy.name = `${saved.name} copy`;
  store.lineups[id] = copy;
  store.activeId = id;
  saved = copy;
  save();
  rebuild();
}

function renameLineup() {
  const name = (prompt('Rename this lineup', saved.name) || '').trim();
  if (!name) return;
  pushHistory();
  saved.name = name;
  save();
  syncLineupSelect();
}

function deleteLineup() {
  if (Object.keys(store.lineups).length <= 1) return;
  if (!confirm(`Delete "${saved.name}"? Undo will bring it back.`)) return;
  pushHistory();
  delete store.lineups[store.activeId];
  store.activeId = Object.keys(store.lineups)[0];
  saved = store.lineups[store.activeId];
  currentRotation = 1;
  save();
  rebuild();
}

function syncSystemSelect() {
  systemSelect.replaceChildren();
  Object.entries(SYSTEMS).forEach(([key, system]) => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = `${system.name} — ${system.blurb}`;
    option.selected = key === saved.system;
    systemSelect.appendChild(option);
  });
}

// Switching system rewrites the six court roles. Names carry across by lineup
// position, so your fourth player stays your fourth player even though their
// role changed -- and anyone past the sixth is left alone entirely.
function applySystem(key) {
  changeLineup(() => {
    const previous = saved.roster;
    saved.system = key;
    saved.roster = [
      ...rosterFromSystem(key).map((player, index) => ({
        ...player,
        name: previous[index] ? previous[index].name : '',
      })),
      ...previous.slice(COURT_SPOTS),
    ];
  });
}

function syncEntrySelect() {
  entrySelect.replaceChildren();
  TRAVEL_ORDER.slice().sort((a, b) => a - b).forEach((zone) => {
    const option = document.createElement('option');
    option.value = zone;
    option.textContent = `Zone ${zone} — ${ZONE_NAMES[zone]}`;
    option.selected = zone === saved.entrySlot;
    entrySelect.appendChild(option);
  });
}

// Anything that reshuffles who stands where invalidates every dragged
// position, since those coordinates were chosen for a different arrangement.
// Undo covers you if it wasn't what you wanted.
function changeLineup(mutate) {
  pushHistory();
  mutate();
  saved.layouts = {};
  if (currentRotation > rotationCount()) currentRotation = 1;
  save();
  rebuild();
}

function movePlayer(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= rosterSize()) return;
  changeLineup(() => {
    const [player] = saved.roster.splice(index, 1);
    saved.roster.splice(target, 0, player);
  });
}

// --- Reordering by drag -----------------------------------------------

// The dragged row's DOM node gets moved directly instead of rebuilding the list
// on every pointermove -- rebuilding would destroy the element mid-drag, and the
// pointer capture with it. The roster array is only rewritten on release, which
// also means one undo step per drag rather than one per pixel.
let rowDrag = null;

function startRowDrag(event, row) {
  rowDrag = row;
  row.classList.add('row-dragging');
  event.currentTarget.setPointerCapture(event.pointerId);
}

function onRowDragMove(event) {
  if (!rowDrag) return;

  const rows = [...rosterRows.children];
  const dragIndex = rows.indexOf(rowDrag);

  for (const other of rows) {
    if (other === rowDrag) continue;
    const box = other.getBoundingClientRect();
    const middle = box.top + box.height / 2;
    const above = rows.indexOf(other) < dragIndex;

    // Crossing a neighbour's midpoint moves past it.
    if (above && event.clientY < middle) {
      rosterRows.insertBefore(rowDrag, other);
      return;
    }
    if (!above && event.clientY > middle) {
      rosterRows.insertBefore(rowDrag, other.nextSibling);
      return;
    }
  }
}

function endRowDrag() {
  if (!rowDrag) return;
  rowDrag.classList.remove('row-dragging');
  rowDrag = null;
  applyRosterOrder([...rosterRows.children].map((row) => row.dataset.playerId));
}

// Rewrites the roster to match a list of player ids. Returns whether anything
// actually moved, so a tap on the handle that went nowhere doesn't burn an undo
// step or wipe the layouts.
function applyRosterOrder(order) {
  const current = saved.roster.map((player) => player.id);
  if (order.join(' ') === current.join(' ')) return false;

  changeLineup(() => {
    const byId = new Map(saved.roster.map((player) => [player.id, player]));
    const reordered = order.map((id) => byId.get(id)).filter(Boolean);
    // Anyone the incoming list left out keeps their place at the end, so a bad
    // order can never silently delete a player.
    const missing = saved.roster.filter((player) => !order.includes(player.id));
    saved.roster = [...reordered, ...missing];
  });
  return true;
}

function rebuild() {
  // Drop the animation first, or the rebuilt circles slide in from the corner.
  court.classList.remove('animate');
  buildPlayers();
  buildRotationButtons();
  buildRosterRows();
  syncSelects();
  render();
  requestAnimationFrame(() => court.classList.add('animate'));
}

// --- Drawing the current rotation -------------------------------------

function render() {
  const layout = layoutFor(currentRotation);

  saved.roster.forEach((player, index) => {
    const el = playerElements[player.id];
    const position = layout[player.id] || defaultPosition(index, currentRotation);
    const slot = slotFor(index, currentRotation);

    // Setting left/top is all it takes to move a player. The CSS transition
    // handles the actual sliding.
    const role = roleFor(player, currentRotation);

    el.style.left = `${position.x}%`;
    el.style.top = `${position.y}%`;

    // Rebuilt rather than toggled, because the role -- and so the colour -- can
    // differ from one rotation to the next.
    el.className = `player role-${role}`;
    if (slot === null) el.classList.add('benched');
    if (slot === SERVE_SLOT) el.classList.add('serving');

    el.querySelector('.name').textContent = displayName(player);
    el.querySelector('.label').textContent = roleBadge(role);

    const prefix = roleBadge(role) ? `${ROLE_LABELS[role]}, ` : '';
    el.title = slot === null
      ? `${displayName(player)} — ${prefix}off court`
      : `${displayName(player)} — ${prefix}zone ${slot}${slot === SERVE_SLOT ? ', serving' : ''}`;
  });

  // No point drawing an empty bench strip when everyone's on court.
  court.classList.toggle('has-bench', rosterSize() > COURT_SPOTS);

  statusLine.textContent = describeRotation();

  [...rotationButtons.children].forEach((button, index) => {
    button.classList.toggle('active', index + 1 === currentRotation);
  });

  document.body.classList.toggle('hide-labels', !store.showLabels);
}

// Name whoever is setting this rotation. Which setter that is depends on the
// system: a 4-2 sets with the front-row setter, a 6-2 with the back-row one,
// and a 5-1 has only one setter so it's whoever that is, wherever they are.
//
// With a roster of exactly six there's always exactly one answer. Add players
// and that guarantee goes away, so report what's actually true instead of
// inventing something.
function describeRotation(rotation = currentRotation) {
  const label = `Rotation ${rotation} of ${rotationCount()}`;
  const { setsFrom } = SYSTEMS[saved.system];

  // Simple mode has no roles, so there's nothing to say about who sets.
  if (!setsFrom) return label;

  const onCourtSetters = saved.roster
    .map((player, index) => ({ player, slot: slotFor(index, rotation) }))
    .filter(({ player, slot }) => roleFor(player, rotation) === 'S' && slot !== null);

  const eligible = onCourtSetters.filter(({ slot }) => {
    if (setsFrom === 'front') return FRONT_ROW_SLOTS.includes(slot);
    if (setsFrom === 'back') return BACK_ROW_SLOTS.includes(slot);
    return true;
  });

  if (eligible.length === 0) {
    const where = setsFrom === 'any' ? 'on court' : `in the ${setsFrom} row`;
    return `${label} — no setter ${where}`;
  }

  const who = eligible
    .map(({ player, slot }) => `${displayName(player)} (zone ${slot})`)
    .join(' & ');

  // In a 5-1 the setter's row is the thing that changes the offense: back row
  // means three front-row attackers, front row means two.
  const suffix = setsFrom === 'any' && eligible.length === 1
    ? `, ${FRONT_ROW_SLOTS.includes(eligible[0].slot) ? '2' : '3'} front-row hitters`
    : '';

  return `${label} — ${who} sets${suffix}`;
}

function setRotation(rotation) {
  currentRotation = rotation;
  // The roster panel shows roles for the rotation you're looking at, so it has
  // to be rebuilt when that changes.
  buildRosterRows();
  render();
}

// Wrap around at both ends: next from the last rotation goes back to 1.
function step(delta) {
  setRotation(mod(currentRotation - 1 + delta, rotationCount()) + 1);
}

// --- Dragging ---------------------------------------------------------

let dragTarget = null;
let grabOffsetX = 0;
let grabOffsetY = 0;

// Bumped every time you grab someone. Without it, overlapping players stack in
// the order they were created, so the same ones are always buried.
let topZ = 1;

function startDrag(event) {
  pushHistory();

  dragTarget = event.currentTarget;
  const rect = dragTarget.getBoundingClientRect();

  // How far the finger is from the circle's center, so the circle doesn't
  // jump to sit under the fingertip the moment you touch it.
  grabOffsetX = event.clientX - (rect.left + rect.width / 2);
  grabOffsetY = event.clientY - (rect.top + rect.height / 2);

  // Routes every later pointer event to this element, even if the finger
  // slides off it. Without this, fast drags drop the player.
  dragTarget.setPointerCapture(event.pointerId);
  dragTarget.classList.add('dragging');
  dragTarget.style.zIndex = ++topZ;
}

function onDrag(event) {
  if (!dragTarget) return;

  const courtRect = court.getBoundingClientRect();
  const x = ((event.clientX - grabOffsetX - courtRect.left) / courtRect.width) * 100;
  const y = ((event.clientY - grabOffsetY - courtRect.top) / courtRect.height) * 100;

  const lowestY = rosterSize() > COURT_SPOTS ? MAX_DRAG_Y : 100;
  dragTarget.style.left = `${clamp(x, 0, 100)}%`;
  dragTarget.style.top = `${clamp(y, 0, lowestY)}%`;
}

function endDrag() {
  if (!dragTarget) return;

  // Write where they ended up into this rotation only. The others are
  // untouched.
  layoutFor(currentRotation)[dragTarget.dataset.playerId] = {
    x: parseFloat(dragTarget.style.left),
    y: parseFloat(dragTarget.style.top),
  };
  save();

  dragTarget.classList.remove('dragging');
  dragTarget = null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

// --- Export to image --------------------------------------------------

// Drawing to a canvas means redescribing the court in a second place, which is
// a real maintenance cost: change the CSS and the export can silently drift.
// Reading every colour back out of the live stylesheet keeps at least the
// palette honest -- there's still only one definition of what a Setter looks
// like, and it's in style.css.
const colourCache = {};

function roleColours(role) {
  if (!colourCache[role]) {
    const probe = document.createElement('div');
    probe.className = `player role-${role}`;
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    document.body.appendChild(probe);
    const computed = getComputedStyle(probe);
    colourCache[role] = { fill: computed.backgroundColor, text: computed.color };
    probe.remove();
  }
  return colourCache[role];
}

// Traces a fully rounded rectangle. ctx.roundRect exists in current browsers but
// not older ones, and this is three lines.
function pill(ctx, x, y, width, height) {
  const r = height / 2;
  ctx.beginPath();
  ctx.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5);
  ctx.arc(x + width - r, y + r, r, Math.PI * 1.5, Math.PI / 2);
  ctx.closePath();
}

// Draws one rotation at the canvas origin, EDGE pixels wide. Returns how tall
// the drawing came out, so the caller knows where a caption can go.
function drawRotation(ctx, rotation, EDGE, hasBench) {
  ctx.fillStyle = getComputedStyle(court).backgroundColor;
  ctx.fillRect(0, 0, EDGE, EDGE);
  ctx.strokeStyle = '#f2f4f8';
  ctx.lineWidth = EDGE * 0.005;
  ctx.strokeRect(0, 0, EDGE, EDGE);

  // Attack line, one third back from the net.
  ctx.beginPath();
  ctx.moveTo(0, EDGE / 3);
  ctx.lineTo(EDGE, EDGE / 3);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.lineWidth = EDGE * 0.003;
  ctx.stroke();

  // Zone numbers, from the same table the on-screen ones use.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `700 ${Math.round(EDGE * 0.032)}px -apple-system, system-ui, sans-serif`;
  Object.entries(ZONE_LABEL_POSITIONS).forEach(([zone, position]) => {
    ctx.fillText(zone, (position.x / 100) * EDGE, (position.y / 100) * EDGE);
  });

  // Net along the top.
  ctx.strokeStyle = '#f2f4f8';
  ctx.lineWidth = EDGE * 0.012;
  ctx.setLineDash([EDGE * 0.007, EDGE * 0.007]);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(EDGE, 0);
  ctx.stroke();
  ctx.setLineDash([]);

  if (hasBench) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = EDGE * 0.003;
    ctx.setLineDash([EDGE * 0.012, EDGE * 0.012]);
    ctx.strokeRect(0, EDGE * 1.04, EDGE, EDGE * 0.16);
    ctx.setLineDash([]);
  }

  // Read positions directly rather than through layoutFor(), which would write
  // default layouts into storage for rotations you've never actually opened.
  const layout = saved.layouts[rotation];
  const radius = EDGE * 0.115;

  saved.roster.forEach((player, index) => {
    const position = (layout && layout[player.id]) || defaultPosition(index, rotation);
    const role = roleFor(player, rotation);
    const { fill, text } = roleColours(role);
    const cx = (position.x / 100) * EDGE;
    const cy = (position.y / 100) * EDGE;
    const slot = slotFor(index, rotation);

    ctx.globalAlpha = slot === null ? 0.45 : 1;

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = EDGE * 0.005;
    ctx.stroke();

    // Outer ring on the server, matching the on-screen marker.
    if (slot === SERVE_SLOT) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius + EDGE * 0.008, 0, Math.PI * 2);
      ctx.strokeStyle = '#f2f4f8';
      ctx.lineWidth = EDGE * 0.006;
      ctx.stroke();
    }

    const badge = store.showLabels ? roleBadge(role) : '';
    ctx.fillStyle = text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(EDGE * 0.038)}px -apple-system, system-ui, sans-serif`;
    ctx.fillText(displayName(player), cx, badge ? cy - EDGE * 0.019 : cy, radius * 1.7);
    if (badge) {
      ctx.font = `500 ${Math.round(EDGE * 0.027)}px -apple-system, system-ui, sans-serif`;
      ctx.fillText(badge, cx, cy + EDGE * 0.023, radius * 1.7);
    }

    // The Server pill, drawn last so it sits on top of the ring and the circle.
    if (slot === SERVE_SLOT) {
      const label = 'SERVER';
      ctx.font = `700 ${Math.round(EDGE * 0.021)}px -apple-system, system-ui, sans-serif`;
      const boxWidth = ctx.measureText(label).width + EDGE * 0.026;
      const boxHeight = EDGE * 0.036;
      const boxTop = cy + radius - boxHeight / 2;

      ctx.fillStyle = '#f2f4f8';
      pill(ctx, cx - boxWidth / 2, boxTop, boxWidth, boxHeight);
      ctx.fill();

      ctx.fillStyle = '#16181d';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cx, boxTop + boxHeight / 2);
    }

    ctx.globalAlpha = 1;
  });

  return hasBench ? EDGE * 1.2 : EDGE;
}

// Captions let the image explain itself once it's out of the app and sitting in
// a camera roll or a Premiere bin.
function drawCaption(ctx, line, EDGE, y) {
  ctx.fillStyle = '#a9b2c6';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.round(EDGE * 0.026)}px -apple-system, system-ui, sans-serif`;
  ctx.fillText(line, 0, y, EDGE);
}

function newCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = getComputedStyle(document.body).backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

function exportImage() {
  const EDGE = 1000; // court edge in pixels; everything else scales off it
  const hasBench = rosterSize() > COURT_SPOTS;
  const pad = Math.round(EDGE * 0.045);
  const tall = hasBench ? EDGE * 1.24 : EDGE;

  const { canvas, ctx } = newCanvas(EDGE + pad * 2, tall + pad * 2);
  ctx.translate(pad, pad);
  drawRotation(ctx, currentRotation, EDGE, hasBench);
  drawCaption(ctx, `${saved.name} — ${describeRotation(currentRotation)}`, EDGE,
    tall + pad * 0.5);

  downloadCanvas(canvas, `${saved.name}-rotation-${currentRotation}`);
}

// One contact sheet with every rotation, two across. Easier to use than a burst
// of separate downloads, which browsers block anyway after the first one.
function exportAllRotations() {
  const EDGE = 620;
  const hasBench = rosterSize() > COURT_SPOTS;
  const pad = Math.round(EDGE * 0.07);
  const tile = (hasBench ? EDGE * 1.24 : EDGE) + EDGE * 0.09;
  const cols = Math.min(2, rotationCount());
  const rows = Math.ceil(rotationCount() / cols);
  const titleBand = EDGE * 0.13;

  const { canvas, ctx } = newCanvas(
    cols * EDGE + pad * (cols + 1),
    rows * tile + pad * (rows + 1) + titleBand,
  );

  ctx.fillStyle = '#f2f4f8';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(EDGE * 0.06)}px -apple-system, system-ui, sans-serif`;
  ctx.fillText(`${saved.name} — ${SYSTEMS[saved.system].name}`, pad, titleBand / 2);

  for (let rotation = 1; rotation <= rotationCount(); rotation++) {
    const col = (rotation - 1) % cols;
    const row = Math.floor((rotation - 1) / cols);
    ctx.save();
    ctx.translate(pad + col * (EDGE + pad), titleBand + pad + row * (tile + pad));
    const drawn = drawRotation(ctx, rotation, EDGE, hasBench);
    drawCaption(ctx, describeRotation(rotation), EDGE, drawn + EDGE * 0.055);
    ctx.restore();
  }

  downloadCanvas(canvas, `${saved.name}-all-rotations`);
}

function downloadCanvas(canvas, stemSource) {
  const stem = stemSource
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const link = document.createElement('a');
  link.download = `${stem || 'rotation'}.png`;
  link.href = canvas.toDataURL('image/png');
  // Some browsers ignore a click on a link that isn't in the document.
  document.body.appendChild(link);
  link.click();
  link.remove();
}

// --- Controls ---------------------------------------------------------

document.getElementById('prev').addEventListener('click', () => step(-1));
document.getElementById('next').addEventListener('click', () => step(1));
undoButton.addEventListener('click', undo);

document.getElementById('reset').addEventListener('click', () => {
  pushHistory();
  saved.layouts[currentRotation] = defaultLayout(currentRotation);
  save();
  render();
});

document.getElementById('addPlayer').addEventListener('click', () => changeLineup(() => {
  const n = rosterSize() + 1;
  // Unset rather than a guess -- you haven't said what they play yet.
  saved.roster.push({ id: `P${Date.now()}`, role: 'NONE', name: '', fallback: `Player ${n}` });
}));

entrySelect.addEventListener('change', () => {
  changeLineup(() => { saved.entrySlot = Number(entrySelect.value); });
});

systemSelect.addEventListener('change', () => applySystem(systemSelect.value));
lineupSelect.addEventListener('change', () => useLineup(lineupSelect.value));

document.getElementById('newLineup').addEventListener('click', addLineup);
document.getElementById('duplicateLineup').addEventListener('click', duplicateLineup);
document.getElementById('renameLineup').addEventListener('click', renameLineup);
document.getElementById('deleteLineup').addEventListener('click', deleteLineup);

// Hold to reset all. The bar filling across the button is a CSS transition on
// width; letting go removes the class, which snaps it back to zero.
let holdTimer = null;

function startHold() {
  holdButton.classList.add('holding');
  holdTimer = setTimeout(() => {
    cancelHold();
    pushHistory();
    saved.layouts = {};
    save();
    render();
  }, HOLD_MS);
}

function cancelHold() {
  clearTimeout(holdTimer);
  holdTimer = null;
  holdButton.classList.remove('holding');
}

holdButton.addEventListener('pointerdown', startHold);
holdButton.addEventListener('pointerup', cancelHold);
holdButton.addEventListener('pointerleave', cancelHold);
holdButton.addEventListener('pointercancel', cancelHold);

document.getElementById('exportImage').addEventListener('click', exportImage);
document.getElementById('exportAll').addEventListener('click', exportAllRotations);

// Swiping across empty court changes rotation. A swipe that starts on a player
// is ignored, or dragging someone sideways would flip the rotation out from
// under you mid-drag.
let swipeFrom = null;

court.addEventListener('pointerdown', (event) => {
  const onPlayer = event.target.closest && event.target.closest('.player');
  swipeFrom = onPlayer ? null : { x: event.clientX, y: event.clientY };
});

court.addEventListener('pointerup', (event) => {
  if (!swipeFrom) return;
  const dx = event.clientX - swipeFrom.x;
  const dy = event.clientY - swipeFrom.y;
  swipeFrom = null;
  // Far enough to be deliberate, and more horizontal than vertical.
  if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) <= Math.abs(dy)) return;
  step(dx < 0 ? 1 : -1);
});

court.addEventListener('pointercancel', () => { swipeFrom = null; });

document.addEventListener('keydown', (event) => {
  // Don't hijack the arrows while someone's typing a name or in a dropdown.
  const tag = event.target && event.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (event.key === 'ArrowLeft') {
    step(-1);
    event.preventDefault();
  } else if (event.key === 'ArrowRight') {
    step(1);
    event.preventDefault();
  }
});

const roleScopeSelect = document.getElementById('roleScope');
roleScopeSelect.addEventListener('change', () => {
  store.roleScope = roleScopeSelect.value === 'rotation' ? 'rotation' : 'all';
  save();
  buildRosterRows();
});

document.getElementById('clearRoleOverrides').addEventListener('click', () => {
  if (overrideCount() === 0) return;
  pushHistory();
  saved.roleOverrides = {};
  save();
  buildRosterRows();
  render();
});

const rosterButton = document.getElementById('toggleRoster');
rosterButton.addEventListener('click', () => {
  rosterPanel.hidden = !rosterPanel.hidden;
  syncRosterButton();
});

function syncRosterButton() {
  const open = !rosterPanel.hidden;
  rosterButton.textContent = open ? 'Hide roster' : 'Show roster';
  rosterButton.setAttribute('aria-expanded', String(open));
}

const labelsButton = document.getElementById('toggleLabels');
labelsButton.addEventListener('click', () => {
  store.showLabels = !store.showLabels;
  syncLabelsButton();
  save();
  render();
});

function syncLabelsButton() {
  labelsButton.textContent = `Labels: ${store.showLabels ? 'on' : 'off'}`;
  labelsButton.setAttribute('aria-pressed', String(store.showLabels));
}

// --- Start it up ------------------------------------------------------

load();
syncLabelsButton();
syncRosterButton();
syncUndoButton();
roleScopeSelect.value = store.roleScope;
buildZoneLabels();
rebuild();

// Write straight back after loading, so data saved by an older version gets
// upgraded on the spot instead of sitting in its old shape until the first
// edit. Without this a stale shape can survive indefinitely.
save();
