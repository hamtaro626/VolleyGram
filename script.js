// 4-2 Rotation Reference
//
// Court slots use volleyball's numbering, with the net at the top:
//
//     4   3   2      front row
//     5   6   1      back row (1 serves)
//
// Players rotate clockwise: 2->1, 1->6, 6->5, 5->4, 4->3, 3->2.
//
// Note that the six circles on screen are *players*, not slots. Each one keeps
// its identity for the life of the page and moves to a new spot when you
// rotate, which is what lets the browser animate the trip.

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

// The roster, listed in rotation order: this is who stands in slots 1 through 6
// when we're in rotation 1. The two setters are three apart, which is what
// guarantees exactly one is front row in every rotation.
const ROSTER = [
  { id: 'S1', role: 'S', defaultName: 'Setter 1' },
  { id: 'MB1', role: 'MB', defaultName: 'Middle 1' },
  { id: 'OH1', role: 'OH', defaultName: 'Outside 1' },
  { id: 'S2', role: 'S', defaultName: 'Setter 2' },
  { id: 'MB2', role: 'MB', defaultName: 'Middle 2' },
  { id: 'OH2', role: 'OH', defaultName: 'Outside 2' },
];

const ROLE_LABELS = { S: 'Setter', MB: 'Middle', OH: 'Outside' };

const STORAGE_KEY = 'volleyball-rotations-v1';

// --- State ------------------------------------------------------------

// Everything the app knows lives here. Anything inside `saved` is yours -- it
// gets written to localStorage and reloaded next time. Everything outside it
// is throwaway.
let saved = {
  names: {},     // player id -> the name you typed
  layouts: {},   // rotation -> { player id -> {x, y} }
  showLabels: true,
};

let currentRotation = 1;
const playerElements = {}; // player id -> the circle on screen

const court = document.getElementById('court');
const statusLine = document.getElementById('status');
const rotationButtons = document.getElementById('rotationButtons');
const rosterPanel = document.getElementById('roster');

// --- Working out who stands where -------------------------------------

// JavaScript's % returns a negative result for negative input, which breaks
// wrap-around maths. This always lands in 0..m-1.
function mod(n, m) {
  return ((n % m) + m) % m;
}

// Which slot is this player standing in, for a given rotation? In rotation 1
// the roster sits in slot order; every rotation after that shifts everyone one
// slot backwards through the list.
function slotFor(playerIndex, rotation) {
  return mod(playerIndex - rotation + 1, 6) + 1;
}

function nameOf(player) {
  return saved.names[player.id] || player.defaultName;
}

// The untouched, straight-off-the-rulebook positions for one rotation.
function defaultLayout(rotation) {
  const layout = {};
  ROSTER.forEach((player, index) => {
    layout[player.id] = { ...SLOT_POSITIONS[slotFor(index, rotation)] };
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
    saved = {
      names: parsed.names || {},
      layouts: parsed.layouts || {},
      showLabels: parsed.showLabels !== false,
    };
  } catch (error) {
    console.warn('Could not load saved data, starting fresh:', error);
  }
}

// --- Building the page once -------------------------------------------

function createPlayers() {
  ROSTER.forEach((player) => {
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

function createRotationButtons() {
  for (let r = 1; r <= 6; r++) {
    const button = document.createElement('button');
    button.textContent = r;
    button.addEventListener('click', () => setRotation(r));
    rotationButtons.appendChild(button);
  }
}

function createRosterFields() {
  ROSTER.forEach((player) => {
    const row = document.createElement('label');
    row.className = 'roster-row';

    const swatch = document.createElement('span');
    swatch.className = `swatch role-${player.role}`;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = nameOf(player);
    input.placeholder = player.defaultName;
    input.maxLength = 14;
    input.addEventListener('input', () => {
      saved.names[player.id] = input.value.trim();
      save();
      render();
    });

    const role = document.createElement('span');
    role.className = 'roster-role';
    role.textContent = ROLE_LABELS[player.role];

    row.append(swatch, input, role);
    rosterPanel.insertBefore(row, rosterPanel.firstChild);
  });
}

// --- Drawing the current rotation -------------------------------------

function render() {
  const layout = layoutFor(currentRotation);

  ROSTER.forEach((player, index) => {
    const el = playerElements[player.id];
    const position = layout[player.id];
    const slot = slotFor(index, currentRotation);

    // Setting left/top is all it takes to move a player. The CSS transition
    // handles the actual sliding.
    el.style.left = `${position.x}%`;
    el.style.top = `${position.y}%`;

    el.querySelector('.name').textContent = nameOf(player);
    el.querySelector('.label').textContent = ROLE_LABELS[player.role];
    el.title = `${nameOf(player)} — ${ROLE_LABELS[player.role]}, slot ${slot}`;
  });

  // Name the setter who's front row -- the thing you're checking for.
  const settingIndex = ROSTER.findIndex(
    (player, index) =>
      player.role === 'S' && FRONT_ROW_SLOTS.includes(slotFor(index, currentRotation))
  );
  const settingSlot = slotFor(settingIndex, currentRotation);
  statusLine.textContent =
    `Rotation ${currentRotation} — ${nameOf(ROSTER[settingIndex])} sets from slot ${settingSlot}`;

  [...rotationButtons.children].forEach((button, index) => {
    button.classList.toggle('active', index + 1 === currentRotation);
  });

  document.body.classList.toggle('hide-labels', !saved.showLabels);
}

function setRotation(rotation) {
  currentRotation = rotation;
  render();
}

// Wrap around at both ends: next from 6 goes to 1, prev from 1 goes to 6.
function step(delta) {
  setRotation(mod(currentRotation - 1 + delta, 6) + 1);
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

  dragTarget.style.left = `${clamp(x, 0, 100)}%`;
  dragTarget.style.top = `${clamp(y, 0, 100)}%`;
}

function endDrag() {
  if (!dragTarget) return;

  // Write where they ended up into this rotation only. The other five are
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

const rosterButton = document.getElementById('toggleRoster');
rosterButton.addEventListener('click', () => {
  const opening = rosterPanel.hidden;
  rosterPanel.hidden = !opening;
  rosterButton.setAttribute('aria-expanded', String(opening));
});

const labelsButton = document.getElementById('toggleLabels');
labelsButton.addEventListener('click', () => {
  saved.showLabels = !saved.showLabels;
  labelsButton.textContent = `Labels: ${saved.showLabels ? 'on' : 'off'}`;
  labelsButton.setAttribute('aria-pressed', String(saved.showLabels));
  save();
  render();
});

// --- Start it up ------------------------------------------------------

load();
createPlayers();
createRotationButtons();
createRosterFields();

labelsButton.textContent = `Labels: ${saved.showLabels ? 'on' : 'off'}`;
labelsButton.setAttribute('aria-pressed', String(saved.showLabels));

render();

// Turn sliding on only after the first paint, so players appear in place
// rather than flying in from the corner on load.
requestAnimationFrame(() => court.classList.add('animate'));
