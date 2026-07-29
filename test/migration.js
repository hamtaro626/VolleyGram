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
    insertBefore(n) { this.children.unshift(n); return n; },
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
    globalThis.__peek = () => ({ store, saved, currentRotation });
    globalThis.__call = { load, render, rebuild, useLineup, addLineup,
      duplicateLineup, deleteLineup, normaliseLineup, slotFor, rosterSize,
      describeRotation, setRotation, roleFor, hasRoleOverride, overrideCount,
      buildRosterRows, defaultPosition, rotationCount };
    globalThis.__const = { ZONE_LABEL_POSITIONS, SERVE_SLOT, SLOT_POSITIONS,
      COURT_SPOTS };
    globalThis.__status = () => document.getElementById('status').textContent;
  `;
  vm.runInNewContext(source + expose, context, { filename: 'script.js' });
  return { ...context, memory, warnings, peek: context.__peek, call: context.__call,
           consts: context.__const, status: context.__status };
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
  check('layout survived', saved.layouts['1'].S1.x === 10);
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
    app.status() === 'Rotation 3 of 6', app.status());
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

  // Startup renders rotation 1, which does populate that one layout.
  saved.layouts = {};

  // What the batch export does: read every rotation without opening it.
  for (let r = 1; r <= app.call.rotationCount(); r++) {
    app.call.describeRotation(r);
    saved.roster.forEach((_, i) => app.call.defaultPosition(i, r));
  }

  check('layouts still empty after reading all rotations',
    Object.keys(saved.layouts).length === 0,
    JSON.stringify(Object.keys(saved.layouts)));
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
    app.status().startsWith('Rotation 1 of 6'), app.status());
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
