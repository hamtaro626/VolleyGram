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
const COURT_SPOTS = 6;

// The bench strip sits below the court. 112% is its middle -- see .bench in
// style.css, which draws it from 104% to 120%.
const BENCH_Y = 112;
const MAX_DRAG_Y = 120;
const MAX_PLAYERS = 12;
const HOLD_MS = 1500;
const HISTORY_LIMIT = 40;

const ROLE_LABELS = { S: 'Setter', MB: 'Middle', OH: 'Outside' };

// The 4-2: two setters exactly three apart in the cycle, so one is always
// front row. `fallback` is the name shown until you type a real one -- it's
// fixed at creation so it doesn't change when you reorder the lineup.
const DEFAULT_ROSTER = [
  { id: 'S1', role: 'S', name: '', fallback: 'Setter 1' },
  { id: 'MB1', role: 'MB', name: '', fallback: 'Middle 1' },
  { id: 'OH1', role: 'OH', name: '', fallback: 'Outside 1' },
  { id: 'S2', role: 'S', name: '', fallback: 'Setter 2' },
  { id: 'MB2', role: 'MB', name: '', fallback: 'Middle 2' },
  { id: 'OH2', role: 'OH', name: '', fallback: 'Outside 2' },
];

const STORAGE_KEY = 'volleyball-rotations-v1';

// --- State ------------------------------------------------------------

// Everything inside `saved` is yours -- it gets written to localStorage and
// reloaded next time. Everything outside it is throwaway.
let saved = {
  roster: structuredClone(DEFAULT_ROSTER),
  layouts: {},     // rotation -> { player id -> {x, y} }
  entrySlot: 1,    // the zone off-court players sub in at
  showLabels: true,
};

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
function pushHistory() {
  history.push(structuredClone(saved));
  if (history.length > HISTORY_LIMIT) history.shift();
  syncUndoButton();
}

function undo() {
  if (history.length === 0) return;

  const previous = history.pop();

  // Rebuilding throws away and recreates every circle, which kills the slide.
  // If only positions changed we can just redraw and keep the animation.
  const sameLineup =
    previous.roster.length === saved.roster.length &&
    previous.roster.every((player, index) =>
      player.id === saved.roster[index].id && player.role === saved.roster[index].role);

  saved = previous;
  if (currentRotation > rotationCount()) currentRotation = 1;
  save();

  if (sameLineup) {
    buildRosterRows();
    syncEntrySelect();
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch (error) {
    console.warn('Could not save:', error);
  }
}

function load() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    const parsed = JSON.parse(stored);

    let roster = parsed.roster;
    if (!Array.isArray(roster)) {
      // Saved by an older version, which kept names in a separate lookup.
      roster = structuredClone(DEFAULT_ROSTER).map((player) => ({
        ...player,
        name: (parsed.names && parsed.names[player.id]) || '',
      }));
    }

    // Older saves predate `fallback`, so fill it in from the role.
    roster = roster.map((player, index) => ({
      ...player,
      fallback: player.fallback || `${ROLE_LABELS[player.role] || 'Player'} ${index + 1}`,
    }));

    saved = {
      roster,
      layouts: parsed.layouts || {},
      entrySlot: TRAVEL_ORDER.includes(parsed.entrySlot) ? parsed.entrySlot : 1,
      showLabels: parsed.showLabels !== false,
    };
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
  syncEntrySelect();
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

  document.body.classList.toggle('hide-labels', !saved.showLabels);
}

// Name the setter who's front row. With a roster of exactly six that's always
// one person; add players and the guarantee goes away, so say so rather than
// making something up.
function describeRotation() {
  const label = `Rotation ${currentRotation} of ${rotationCount()}`;

  const setters = saved.roster.filter((player, index) => {
    const slot = slotFor(index, currentRotation);
    return player.role === 'S' && slot !== null && FRONT_ROW_SLOTS.includes(slot);
  });

  if (setters.length === 0) return `${label} — no setter front row`;
  return `${label} — ${setters.map(displayName).join(' & ')} front row`;
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
  saved.showLabels = !saved.showLabels;
  syncLabelsButton();
  save();
  render();
});

function syncLabelsButton() {
  labelsButton.textContent = `Labels: ${saved.showLabels ? 'on' : 'off'}`;
  labelsButton.setAttribute('aria-pressed', String(saved.showLabels));
}

// --- Start it up ------------------------------------------------------

load();
syncLabelsButton();
syncUndoButton();
rebuild();
