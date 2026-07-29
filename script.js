// 4-2 Rotation Reference
//
// Court slots use volleyball's numbering, with the net at the top:
//
//     4   3   2      front row
//     5   6   1      back row (1 serves)
//
// Players rotate clockwise: 2->1, 1->6, 6->5, 5->4, 4->3, 3->2.

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

// Our 4-2 lineup, in rotation order starting at slot 1. The two setters are
// three apart, which is what guarantees exactly one is front row every time.
const LINEUP = ['S1', 'MB1', 'OH1', 'S2', 'MB2', 'OH2'];

const ROLE_LABELS = { S: 'Setter', MB: 'Middle', OH: 'Outside' };

// --- State ------------------------------------------------------------

let currentRotation = 1; // 1 through 6
const playerElements = {}; // slot number -> the circle on screen

const court = document.getElementById('court');
const statusLine = document.getElementById('status');
const rotationButtons = document.getElementById('rotationButtons');

// --- Working out who stands where -------------------------------------

// In rotation 1 the lineup sits in slot order. Each rotation shifts everyone
// one step along, so slot N holds the lineup entry N-1 steps further on.
// The % 6 wraps us back to the start of the array when we run off the end.
function roleInSlot(slot, rotation) {
  return LINEUP[(slot - 1 + rotation - 1) % 6];
}

function isSetter(role) {
  return role.startsWith('S');
}

// --- Building the court once ------------------------------------------

function createPlayers() {
  for (let slot = 1; slot <= 6; slot++) {
    const el = document.createElement('div');
    el.className = 'player';
    el.innerHTML = '<span class="role"></span><span class="slot"></span>';
    el.addEventListener('pointerdown', startDrag);
    el.addEventListener('pointermove', onDrag);
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    court.appendChild(el);
    playerElements[slot] = el;
  }
}

function createRotationButtons() {
  for (let r = 1; r <= 6; r++) {
    const button = document.createElement('button');
    button.textContent = r;
    button.addEventListener('click', () => setRotation(r));
    rotationButtons.appendChild(button);
  }
}

// --- Drawing the current rotation -------------------------------------

function render() {
  for (let slot = 1; slot <= 6; slot++) {
    const role = roleInSlot(slot, currentRotation);
    const position = SLOT_POSITIONS[slot];
    const el = playerElements[slot];

    el.style.left = `${position.x}%`;
    el.style.top = `${position.y}%`;
    el.querySelector('.role').textContent = role;
    el.querySelector('.slot').textContent = slot;

    // Reset the highlight classes, then re-apply the one that fits.
    el.classList.remove('setter-front', 'setter-back');
    if (isSetter(role)) {
      const frontRow = FRONT_ROW_SLOTS.includes(slot);
      el.classList.add(frontRow ? 'setter-front' : 'setter-back');
    }

    const roleName = ROLE_LABELS[role.replace(/\d/, '')];
    el.title = `${roleName} — slot ${slot}`;
  }

  // Find the front-row setter so we can name them in the status line.
  const settingSlot = FRONT_ROW_SLOTS.find((slot) =>
    isSetter(roleInSlot(slot, currentRotation))
  );
  const setter = roleInSlot(settingSlot, currentRotation);
  statusLine.textContent =
    `Rotation ${currentRotation} — ${setter} sets from slot ${settingSlot}`;

  // Mark the active rotation button.
  [...rotationButtons.children].forEach((button, index) => {
    button.classList.toggle('active', index + 1 === currentRotation);
  });
}

function setRotation(rotation) {
  currentRotation = rotation;
  render();
}

// Wrap around at both ends: next from 6 goes to 1, prev from 1 goes to 6.
function step(delta) {
  setRotation(((currentRotation - 1 + delta + 6) % 6) + 1);
}

// --- Dragging ---------------------------------------------------------

let dragTarget = null;
let grabOffsetX = 0;
let grabOffsetY = 0;

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
  dragTarget.classList.remove('dragging');
  dragTarget = null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

// --- Start it up ------------------------------------------------------

createPlayers();
createRotationButtons();

document.getElementById('prev').addEventListener('click', () => step(-1));
document.getElementById('next').addEventListener('click', () => step(1));
document.getElementById('reset').addEventListener('click', render);

render();
