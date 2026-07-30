// Boots the real script.js in Node against a stubbed DOM, so the migration is
// tested as written rather than as re-implemented here.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const SCRIPT = path.join(__dirname, '..', 'script.js');

function stubElement(tag = 'div') {
  const el = {
    tagName: tag,
    children: [],
    style: {},
    dataset: {},
    textContent: '',
    innerHTML: '',
    value: '',
    title: '',
    disabled: false,
    hidden: true,
    selected: false,
    maxLength: 0,
    placeholder: '',
    type: '',
    className: '',
    classList: {
      s: new Set(),
      add(...c) { c.forEach((x) => this.s.add(x)); },
      remove(...c) { c.forEach((x) => this.s.delete(x)); },
      contains(c) { return this.s.has(c); },
      toggle(c, on) {
        const want = on === undefined ? !this.s.has(c) : on;
        want ? this.s.add(c) : this.s.delete(c);
        return want;
      },
    },
    addEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    append(...cs) { cs.forEach((c) => this.children.push(c)); },
    replaceChildren(...cs) { this.children = cs; },
    insertBefore(node, ref) {
      const existing = this.children.indexOf(node);
      if (existing !== -1) this.children.splice(existing, 1);
      const at = ref ? this.children.indexOf(ref) : -1;
      if (at === -1) this.children.push(node);
      else this.children.splice(at, 0, node);
      return node;
    },
    remove() {},
    setAttribute() {},
    setPointerCapture() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 300, height: 300 }; },
    querySelector() { return stubElement('span'); },
    closest() { return null; },
  };
  return el;
}

function boot(seedJson) {
  const memory = {};
  if (seedJson !== undefined) memory['volleyball-rotations-v1'] = seedJson;

  const byId = {};
  const document = {
    body: stubElement('body'),
    getElementById(id) {
      if (!byId[id]) byId[id] = stubElement();
      return byId[id];
    },
    createElement: (tag) => stubElement(tag),
    addEventListener() {},
  };

  const warnings = [];
  const context = {
    document,
    structuredClone,
    localStorage: {
      getItem: (k) => (k in memory ? memory[k] : null),
      setItem: (k, v) => { memory[k] = String(v); },
    },
    console: { warn: (...a) => warnings.push(a.join(' ')), log: () => {} },
    requestAnimationFrame: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    prompt: () => 'Prompted name',
    confirm: () => true,
  };

  const source = fs.readFileSync(SCRIPT, 'utf8');
  // Appended in the same lexical scope, so it can reach the module's `let`s.
  const expose = `
    globalThis.__peek = () => ({ store, saved, currentRotation, currentFormation });
    globalThis.__call = { load, render, rebuild, useLineup, addLineup,
      duplicateLineup, deleteLineup, normaliseLineup, slotFor, rosterSize,
      describeRotation, setRotation, roleFor, hasRoleOverride, overrideCount,
      buildRosterRows, benchPosition, rotationCount, applyRosterOrder,
      movePlayer, positionsFor, defaultLayout, setFormation, settingPlayer,
      startQuiz, endQuiz, nextQuizQuestion, answerQuiz, undo, pushHistory,
      settersThisRotation };
    globalThis.__stacks = () => ({ undos: history.length });
    globalThis.__quiz = () => ({ quiz, quizScore });
    globalThis.__const = { ZONE_LABEL_POSITIONS, SERVE_SLOT, SLOT_POSITIONS,
      COURT_SPOTS, FORMATIONS, DEFENSE_SPOTS, SETTER_TARGET, FRONT_ROW_SLOTS,
      BACK_ROW_SLOTS, BACK_PASS_SPOTS, BACK_COVER_SPOTS, FRONT_PASS_SPOTS,
      NET_SPOTS, ZONE_REGIONS };
    globalThis.__status = () => document.getElementById('status').textContent;
  `;
  vm.runInNewContext(source + expose, context, { filename: 'script.js' });
  return { ...context, memory, warnings, peek: context.__peek, call: context.__call,
           consts: context.__const, status: context.__status, quiz: context.__quiz,
           stacks: context.__stacks };
}

