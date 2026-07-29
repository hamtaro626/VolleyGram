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

const FRONT_ROW_SLOTS = [2, 3, 4];
const BACK_ROW_SLOTS = [1, 5, 6];
const COURT_SPOTS = 6;

// The bench strip sits below the court. 112% is its middle -- see .bench in
// style.css, which draws it from 104% to 120%.
const BENCH_Y = 112;
const MAX_DRAG_Y = 120;
const MAX_PLAYERS = 12;
const HOLD_MS = 1500;
const HISTORY_LIMIT = 40;

const ROLE_LABELS = { S: 'Setter', MB: 'Middle', OH: 'Outside', OPP: 'Opposite' };

// The offensive systems. `lineup` is who starts in zones 1 through 6 -- players
// three apart in that list are opposite each other, which is what puts one of
// a pair in the front row whenever the other is in the back.
//
// `setsFrom` is the real difference between a 4-2 and a 6-2: both run two
// setters in the same spots, but a 4-2 sets with the front-row one (leaving two
// front-row attackers) while a 6-2 sets with the back-row one (leaving three).
const SYSTEMS = {
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
  return lineup.map((role) => {
    seen[role] = (seen[role] || 0) + 1;
    const total = lineup.filter((r) => r === role).length;
    const suffix = total > 1 ? ` ${seen[role]}` : '';
    return {
      id: `${role}${seen[role]}`,
      role,
      name: '',
      fallback: `${ROLE_LABELS[role]}${suffix}`,
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
    layouts: {},   // rotation -> { player id -> {x, y} }
    entrySlot: 1,  // the zone off-court players sub in at
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
      role: ROLE_LABELS[player.role] ? player.role : 'OH',
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
    el.innerHTML = '<span class="name"></span><span class="label"></span>';
    el.addEventListener('pointerdown', startDrag);
    el.addEventListener('pointermove', onDrag);
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    court.appendChild(el);
    playerElements[player.id] = el;
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
    const row = document.createElement('div');
    row.className = 'roster-row';

    const swatch = document.createElement('span');
    swatch.className = `swatch role-${player.role}`;

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
      option.selected = code === player.role;
      roleSelect.appendChild(option);
    });
    roleSelect.addEventListener('change', () => {
      pushHistory();
      player.role = roleSelect.value;
      swatch.className = `swatch role-${player.role}`;
      playerElements[player.id].className = `player role-${player.role}`;
      save();
      render();
    });

    const up = iconButton('icon', '▲', `Move ${displayName(player)} earlier`,
      () => movePlayer(index, -1));
    up.disabled = index === 0;

    const down = iconButton('icon', '▼', `Move ${displayName(player)} later`,
      () => movePlayer(index, 1));
    down.disabled = index === rosterSize() - 1;

    row.append(swatch, nameInput, roleSelect, up, down);

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
    el.style.left = `${position.x}%`;
    el.style.top = `${position.y}%`;
    el.classList.toggle('benched', slot === null);

    el.querySelector('.name').textContent = displayName(player);
    el.querySelector('.label').textContent = ROLE_LABELS[player.role];
    el.title = slot === null
      ? `${displayName(player)} — ${ROLE_LABELS[player.role]}, off court`
      : `${displayName(player)} — ${ROLE_LABELS[player.role]}, zone ${slot}`;
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
function describeRotation() {
  const label = `Rotation ${currentRotation} of ${rotationCount()}`;
  const { setsFrom } = SYSTEMS[saved.system];

  const onCourtSetters = saved.roster
    .map((player, index) => ({ player, slot: slotFor(index, currentRotation) }))
    .filter(({ player, slot }) => player.role === 'S' && slot !== null);

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
  saved.roster.push({ id: `P${Date.now()}`, role: 'OH', name: '', fallback: `Player ${n}` });
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

const rosterButton = document.getElementById('toggleRoster');
rosterButton.addEventListener('click', () => {
  const opening = rosterPanel.hidden;
  rosterPanel.hidden = !opening;
  rosterButton.setAttribute('aria-expanded', String(opening));
});

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
syncUndoButton();
rebuild();

// Write straight back after loading, so data saved by an older version gets
// upgraded on the spot instead of sitting in its old shape until the first
// edit. Without this a stale shape can survive indefinitely.
save();
