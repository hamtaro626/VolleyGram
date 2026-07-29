// Volleyball Rotation Reference
//
// Court slots use volleyball's numbering, with the net at the top:
//
//     4   3   2      front row
//     5   6   1      back row (1 serves)
//
// Players rotate clockwise: 2->1, 1->6, 6->5, 5->4, 4->3, 3->2.
//
// The circles on screen are *players*, not slots. Each one keeps its identity
// for the life of the page and moves to a new spot when you rotate, which is
// what lets the browser animate the trip.
//
// With more than six players the rotation becomes a ring: the first six spots
// on the ring are the court, everything past that is the bench. Rotating walks
// everyone one step around it, so the server rotates off and the next player
// comes back on at middle back -- which is how a rec team subs.

// --- The data ---------------------------------------------------------

// Where each slot sits on the court, as a percentage of the court's size.
// Percentages rather than pixels, so this works at any screen size.
const SLOT_POSITIONS = {
  4: { x: 22, y: 26 },
  3: { x: 50, y: 26 },
  2: { x: 78, y: 26 },
  5: { x: 22, y: 72 },
  6: { x: 50, y: 72 },
  1: { x: 78, y: 72 },
};

const FRONT_ROW_SLOTS = [2, 3, 4];
const COURT_SPOTS = 6;

// The bench strip sits below the court. 112% is its middle -- see .bench in
// style.css, which draws it from 104% to 120%.
const BENCH_Y = 112;
const MAX_DRAG_Y = 120;
const MAX_PLAYERS = 12;

const ROLE_LABELS = { S: 'Setter', MB: 'Middle', OH: 'Outside' };

// The 4-2: two setters exactly three apart, so one is always front row.
const DEFAULT_ROSTER = [
  { id: 'S1', role: 'S', name: '' },
  { id: 'MB1', role: 'MB', name: '' },
  { id: 'OH1', role: 'OH', name: '' },
  { id: 'S2', role: 'S', name: '' },
  { id: 'MB2', role: 'MB', name: '' },
  { id: 'OH2', role: 'OH', name: '' },
];

const STORAGE_KEY = 'volleyball-rotations-v1';

// --- State ------------------------------------------------------------

// Everything inside `saved` is yours -- it gets written to localStorage and
// reloaded next time. Everything outside it is throwaway.
let saved = {
  roster: structuredClone(DEFAULT_ROSTER),
  layouts: {},   // rotation -> { player id -> {x, y} }
  showLabels: true,
};

let currentRotation = 1;
const playerElements = {}; // player id -> the circle on screen

const court = document.getElementById('court');
const statusLine = document.getElementById('status');
const rotationButtons = document.getElementById('rotationButtons');
const rosterPanel = document.getElementById('roster');
const rosterRows = document.getElementById('rosterRows');

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

// Where this player sits on the ring: 0-5 are court slots 1-6, anything
// higher is a bench spot.
function ringPosition(playerIndex, rotation) {
  return mod(playerIndex - rotation + 1, rosterSize());
}

// The court slot this player is in, or null if they're off court.
function slotFor(playerIndex, rotation) {
  const ring = ringPosition(playerIndex, rotation);
  return ring < COURT_SPOTS ? ring + 1 : null;
}

function displayName(player, index) {
  return player.name || `${ROLE_LABELS[player.role]} ${index + 1}`;
}

// The untouched, straight-off-the-rulebook position for one player.
function defaultPosition(playerIndex, rotation) {
  const ring = ringPosition(playerIndex, rotation);
  if (ring < COURT_SPOTS) return { ...SLOT_POSITIONS[ring + 1] };

  // On the bench: spread everyone evenly along the strip.
  const benchIndex = ring - COURT_SPOTS;
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

    saved = {
      roster,
      layouts: parsed.layouts || {},
      showLabels: parsed.showLabels !== false,
    };
  } catch (error) {
    console.warn('Could not load saved data, starting fresh:', error);
  }
}

// --- Building the page ------------------------------------------------

// Rebuilt from scratch whenever the roster changes, since the number of
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
    nameInput.placeholder = displayName(player, index);
    nameInput.maxLength = 14;
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
      player.role = roleSelect.value;
      swatch.className = `swatch role-${player.role}`;
      playerElements[player.id].className = `player role-${player.role}`;
      save();
      render();
    });

    row.append(swatch, nameInput, roleSelect);

    // Only the extras can be removed -- the first six are the rotation.
    if (index >= COURT_SPOTS) {
      const remove = document.createElement('button');
      remove.className = 'remove';
      remove.textContent = '×';
      remove.title = `Remove ${displayName(player, index)}`;
      remove.addEventListener('click', () => changeRoster(() => {
        saved.roster.splice(index, 1);
      }));
      row.append(remove);
    } else {
      row.append(document.createElement('span'));
    }

    rosterRows.appendChild(row);
  });

  document.getElementById('addPlayer').disabled = rosterSize() >= MAX_PLAYERS;
}

// Adding or removing anyone reshuffles who stands where in every rotation, so
// any positions you dragged no longer mean what they meant. Rather than leave
// players scattered at coordinates from the old lineup, start clean.
function changeRoster(mutate) {
  const hasCustomLayouts = Object.keys(saved.layouts).length > 0;
  if (hasCustomLayouts &&
      !confirm('Changing the roster resets all rotations to their default positions. Continue?')) {
    return;
  }

  mutate();
  saved.layouts = {};
  if (currentRotation > rotationCount()) currentRotation = 1;

  save();
  rebuild();
}

function rebuild() {
  // Drop the animation first, or the rebuilt circles slide in from the corner.
  court.classList.remove('animate');
  buildPlayers();
  buildRotationButtons();
  buildRosterRows();
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

    el.querySelector('.name').textContent = displayName(player, index);
    el.querySelector('.label').textContent = ROLE_LABELS[player.role];
    el.title = slot === null
      ? `${displayName(player, index)} — ${ROLE_LABELS[player.role]}, off court`
      : `${displayName(player, index)} — ${ROLE_LABELS[player.role]}, slot ${slot}`;
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

  const names = setters.map((player) => displayName(player, saved.roster.indexOf(player)));
  return `${label} — ${names.join(' & ')} front row`;
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

document.getElementById('reset').addEventListener('click', () => {
  saved.layouts[currentRotation] = defaultLayout(currentRotation);
  save();
  render();
});

document.getElementById('resetAll').addEventListener('click', () => {
  saved.layouts = {};
  save();
  render();
});

document.getElementById('addPlayer').addEventListener('click', () => changeRoster(() => {
  saved.roster.push({ id: `P${Date.now()}`, role: 'OH', name: '' });
}));

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
rebuild();