let failures = 0;
function check(label, condition, detail) {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`);
  }
}

// ---------------------------------------------------------------------------

console.log('\n1. Fresh install, nothing in storage');
{
  const app = boot(undefined);
  const { store, saved } = app.peek();
  check('one lineup exists', Object.keys(store.lineups).length === 1);
  check('named "My team"', saved.name === 'My team', saved.name);
  check('defaults to 4-2', saved.system === '4-2', saved.system);
  check('six players', saved.roster.length === 6, String(saved.roster.length));
  check('subs enter at zone 1', saved.entrySlot === 1, String(saved.entrySlot));
  check('version stamped', store.version === 2, String(store.version));
}

console.log('\n2. v0.2 save — names in a side lookup, no roster array');
{
  const app = boot(JSON.stringify({
    names: { S1: 'Alec', MB1: 'Jordan' },
    layouts: { 1: { S1: { x: 10, y: 20 } } },
    showLabels: false,
  }));
  const { store, saved } = app.peek();
  check('wrapped into one lineup', Object.keys(store.lineups).length === 1);
  check('S1 name survived', saved.roster[0].name === 'Alec', saved.roster[0].name);
  check('MB1 name survived', saved.roster[1].name === 'Jordan', saved.roster[1].name);
  check('layout survived, now under base', saved.layouts.base['1'].S1.x === 10);
  check('showLabels moved to top level', store.showLabels === false);
  check('no warnings', app.warnings.length === 0, app.warnings.join('; '));
}

console.log('\n3. v0.3 / v0.4 save — roster array plus entrySlot');
{
  const roster = [
    { id: 'S1', role: 'S', name: 'Alec' },
    { id: 'MB1', role: 'MB', name: '' },
    { id: 'OH1', role: 'OH', name: 'Sam' },
    { id: 'S2', role: 'S', name: '' },
    { id: 'MB2', role: 'MB', name: '' },
    { id: 'OH2', role: 'OH', name: '' },
    { id: 'P7', role: 'OH', name: 'Bench Bob' },
  ];
  const app = boot(JSON.stringify({ roster, layouts: {}, entrySlot: 6, showLabels: true }));
  const { saved } = app.peek();
  check('seven players kept', saved.roster.length === 7, String(saved.roster.length));
  check('entrySlot 6 preserved', saved.entrySlot === 6, String(saved.entrySlot));
  check('bench player name kept', saved.roster[6].name === 'Bench Bob');
  check('fallback derived for pre-v0.4 rows', saved.roster[0].fallback === 'Setter 1',
    saved.roster[0].fallback);
  check('system defaulted', saved.system === '4-2', saved.system);
}

console.log('\n4. v0.5 save — includes system');
{
  const app = boot(JSON.stringify({
    system: '5-1',
    roster: [
      { id: 'S1', role: 'S', name: 'Alec', fallback: 'Setter' },
      { id: 'MB1', role: 'MB', name: '', fallback: 'Middle 1' },
      { id: 'OH1', role: 'OH', name: '', fallback: 'Outside 1' },
      { id: 'OPP1', role: 'OPP', name: 'Rae', fallback: 'Opposite' },
      { id: 'MB2', role: 'MB', name: '', fallback: 'Middle 2' },
      { id: 'OH2', role: 'OH', name: '', fallback: 'Outside 2' },
    ],
    layouts: {}, entrySlot: 1, showLabels: true,
  }));
  const { saved } = app.peek();
  check('5-1 preserved', saved.system === '5-1', saved.system);
  check('Opposite role preserved', saved.roster[3].role === 'OPP', saved.roster[3].role);
  check('opposite name preserved', saved.roster[3].name === 'Rae');
}

console.log('\n5. v2 save — round-trips unchanged, and startup rewrites the upgrade');
{
  const first = boot(undefined);
  const written = first.memory['volleyball-rotations-v1'];
  check('startup persisted the store', typeof written === 'string' && written.length > 0);

  if (typeof written === 'string') {
    check('stamped as version 2', JSON.parse(written).version === 2);
    const second = boot(written);
    const a = JSON.parse(written);
    const b = JSON.parse(second.memory['volleyball-rotations-v1']);
    check('load(save(x)) === x', JSON.stringify(a) === JSON.stringify(b));
  }

  // An old-shape blob must be upgraded in storage without being touched.
  const legacy = boot(JSON.stringify({ names: { S1: 'Alec' }, layouts: {} }));
  const upgraded = JSON.parse(legacy.memory['volleyball-rotations-v1']);
  check('legacy blob upgraded in place', upgraded.version === 2);
  check('legacy name survived the rewrite',
    upgraded.lineups[upgraded.activeId].roster[0].name === 'Alec');
}

console.log('\n6. Multiple lineups persist and stay independent');
{
  const seed = {
    version: 2,
    activeId: 'b',
    showLabels: true,
    lineups: {
      a: { name: 'Tuesday league', system: '4-2', entrySlot: 1, layouts: {},
           roster: [
             { id: 'S1', role: 'S', name: 'A1', fallback: 'Setter 1' },
             { id: 'MB1', role: 'MB', name: '', fallback: 'Middle 1' },
             { id: 'OH1', role: 'OH', name: '', fallback: 'Outside 1' },
             { id: 'S2', role: 'S', name: '', fallback: 'Setter 2' },
             { id: 'MB2', role: 'MB', name: '', fallback: 'Middle 2' },
             { id: 'OH2', role: 'OH', name: '', fallback: 'Outside 2' }] },
      b: { name: 'JV', system: '6-2', entrySlot: 5, layouts: { 2: { S1: { x: 5, y: 5 } } },
           roster: [
             { id: 'S1', role: 'S', name: 'B1', fallback: 'Setter 1' },
             { id: 'MB1', role: 'MB', name: '', fallback: 'Middle 1' },
             { id: 'OH1', role: 'OH', name: '', fallback: 'Outside 1' },
             { id: 'S2', role: 'S', name: '', fallback: 'Setter 2' },
             { id: 'MB2', role: 'MB', name: '', fallback: 'Middle 2' },
             { id: 'OH2', role: 'OH', name: '', fallback: 'Outside 2' }] },
    },
  };
  const app = boot(JSON.stringify(seed));
  const { store, saved } = app.peek();
  check('both lineups loaded', Object.keys(store.lineups).length === 2);
  check('active one respected', saved.name === 'JV', saved.name);
  check('active system is 6-2', saved.system === '6-2', saved.system);
  check('active entrySlot is 5', saved.entrySlot === 5, String(saved.entrySlot));
  check('other lineup untouched', store.lineups.a.name === 'Tuesday league');
  check('other lineup keeps its own system', store.lineups.a.system === '4-2');
}

console.log('\n7. activeId pointing at a lineup that no longer exists');
{
  const app = boot(JSON.stringify({
    version: 2, activeId: 'ghost', showLabels: true,
    lineups: { real: { name: 'Real', system: '4-2', entrySlot: 1, layouts: {},
      roster: [
        { id: 'S1', role: 'S', name: '', fallback: 'Setter 1' },
        { id: 'MB1', role: 'MB', name: '', fallback: 'Middle 1' },
        { id: 'OH1', role: 'OH', name: '', fallback: 'Outside 1' },
        { id: 'S2', role: 'S', name: '', fallback: 'Setter 2' },
        { id: 'MB2', role: 'MB', name: '', fallback: 'Middle 2' },
        { id: 'OH2', role: 'OH', name: '', fallback: 'Outside 2' }] } },
  }));
  const { store, saved } = app.peek();
  check('falls back to a real lineup', saved.name === 'Real', saved.name);
  check('activeId corrected', store.activeId === 'real', store.activeId);
}

console.log('\n8. Corrupt and hostile data');
{
  const cases = [
    ['not JSON at all', '{{{not json'],
    ['null', 'null'],
    ['an array', '[1,2,3]'],
    ['empty lineups map', JSON.stringify({ version: 2, activeId: 'x', lineups: {} })],
    ['roster of 3', JSON.stringify({ roster: [
      { id: 'S1', role: 'S', name: 'keep me' },
      { id: 'MB1', role: 'MB', name: '' },
      { id: 'OH1', role: 'OH', name: '' }] })],
    ['bogus role', JSON.stringify({ roster: Array.from({ length: 6 }, (_, i) =>
      ({ id: 'P' + i, role: 'WIZARD', name: '' })) })],
    ['bogus system', JSON.stringify({ system: 'sportsball', roster: null })],
    ['bogus entrySlot', JSON.stringify({ entrySlot: 99, roster: null })],
    ['layouts as a string', JSON.stringify({ layouts: 'nope', roster: null })],
  ];
  for (const [label, json] of cases) {
    let ok = true, detail = '';
    try {
      const app = boot(json);
      const { store, saved } = app.peek();
      if (!saved || saved.roster.length < 6) { ok = false; detail = 'roster too small'; }
      if (!SystemsOk(saved)) { ok = false; detail = 'bad system ' + saved.system; }
      if (![1, 2, 3, 4, 5, 6].includes(saved.entrySlot)) { ok = false; detail = 'bad entrySlot'; }
      if (typeof saved.layouts !== 'object') { ok = false; detail = 'bad layouts'; }
      if (Object.keys(store.lineups).length < 1) { ok = false; detail = 'no lineups'; }
      // Rendering must not throw either.
      app.call.render();
    } catch (error) {
      ok = false; detail = error.message;
    }
    check(`survives ${label}`, ok, detail);
  }
  function SystemsOk(s) { return ['4-2', '5-1', '6-2'].includes(s.system); }
}

console.log('\n9. Data preserved where it can be, dropped only where it cannot');
{
  const app = boot(JSON.stringify({ roster: [
    { id: 'S1', role: 'S', name: 'keep me' },
    { id: 'MB1', role: 'MB', name: '' },
    { id: 'OH1', role: 'OH', name: '' }] }));
  const { saved } = app.peek();
  check('unrecoverable roster is rebuilt to six', saved.roster.length === 6);
  check('rebuilt roster is a valid 4-2',
    saved.roster.map((p) => p.role).join(',') === 'S,MB,OH,S,MB,OH',
    saved.roster.map((p) => p.role).join(','));
}

console.log('\n10. The app actually works after migrating');
{
  const app = boot(JSON.stringify({ system: '6-2', roster: null, entrySlot: 1 }));
  const zones = new Set();
  for (let r = 1; r <= 6; r++) {
    app.call.setRotation(r);
    for (let i = 0; i < 6; i++) zones.add(app.call.slotFor(i, r));
    if (!app.status().includes('sets')) {
      check('status line names a setter in rotation ' + r, false, app.status());
    }
  }
  check('all six zones reachable', zones.size === 6 && !zones.has(null));
  check('status line reads sensibly', /Rotation 6 of 6 .* sets/.test(app.status()), app.status());
}

console.log('\n11. Simple mode — no roles assigned');
{
  const app = boot(JSON.stringify({ system: 'simple', roster: null, entrySlot: 1 }));
  const { saved } = app.peek();
  check('system is simple', saved.system === 'simple', saved.system);
  check('every role unset', saved.roster.every((p) => p.role === 'NONE'),
    saved.roster.map((p) => p.role).join(','));
  check('players numbered, not called "No role"',
    saved.roster[0].fallback === 'Player 1', saved.roster[0].fallback);
  app.call.setRotation(3);
  check('status line stays quiet about setters',
    app.status() === 'Base \u00b7 Rotation 3 of 6', app.status());
  const zones = new Set();
  for (let i = 0; i < 6; i++) zones.add(app.call.slotFor(i, 3));
  check('rotation still works', zones.size === 6 && !zones.has(null));
}

console.log('\n12. Unknown role downgrades to unset, not to a guessed position');
{
  const app = boot(JSON.stringify({ roster: Array.from({ length: 6 }, (_, i) =>
    ({ id: 'P' + i, role: 'WIZARD', name: 'Keep ' + i })) }));
  const { saved } = app.peek();
  check('roles became NONE', saved.roster.every((p) => p.role === 'NONE'),
    saved.roster.map((p) => p.role).join(','));
  check('names still preserved', saved.roster[0].name === 'Keep 0', saved.roster[0].name);
}

console.log('\n13. Per-rotation roles');
{
  // Old saves have no roleOverrides field at all.
  const legacy = boot(JSON.stringify({ system: '4-2', roster: null }));
  check('roleOverrides defaults to empty',
    JSON.stringify(legacy.peek().saved.roleOverrides) === '{}');
  check('no overrides counted', legacy.call.overrideCount() === 0);

  const app = boot(JSON.stringify({ system: '4-2', roster: null, entrySlot: 1 }));
  const { saved } = app.peek();
  const players = saved.roster;

  // Rotation 1 of a 4-2 at entry zone 1: row 3 is the front-row setter.
  app.call.setRotation(1);
  const baseline = app.status();
  check('a setter is named with no overrides', /sets/.test(baseline), baseline);

  // Demote that setter to an outside hitter, for rotation 1 only.
  saved.roleOverrides['1'] = { [players[3].id]: 'OH' };

  check('roleFor honours the override',
    app.call.roleFor(players[3], 1) === 'OH', app.call.roleFor(players[3], 1));
  check('base role untouched', players[3].role === 'S', players[3].role);
  check('other rotations unaffected',
    app.call.roleFor(players[3], 2) === 'S', app.call.roleFor(players[3], 2));
  check('override is detectable', app.call.hasRoleOverride(players[3], 1) === true);
  check('override counted once', app.call.overrideCount() === 1);

  app.call.setRotation(1);
  check('status line notices the setter is gone',
    /no setter/.test(app.status()), app.status());

  app.call.setRotation(2);
  check('rotation 2 still names its setter', /sets/.test(app.status()), app.status());

  // Promoting a stand-in only helps if they're front row -- a 4-2 sets from
  // there. Row 0 is in zone 1 (back row) in rotation 1, so promoting them
  // should change nothing.
  saved.roleOverrides['1'][players[0].id] = 'S';
  app.call.setRotation(1);
  check('a back-row stand-in does not become the setter',
    /no setter/.test(app.status()), app.status());

  // Row 2 is in zone 3 (middle front), so that one should take over.
  delete saved.roleOverrides['1'][players[0].id];
  saved.roleOverrides['1'][players[2].id] = 'S';
  app.call.setRotation(1);
  check('a front-row stand-in does become the setter',
    app.status().includes(displayNameOf(players[2])) && /sets/.test(app.status()),
    app.status());
  check('two overrides counted', app.call.overrideCount() === 2);

  function displayNameOf(player) { return player.name || player.fallback; }

  // Rendering with overrides in place must not throw.
  let rendered = true;
  try { app.call.render(); } catch (e) { rendered = false; }
  check('renders with overrides applied', rendered);
}

console.log('\n14. Overrides survive a save/load round trip');
{
  const app = boot(JSON.stringify({
    version: 2, activeId: 'a', showLabels: true, roleScope: 'rotation',
    lineups: { a: { name: 'T', system: '4-2', entrySlot: 1, layouts: {},
      roleOverrides: { 3: { S1: 'MB' } },
      roster: [
        { id: 'S1', role: 'S', name: '', fallback: 'Setter 1' },
        { id: 'MB1', role: 'MB', name: '', fallback: 'Middle 1' },
        { id: 'OH1', role: 'OH', name: '', fallback: 'Outside 1' },
        { id: 'S2', role: 'S', name: '', fallback: 'Setter 2' },
        { id: 'MB2', role: 'MB', name: '', fallback: 'Middle 2' },
        { id: 'OH2', role: 'OH', name: '', fallback: 'Outside 2' }] } },
  }));
  const { store, saved } = app.peek();
  check('override loaded', saved.roleOverrides['3'].S1 === 'MB');
  check('roleScope preference loaded', store.roleScope === 'rotation', store.roleScope);
  check('applied by roleFor', app.call.roleFor(saved.roster[0], 3) === 'MB');

  const written = JSON.parse(app.memory['volleyball-rotations-v1']);
  check('override persisted on rewrite',
    written.lineups.a.roleOverrides['3'].S1 === 'MB');
  check('roleScope persisted', written.roleScope === 'rotation');
}

console.log('\n15. Zone numbers');
{
  const app = boot(undefined);
  const { ZONE_LABEL_POSITIONS, SLOT_POSITIONS } = app.consts;
  const zones = Object.keys(ZONE_LABEL_POSITIONS).map(Number).sort((a, b) => a - b);
  check('all six zones labelled', zones.join(',') === '1,2,3,4,5,6', zones.join(','));

  // A label sitting under a player circle would be invisible. Circles are 23%
  // wide, so radius is 11.5% of the court.
  let clear = true;
  for (const [zone, label] of Object.entries(ZONE_LABEL_POSITIONS)) {
    for (const spot of Object.values(SLOT_POSITIONS)) {
      const distance = Math.hypot(label.x - spot.x, label.y - spot.y);
      if (distance < 11.5) { clear = false; console.log(`      zone ${zone} label is ${distance.toFixed(1)}% from a player spot`); }
    }
  }
  check('no label sits under a player circle', clear);

  // Each label should be in the same half of the court as its zone.
  const front = [2, 3, 4];
  let sided = true;
  for (const [zone, label] of Object.entries(ZONE_LABEL_POSITIONS)) {
    const isFront = front.includes(Number(zone));
    if (isFront !== (label.y < 33.33)) { sided = false; }
  }
  check('front-row labels above the attack line, back-row below', sided);

  // Back row belongs down in its own zone, not crowded against the attack line.
  // That region runs 33.33% to 100%, so a label should be past its midpoint.
  check('back-row labels sit low in their zone',
    [1, 5, 6].every((z) => ZONE_LABEL_POSITIONS[z].y > 66.7),
    [1, 5, 6].map((z) => `${z}@${ZONE_LABEL_POSITIONS[z].y}`).join(' '));

  check('front-row labels sit high in their zone',
    [2, 3, 4].every((z) => ZONE_LABEL_POSITIONS[z].y < 16.7),
    [2, 3, 4].map((z) => `${z}@${ZONE_LABEL_POSITIONS[z].y}`).join(' '));

  // Shared heights per row, so the six read as a grid rather than scattered.
  check('each row of labels shares one height',
    new Set([1, 5, 6].map((z) => ZONE_LABEL_POSITIONS[z].y)).size === 1 &&
    new Set([2, 3, 4].map((z) => ZONE_LABEL_POSITIONS[z].y)).size === 1);
}

console.log('\n16. Serve indicator');
{
  for (const size of [6, 7, 9]) {
    const app = boot(JSON.stringify({
      system: '4-2', entrySlot: 1, roster: null,
    }));
    const { saved } = app.peek();
    while (saved.roster.length < size) {
      saved.roster.push({ id: 'X' + saved.roster.length, role: 'NONE', name: '', fallback: 'X' });
    }
    const { SERVE_SLOT } = app.consts;
    let ok = true;
    for (let r = 1; r <= app.call.rotationCount(); r++) {
      const serving = saved.roster.filter((_, i) => app.call.slotFor(i, r) === SERVE_SLOT);
      if (serving.length !== 1) { ok = false; }
    }
    check(`exactly one server per rotation with ${size} players`, ok);
  }
}

console.log('\n17. Reading other rotations must not write to storage');
{
  const app = boot(JSON.stringify({ system: '4-2', roster: null, entrySlot: 1 }));
  const { saved } = app.peek();
  const { FORMATIONS } = app.consts;

  // What the batch export does: read every rotation of every formation without
  // ever opening them.
  for (const formation of FORMATIONS) {
    for (let r = 1; r <= app.call.rotationCount(); r++) {
      app.call.positionsFor(formation, r);
      app.call.defaultLayout(formation, r);
    }
  }

  const written = FORMATIONS.filter((f) => Object.keys(saved.layouts[f]).length > 0);
  check('no layouts created by reading', written.length === 0, written.join(', '));
}

console.log('\n18. describeRotation describes the rotation it is asked about');
{
  const app = boot(JSON.stringify({ system: '4-2', roster: null, entrySlot: 1 }));
  app.call.setRotation(1);
  const asked = app.call.describeRotation(4);
  check('names the requested rotation', asked.startsWith('Rotation 4 of 6'), asked);
  check('current rotation unchanged', app.peek().currentRotation === 1,
    String(app.peek().currentRotation));
  check('status line still shows rotation 1',
    app.status().startsWith('Base \u00b7 Rotation 1 of 6'), app.status());
}

console.log('\n19. Reordering the roster by drag');
{
  const ids = (app) => app.peek().saved.roster.map((p) => p.id).join(',');

  const app = boot(JSON.stringify({ system: '4-2', roster: null, entrySlot: 1 }));
  const before = ids(app);
  check('starts in lineup order', before === 'S1,MB1,OH1,S2,MB2,OH2', before);

  // Move the last player to the front, as a drag to the top would.
  check('a real move reports true',
    app.call.applyRosterOrder(['OH2', 'S1', 'MB1', 'OH1', 'S2', 'MB2']) === true);
  check('roster follows the new order',
    ids(app) === 'OH2,S1,MB1,OH1,S2,MB2', ids(app));

  // Dropping a row back where it started shouldn't count as a change.
  const undosBefore = app.peek().store && null;
  void undosBefore;
  check('a no-op move reports false',
    app.call.applyRosterOrder(['OH2', 'S1', 'MB1', 'OH1', 'S2', 'MB2']) === false);

  // A malformed order must never lose a player.
  app.call.applyRosterOrder(['MB1', 'S1']);
  const after = ids(app).split(',');
  check('no player is dropped by a partial order', after.length === 6, after.join(','));
  check('named players come first, the rest keep their order',
    after[0] === 'MB1' && after[1] === 'S1', after.join(','));

  // Reordering still produces a valid rotation.
  const zones = new Set();
  for (let i = 0; i < 6; i++) zones.add(app.call.slotFor(i, 1));
  check('rotation still fills six zones', zones.size === 6 && !zones.has(null));
}

console.log('\n20. Source files are plain text');
{
  // A stray NUL byte makes a file binary to grep, git diff and editor search.
  const files = ['script.js', 'style.css', 'index.html', 'test/migration.js'];
  const dirty = files.filter((f) =>
    fs.readFileSync(path.join(__dirname, '..', f)).includes(0));
  check('no NUL bytes in source', dirty.length === 0, dirty.join(', '));
}


// --- Formation helpers ------------------------------------------------------

// Everyone standing on the court for a formation, as {id, role, slot, pos}.
function onCourt(app, formation, rotation) {
  const { saved } = app.peek();
  const layout = app.call.positionsFor(formation, rotation);
  return saved.roster
    .map((player, i) => ({
      id: player.id,
      role: app.call.roleFor(player, rotation),
      slot: app.call.slotFor(i, rotation),
      pos: layout[player.id],
    }))
    .filter((entry) => entry.slot !== null);
}

const at = (pos, spot) => pos && Math.abs(pos.x - spot.x) < 0.01 && Math.abs(pos.y - spot.y) < 0.01;
const matchesAny = (pos, spots) => spots.some((spot) => at(pos, spot));

console.log('\n21. Layouts migrate into formations');
{
  // Pre-v0.11: layouts keyed by rotation number, all of them base positions.
  const old = boot(JSON.stringify({
    roster: null, layouts: { 2: { S1: { x: 11, y: 22 } }, 5: { MB1: { x: 33, y: 44 } } },
  }));
  const migrated = old.peek().saved.layouts;
  check('numeric keys treated as base', migrated.base['2'].S1.x === 11);
  check('all rotations carried over', migrated.base['5'].MB1.y === 44);
  check('receive starts empty', Object.keys(migrated.receive).length === 0);
  check('defense starts empty', Object.keys(migrated.defense).length === 0);

  // Already formation-keyed: left alone.
  const fresh = boot(JSON.stringify({
    roster: null,
    layouts: { base: { 1: { S1: { x: 1, y: 2 } } }, receive: { 3: { S1: { x: 5, y: 6 } } } },
  }));
  const kept = fresh.peek().saved.layouts;
  check('formation keys preserved', kept.base['1'].S1.x === 1 && kept.receive['3'].S1.y === 6);

  // Formation settings validate rather than trusting the blob.
  const bad = boot(JSON.stringify({
    roster: null, layouts: 'nope', passers: 99, defenseSystem: 'zone', defenseSide: 'up',
  }));
  const b = bad.peek().saved;
  check('garbage layouts reset to empty', Object.keys(b.layouts.base).length === 0);
  check('bad passer count defaults to 3', b.passers === 3, String(b.passers));
  check('bad defense system defaults to perimeter', b.defenseSystem === 'perimeter');
  check('bad defense side defaults to right', b.defenseSide === 'right');
}

console.log('\n22. Serve receive keeps players in their own row');
{
  const app = boot(JSON.stringify({ system: '4-2', roster: null, entrySlot: 1, passers: 3 }));
  const c = app.consts;
  const passSpots = [...Object.values(c.BACK_PASS_SPOTS).flat(),
                     ...Object.values(c.FRONT_PASS_SPOTS).flat()];

  for (let r = 1; r <= 6; r++) {
    const players = onCourt(app, 'receive', r);
    const front = players.filter((e) => c.FRONT_ROW_SLOTS.includes(e.slot));
    const back = players.filter((e) => c.BACK_ROW_SLOTS.includes(e.slot));

    // The invariant that was broken: nobody swaps rows.
    const deepestFront = Math.max(...front.map((e) => e.pos.y));
    const shallowestBack = Math.min(...back.map((e) => e.pos.y));
    check(`rotation ${r}: no front-row player ends up behind a back-row player`,
      deepestFront < shallowestBack, `front ${deepestFront} vs back ${shallowestBack}`);

    check(`rotation ${r}: no back-row player runs to the net`,
      back.every((e) => e.pos.y > 40), JSON.stringify(back.map((e) => e.pos.y)));

    check(`rotation ${r}: front row stays forward`,
      front.every((e) => e.pos.y < 50), JSON.stringify(front.map((e) => e.pos.y)));

    const unique = new Set(players.map((e) => `${e.pos.x},${e.pos.y}`));
    check(`rotation ${r}: all six positions distinct`, unique.size === 6, String(unique.size));

    const passers = players.filter((e) => matchesAny(e.pos, passSpots));
    check(`rotation ${r}: three passers`, passers.length === 3, String(passers.length));

    // With three passers in a 4-2, the passers are exactly the back row.
    check(`rotation ${r}: the back row does the passing`,
      passers.length === back.length && passers.every((e) => c.BACK_ROW_SLOTS.includes(e.slot)));

    // And one of them is the back-row setter, who isn't the one setting.
    check(`rotation ${r}: the back-row setter is one of the passers`,
      passers.some((e) => e.role === 'S'), JSON.stringify(passers.map((e) => e.role)));

    // The setting setter is at the net, in the front row.
    const setting = players.filter((e) =>
      at(e.pos, c.SETTER_TARGET.front) || at(e.pos, c.SETTER_TARGET.back));
    check(`rotation ${r}: exactly one player set up to set`, setting.length === 1,
      String(setting.length));
    check(`rotation ${r}: that player is a setter in the front row`,
      setting[0] && setting[0].role === 'S' && c.FRONT_ROW_SLOTS.includes(setting[0].slot));
  }
}

console.log('\n23. Passer count, still row-preserving');
{
  const expectations = { 2: 2, 3: 3, 4: 4, 5: 5 };
  for (const count of [2, 3, 4, 5]) {
    const app = boot(JSON.stringify({
      system: '4-2', roster: null, entrySlot: 1, passers: count,
    }));
    const c = app.consts;
    const passSpots = [...Object.values(c.BACK_PASS_SPOTS).flat(),
                       ...Object.values(c.FRONT_PASS_SPOTS).flat()];
    const players = onCourt(app, 'receive', 1);
    const front = players.filter((e) => c.FRONT_ROW_SLOTS.includes(e.slot));
    const back = players.filter((e) => c.BACK_ROW_SLOTS.includes(e.slot));
    const passers = players.filter((e) => matchesAny(e.pos, passSpots));

    check(`${count} passers requested, ${passers.length} placed`,
      passers.length === expectations[count]);
    check(`${count}-passer: rows still not crossed`,
      Math.max(...front.map((e) => e.pos.y)) < Math.min(...back.map((e) => e.pos.y)));
    check(`${count}-passer: back row stays back`, back.every((e) => e.pos.y > 40));
    const unique = new Set(players.map((e) => `${e.pos.x},${e.pos.y}`));
    check(`${count}-passer: nobody stacked`, unique.size === 6, String(unique.size));
  }
}

console.log('\n24. A back-row setter sets from behind the attack line');
{
  // A 6-2 sets with the back-row setter, so this is the case where the setting
  // player is in the back row.
  const app = boot(JSON.stringify({ system: '6-2', roster: null, entrySlot: 1, passers: 3 }));
  const c = app.consts;
  for (let r = 1; r <= 6; r++) {
    const players = onCourt(app, 'receive', r);
    const setting = players.filter((e) => at(e.pos, c.SETTER_TARGET.back));
    check(`rotation ${r}: back-row setter is at the back target`, setting.length === 1,
      String(setting.length));
    check(`rotation ${r}: and stays behind the attack line`,
      setting[0] && setting[0].pos.y > 33.33, setting[0] && String(setting[0].pos.y));

    const front = players.filter((e) => c.FRONT_ROW_SLOTS.includes(e.slot));
    const back = players.filter((e) => c.BACK_ROW_SLOTS.includes(e.slot));
    check(`rotation ${r}: 6-2 rows not crossed`,
      Math.max(...front.map((e) => e.pos.y)) < Math.min(...back.map((e) => e.pos.y)),
      `front ${Math.max(...front.map((e) => e.pos.y))} back ${Math.min(...back.map((e) => e.pos.y))}`);
  }
}

console.log('\n24b. A libero still passes');
{
  const app = boot(JSON.stringify({ system: '4-2', roster: null, entrySlot: 1, passers: 2 }));
  const { saved } = app.peek();
  const c = app.consts;
  const passSpots = [...Object.values(c.BACK_PASS_SPOTS).flat(),
                     ...Object.values(c.FRONT_PASS_SPOTS).flat()];

  // Make the back-row middle a libero; with only two passing spots they keep one.
  const backRowIndex = saved.roster.findIndex((_, i) => c.BACK_ROW_SLOTS.includes(app.call.slotFor(i, 1)));
  saved.roster[backRowIndex].role = 'L';

  const libero = onCourt(app, 'receive', 1).find((e) => e.role === 'L');
  check('libero is on court', Boolean(libero));
  check('libero is passing', libero && matchesAny(libero.pos, passSpots),
    libero && JSON.stringify(libero.pos));
}

console.log('\n25. Defense');
{
  const app = boot(JSON.stringify({
    system: '4-2', roster: null, entrySlot: 1, defenseSystem: 'perimeter', defenseSide: 'right',
  }));
  const { DEFENSE_SPOTS, FRONT_ROW_SLOTS, BACK_ROW_SLOTS } = app.consts;
  const spots = DEFENSE_SPOTS.perimeter;

  for (let r = 1; r <= 6; r++) {
    const players = onCourt(app, 'defense', r);
    const blockers = players.filter((e) => matchesAny(e.pos, spots.block));
    const off = players.filter((e) => at(e.pos, spots.offBlocker));
    const diggers = players.filter((e) => matchesAny(e.pos, spots.back));

    check(`rotation ${r}: two blockers`, blockers.length === 2, String(blockers.length));
    check(`rotation ${r}: one off-blocker`, off.length === 1, String(off.length));
    check(`rotation ${r}: three diggers`, diggers.length === 3, String(diggers.length));
    check(`rotation ${r}: blockers come from the front row`,
      blockers.every((e) => FRONT_ROW_SLOTS.includes(e.slot)));
    check(`rotation ${r}: diggers come from the back row`,
      diggers.every((e) => BACK_ROW_SLOTS.includes(e.slot)));

    // Blockers must be the two front-row players nearest the ball, which is on
    // our right, so the off-blocker is the leftmost of the three.
    const front = players.filter((e) => FRONT_ROW_SLOTS.includes(e.slot));
    const leftmost = front.reduce((a, b) =>
      app.consts.SLOT_POSITIONS[a.slot].x < app.consts.SLOT_POSITIONS[b.slot].x ? a : b);
    check(`rotation ${r}: the off-blocker is the far-side front player`,
      off[0] && off[0].id === leftmost.id);
  }
}

console.log('\n26. Defense mirrors and switches system');
{
  const right = boot(JSON.stringify({
    system: '4-2', roster: null, entrySlot: 1, defenseSystem: 'perimeter', defenseSide: 'right',
  }));
  const left = boot(JSON.stringify({
    system: '4-2', roster: null, entrySlot: 1, defenseSystem: 'perimeter', defenseSide: 'left',
  }));

  const xs = (app) => onCourt(app, 'defense', 1).map((e) => Math.round(e.pos.x)).sort((a, b) => a - b);
  const mirrored = xs(right).map((x) => 100 - x).sort((a, b) => a - b);
  check('left side is the mirror of the right', JSON.stringify(xs(left)) === JSON.stringify(mirrored),
    `${xs(left)} vs ${mirrored}`);

  const rot = boot(JSON.stringify({
    system: '4-2', roster: null, entrySlot: 1, defenseSystem: 'rotation', defenseSide: 'right',
  }));
  const perimeterPositions = JSON.stringify(onCourt(right, 'defense', 1).map((e) => e.pos));
  const rotationPositions = JSON.stringify(onCourt(rot, 'defense', 1).map((e) => e.pos));
  check('rotation defense differs from perimeter', perimeterPositions !== rotationPositions);

  // 6-up pulls a defender in front of the attack line; perimeter does not.
  const deepest = (app) => Math.max(...onCourt(app, 'defense', 1)
    .filter((e) => app.consts.BACK_ROW_SLOTS.includes(e.slot)).map((e) => e.pos.y));
  const shallowest = (app) => Math.min(...onCourt(app, 'defense', 1)
    .filter((e) => app.consts.BACK_ROW_SLOTS.includes(e.slot)).map((e) => e.pos.y));
  check('6-up brings a back-row defender up the court',
    shallowest(rot) < shallowest(right),
    `${shallowest(rot)} vs ${shallowest(right)}`);
  void deepest;
}

console.log('\n27. Dragging one formation leaves the others alone');
{
  const app = boot(JSON.stringify({ system: '4-2', roster: null, entrySlot: 1 }));
  const { saved } = app.peek();
  const id = saved.roster[0].id;

  const receiveBefore = app.call.positionsFor('receive', 1)[id];
  const defenseBefore = app.call.positionsFor('defense', 1)[id];

  // Simulate a drag in base, rotation 1.
  saved.layouts.base['1'] = { [id]: { x: 5, y: 95 } };

  check('base picks up the dragged spot', app.call.positionsFor('base', 1)[id].x === 5);
  check('receive unaffected',
    JSON.stringify(app.call.positionsFor('receive', 1)[id]) === JSON.stringify(receiveBefore));
  check('defense unaffected',
    JSON.stringify(app.call.positionsFor('defense', 1)[id]) === JSON.stringify(defenseBefore));
  check('other rotations of base unaffected',
    app.call.positionsFor('base', 2)[id].x !== 5);
}


console.log('\n28. Quiz zone regions tile the whole court');
{
  const app = boot(undefined);
  const { ZONE_REGIONS, SLOT_POSITIONS, FRONT_ROW_SLOTS } = app.consts;
  const zones = Object.keys(ZONE_REGIONS).map(Number).sort((a, b) => a - b);
  check('all six zones have a region', zones.join(',') === '1,2,3,4,5,6', zones.join(','));

  // Total area must be the whole court, with no gaps and no overlaps.
  const area = Object.values(ZONE_REGIONS)
    .reduce((sum, r) => sum + (r.width * r.height), 0);
  check('regions cover the court exactly', Math.abs(area - 10000) < 2, area.toFixed(1));

  // Every player's standing spot must fall inside its own zone's region.
  let inside = true;
  for (const [zone, region] of Object.entries(ZONE_REGIONS)) {
    const spot = SLOT_POSITIONS[zone];
    const within = spot.x >= region.left && spot.x <= region.left + region.width
      && spot.y >= region.top && spot.y <= region.top + region.height;
    if (!within) { inside = false; console.log(`      zone ${zone} spot is outside its region`); }
  }
  check('each zone spot sits inside its own region', inside);

  // Front-row regions above the attack line, back-row below.
  check('front-row regions start at the net',
    FRONT_ROW_SLOTS.every((z) => ZONE_REGIONS[z].top === 0));
  check('back-row regions start at the attack line',
    [1, 5, 6].every((z) => Math.abs(ZONE_REGIONS[z].top - 33.33) < 0.01));
}

console.log('\n29. Quiz answers agree with the court');
{
  const app = boot(JSON.stringify({ system: '4-2', roster: null, entrySlot: 1 }));
  app.call.startQuiz();

  for (let n = 0; n < 40; n++) {
    app.call.nextQuizQuestion();
    const { quiz } = app.quiz();
    check(`q${n}: answer matches slotFor`,
      quiz.answer === app.call.slotFor(quiz.index, quiz.rotation),
      `${quiz.answer} vs ${app.call.slotFor(quiz.index, quiz.rotation)}`);
    if (n > 2) break; // four is enough to prove it; keep the log readable
  }

  // Only ever asks about players who are actually on court, and never about the
  // server -- they stay visible as the anchor, so asking would give it away.
  let onCourtOnly = true;
  let neverTheServer = true;
  const zonesAsked = new Set();
  for (let n = 0; n < 200; n++) {
    app.call.nextQuizQuestion();
    const { quiz } = app.quiz();
    if (quiz.answer === null) onCourtOnly = false;
    if (quiz.answer === app.consts.SERVE_SLOT) neverTheServer = false;
    zonesAsked.add(quiz.answer);
  }
  check('never asks about a benched player', onCourtOnly);
  check('never asks about the server', neverTheServer,
    [...zonesAsked].sort().join(','));
  check('does ask about the other five zones',
    zonesAsked.size === 5, [...zonesAsked].sort().join(','));
}

console.log('\n30. Quiz scoring');
{
  const app = boot(JSON.stringify({ system: '4-2', roster: null, entrySlot: 1 }));
  app.call.startQuiz();

  // Three right, then one wrong.
  for (let i = 0; i < 3; i++) {
    app.call.nextQuizQuestion();
    app.call.answerQuiz(app.quiz().quiz.answer);
  }
  let s = app.quiz().quizScore;
  check('three correct counted', s.correct === 3 && s.asked === 3, JSON.stringify(s));
  check('streak is three', s.streak === 3, String(s.streak));

  app.call.nextQuizQuestion();
  const wrong = [1, 2, 3, 4, 5, 6].find((z) => z !== app.quiz().quiz.answer);
  app.call.answerQuiz(wrong);
  s = app.quiz().quizScore;
  check('wrong answer counted but not credited', s.asked === 4 && s.correct === 3,
    JSON.stringify(s));
  check('streak reset', s.streak === 0, String(s.streak));
  check('best streak remembered', s.best === 3, String(s.best));

  // A second tap on the same question must not double-count.
  app.call.answerQuiz(app.quiz().quiz.answer);
  s = app.quiz().quizScore;
  check('answering twice is ignored', s.asked === 4 && s.correct === 3, JSON.stringify(s));

  app.call.endQuiz();
  check('quiz cleared on exit', app.quiz().quiz === null);
}

console.log('\n31. Transparent export preference');
{
  const app = boot(JSON.stringify({ version: 2, activeId: 'a', transparentExport: true,
    lineups: { a: { name: 'T', system: '4-2', entrySlot: 1, layouts: {}, roleOverrides: {},
      roster: [
        { id: 'S1', role: 'S', name: '', fallback: 'Setter 1' },
        { id: 'MB1', role: 'MB', name: '', fallback: 'Middle 1' },
        { id: 'OH1', role: 'OH', name: '', fallback: 'Outside 1' },
        { id: 'S2', role: 'S', name: '', fallback: 'Setter 2' },
        { id: 'MB2', role: 'MB', name: '', fallback: 'Middle 2' },
        { id: 'OH2', role: 'OH', name: '', fallback: 'Outside 2' }] } } }));
  check('loaded from storage', app.peek().store.transparentExport === true);
  check('persisted on rewrite',
    JSON.parse(app.memory['volleyball-rotations-v1']).transparentExport === true);

  const off = boot(JSON.stringify({ roster: null }));
  check('defaults to off', off.peek().store.transparentExport === false);
}


console.log('\n32. Undo');
{
  const app = boot(JSON.stringify({ system: '4-2', roster: null, entrySlot: 1 }));
  const ids = () => app.peek().saved.roster.map((p) => p.id).join(',');

  check('nothing to undo at rest', app.stacks().undos === 0, JSON.stringify(app.stacks()));
  app.call.undo();
  check('undo on an empty stack is a no-op', ids().length > 0);

  // Three moves, then walk all the way back.
  const trail = [ids()];
  for (let i = 0; i < 3; i++) { app.call.movePlayer(0, 1); trail.push(ids()); }
  check('three steps recorded', app.stacks().undos === 3, JSON.stringify(app.stacks()));

  for (let i = 3; i > 0; i--) {
    app.call.undo();
    check(`undo step ${i} lands on the right state`, ids() === trail[i - 1],
      `${ids()} vs ${trail[i - 1]}`);
  }
  check('stack emptied', app.stacks().undos === 0, JSON.stringify(app.stacks()));
  check('back where we started', ids() === trail[0], ids());
}


console.log('\n33. The setter ring agrees with the status line');
{
  for (const [system, where] of [['4-2', 'front'], ['6-2', 'back'], ['5-1', 'any']]) {
    const app = boot(JSON.stringify({ system, roster: null, entrySlot: 1 }));
    const c = app.consts;
    for (let r = 1; r <= 6; r++) {
      const setters = app.call.settersThisRotation(r);
      check(`${system} r${r}: exactly one setter ringed`, setters.length === 1,
        String(setters.length));
      if (setters.length !== 1) continue;

      const { player, slot } = setters[0];
      check(`${system} r${r}: the ringed player is a setter`,
        app.call.roleFor(player, r) === 'S');

      if (where === 'front') {
        check(`${system} r${r}: setting from the front row`,
          c.FRONT_ROW_SLOTS.includes(slot), `zone ${slot}`);
      } else if (where === 'back') {
        check(`${system} r${r}: setting from the back row`,
          c.BACK_ROW_SLOTS.includes(slot), `zone ${slot}`);
      }

      // The ring and the sentence underneath must name the same person.
      app.call.setRotation(r);
      check(`${system} r${r}: status line names the ringed player`,
        app.status().includes(player.name || player.fallback),
        app.status());
    }
  }

  // Simple mode has no setter, so nothing should be ringed.
  const simple = boot(JSON.stringify({ system: 'simple', roster: null, entrySlot: 1 }));
  let none = true;
  for (let r = 1; r <= 6; r++) {
    if (simple.call.settersThisRotation(r).length !== 0) none = false;
  }
  check('simple mode rings nobody', none);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
