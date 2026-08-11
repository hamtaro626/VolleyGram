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
    listeners: {},
    addEventListener(type, fn) {
      (this.listeners[type] = this.listeners[type] || []).push(fn);
    },
    dispatch(type, event) {
      (this.listeners[type] || []).forEach((fn) => fn(event || {}));
    },
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
    attrs: {},
    setAttribute(name, value) { this.attrs[name] = String(value); },
    setPointerCapture() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 300, height: 300 }; },
    querySelector() { return stubElement('span'); },
    closest() { return null; },
  };
  // className and classList are two views of one thing in a browser. Keeping
  // them as separate fields let a stale class survive a render that no longer
  // set it, which would make a class-based assertion pass for the wrong reason.
  Object.defineProperty(el, 'className', {
    get() { return [...el.classList.s].join(' '); },
    set(value) { el.classList.s = new Set(String(value).split(/\s+/).filter(Boolean)); },
  });
  return el;
}

function boot(seedJson, seedHash) {
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
    listeners: {},
    addEventListener(type, fn) {
      (this.listeners[type] = this.listeners[type] || []).push(fn);
    },
    dispatch(type, event) {
      (this.listeners[type] || []).forEach((fn) => fn(event || {}));
    },
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
    alert: () => {},
    atob: (b) => Buffer.from(b, 'base64').toString('binary'),
    btoa: (b) => Buffer.from(b, 'binary').toString('base64'),
    TextEncoder,
    TextDecoder,
    navigator: {},
    location: { origin: 'https://example.test', pathname: '/app/', search: '', hash: seedHash || '' },
  };
  // The real History API, near enough: replaceState with a hash-less URL is how
  // the app drops an imported link from the address bar.
  context.history = {
    replaceState: (_state, _title, url) => {
      const [pathname, hash] = String(url).split('#');
      context.location.pathname = pathname;
      context.location.hash = hash ? `#${hash}` : '';
    },
  };
  context.window = context;

  const source = fs.readFileSync(SCRIPT, 'utf8');
  // Appended in the same lexical scope, so it can reach the module's `let`s.
  const expose = `
    globalThis.__peek = () => ({ store, saved, currentRotation, currentFormation });
    globalThis.__call = { load, render, rebuild, useLineup, addLineup,
      duplicateLineup, deleteLineup, normaliseLineup, slotFor, rosterSize,
      zoneOccupied, onCourtCount, cycleLength,
      describeRotation, setRotation, roleFor, hasRoleOverride, overrideCount,
      buildRosterRows, benchPosition, rotationCount, applyRosterOrder,
      movePlayer, positionsFor, defaultLayout, setFormation, settingPlayer,
      startQuiz, endQuiz, nextQuizQuestion, answerQuiz, undo, pushHistory,
      settersThisRotation, shareUrl, encodeLineup, decodeLineup, importFromUrl,
      startDrag, onDrag, endDrag, versionFrom, overlapViolations, applySurface,
      benchPosition,
      cycleIndexFor: cycleIndex, courtRing,
      scorePoint, undoRally, newGame, renameTeam, normaliseMatch, gamesWon,
      renderScoreboard, openScoreboard, closeScoreboard, openNewGame,
      closeNewGame, closeMore, syncMenuButtons };
    globalThis.__players = () => playerElements;
    globalThis.__stacks = () => ({ undos: history.length });
    globalThis.__quiz = () => ({ quiz, quizScore });
    globalThis.__const = { ZONE_LABEL_POSITIONS, SERVE_SLOT, SLOT_POSITIONS,
      COURT_SPOTS, FORMATIONS, DEFENSE_SPOTS, SETTER_TARGET, FRONT_ROW_SLOTS,
      BACK_ROW_SLOTS, BACK_PASS_SPOTS, BACK_COVER_SPOTS, FRONT_PASS_SPOTS,
      NET_SPOTS, ZONE_REGIONS, MIN_PLAYERS, SURFACES, DEFAULT_SURFACE,
      RALLY_LIMIT, MAX_TEAM_NAME, GAME_LIMIT, SIDES };
    globalThis.__status = () => document.getElementById('status').textContent;
  `;
  vm.runInNewContext(source + expose, context, { filename: 'script.js' });
  return { ...context, memory, warnings, peek: context.__peek, call: context.__call,
           consts: context.__const, status: context.__status, quiz: context.__quiz,
           stacks: context.__stacks, players: context.__players };
}

const mod6 = (n, m) => ((n % m) + m) % m;

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
  check('subs enter at zone 1 by default', saved.entrySlot === 1,
    String(saved.entrySlot));
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
  // Dropped by v0.23, honoured again from v0.24 -- and it now means what it
  // always said without disturbing the serving order.
  check('a v0.4 entrySlot is honoured again', saved.entrySlot === 6,
    String(saved.entrySlot));
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
    ['roster of 1', JSON.stringify({ roster: [{ id: 'S1', role: 'S', name: 'alone' }] })],
    ['bogus system', JSON.stringify({ system: 'sportsball', roster: null })],
    ['bogus entrySlot', JSON.stringify({ entrySlot: 99, roster: null })],
    ['layouts as a string', JSON.stringify({ layouts: 'nope', roster: null })],
  ];
  for (const [label, json] of cases) {
    let ok = true, detail = '';
    try {
      const app = boot(json);
      const { store, saved } = app.peek();
      // Since v0.20 anything down to MIN_PLAYERS is a legitimate short-handed
      // roster and is kept. Only below that is a save treated as unrecoverable.
      if (!saved || saved.roster.length < 2) { ok = false; detail = 'roster too small'; }
      if (!SystemsOk(saved)) { ok = false; detail = 'bad system ' + saved.system; }
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
  // Three is short-handed, not broken. Before v0.20 this was rebuilt to six and
  // the name went with it.
  const short = boot(JSON.stringify({ roster: [
    { id: 'S1', role: 'S', name: 'keep me' },
    { id: 'MB1', role: 'MB', name: '' },
    { id: 'OH1', role: 'OH', name: '' }] }));
  const kept = short.peek().saved;
  check('a roster of three is kept, not rebuilt', kept.roster.length === 3,
    'got ' + kept.roster.length);
  check('and the name survives', kept.roster[0].name === 'keep me');

  // One player is below MIN_PLAYERS -- nothing worth showing, so start over.
  const app = boot(JSON.stringify({ roster: [{ id: 'S1', role: 'S', name: 'alone' }] }));
  const { saved } = app.peek();
  check('a roster below the floor is rebuilt to six', saved.roster.length === 6);
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

  // A CSS rule written as a single unqualified class matches *anywhere* that
  // class appears. Adding one of those names to a player circle silently
  // repaints it -- which is exactly how `.setting` (a roster-panel row style)
  // greyed out the setter's name and folded it onto one line.
  const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');

  const bare = new Set();
  for (const rule of css.matchAll(/^([^\n{@]+)\{/gm)) {
    for (const selector of rule[1].split(',')) {
      const trimmed = selector.trim();
      if (/^\.[A-Za-z][\w-]*$/.test(trimmed)) bare.add(trimmed.slice(1));
    }
  }

  // Every class the code ever puts on a player circle.
  const onPlayers = new Set(['player']);
  for (const m of js.matchAll(/el\.classList\.add\('([\w-]+)'\)/g)) onPlayers.add(m[1]);
  for (const m of js.matchAll(/className = `player ([^`]*)`/g)) {
    m[1].split(/\s+/).forEach((c) => { if (c && !c.includes('$')) onPlayers.add(c); });
  }

  const collisions = [...onPlayers].filter((c) => c !== 'player' && bare.has(c));
  check('no player class is also a bare CSS selector', collisions.length === 0,
    collisions.join(', '));

  // Both assets must carry the same cache-busting version, or a deploy can ship
  // new CSS against cached JS -- which looks like a bug and isn't one.
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const versions = [...html.matchAll(/\?v=([\w.]+)/g)].map((m) => m[1]);
  check('style.css and script.js are both versioned', versions.length === 2,
    `found ${versions.length}`);
  check('and carry the same version', new Set(versions).size === 1, versions.join(' vs '));
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


console.log('\n34. Share links');
{
  // Build a VolleyGram worth sharing, then read the link back.
  const source = boot(JSON.stringify({
    version: 2, activeId: 'a', showLabels: true,
    lineups: { a: { name: 'Tuesday Café', system: '6-2', entrySlot: 5, passers: 5,
      defenseSystem: 'rotation', defenseSide: 'left',
      layouts: { base: { 2: { S1: { x: 11, y: 22 } } }, receive: {}, defense: {} },
      roleOverrides: { 3: { MB1: 'OH' } },
      roster: [
        { id: 'S1', role: 'S', name: 'Álex', fallback: 'Setter 1' },
        { id: 'MB1', role: 'MB', name: '', fallback: 'Middle 1' },
        { id: 'OH1', role: 'OH', name: 'Maya', fallback: 'Outside 1' },
        { id: 'S2', role: 'S', name: '', fallback: 'Setter 2' },
        { id: 'MB2', role: 'MB', name: '', fallback: 'Middle 2' },
        { id: 'OH2', role: 'OH', name: '', fallback: 'Outside 2' }] } },
  }));

  const url = source.call.shareUrl();
  check('link points at the app', url.startsWith('https://example.test/app/#g='), url.slice(0, 40));
  check('payload rides in the hash, not the query', !url.includes('?'), url.slice(0, 60));
  check('no characters that need escaping in a URL',
    /^[A-Za-z0-9\-_]+$/.test(url.split('#g=')[1]), url.split('#g=')[1].slice(0, 40));
  console.log(`       link is ${url.length} characters`);
  check('a typical link is comfortably short', url.length < 1200, String(url.length));

  // Someone else opens it, with their own work already saved.
  const theirs = { name: 'My own team', system: '4-2', entrySlot: 1, layouts: {},
    roleOverrides: {}, roster: [
      { id: 'S1', role: 'S', name: 'Mine', fallback: 'Setter 1' },
      { id: 'MB1', role: 'MB', name: '', fallback: 'Middle 1' },
      { id: 'OH1', role: 'OH', name: '', fallback: 'Outside 1' },
      { id: 'S2', role: 'S', name: '', fallback: 'Setter 2' },
      { id: 'MB2', role: 'MB', name: '', fallback: 'Middle 2' },
      { id: 'OH2', role: 'OH', name: '', fallback: 'Outside 2' }] };

  const hash = '#g=' + url.split('#g=')[1];
  const receiver = boot(
    JSON.stringify({ version: 2, activeId: 'mine', showLabels: true, lineups: { mine: theirs } }),
    hash);

  const { store, saved } = receiver.peek();
  check('their own VolleyGram survived', Boolean(store.lineups.mine), Object.keys(store.lineups).join(','));
  check('their roster untouched', store.lineups.mine.roster[0].name === 'Mine');
  check('the shared one was added, not swapped in', Object.keys(store.lineups).length === 2,
    String(Object.keys(store.lineups).length));
  check('the shared one is now active', saved.name === 'Tuesday Café', saved.name);

  // Everything about it should have travelled.
  check('system travelled', saved.system === '6-2', saved.system);
  check('entry zone travels', saved.entrySlot === 5, String(saved.entrySlot));
  check('passer count travelled', saved.passers === 5, String(saved.passers));
  check('defense system travelled', saved.defenseSystem === 'rotation', saved.defenseSystem);
  check('defense side travelled', saved.defenseSide === 'left', saved.defenseSide);
  check('dragged position travelled', saved.layouts.base['2'].S1.x === 11);
  check('per-rotation role travelled', saved.roleOverrides['3'].MB1 === 'OH');
  check('accented name survived the round trip', saved.roster[0].name === 'Álex',
    saved.roster[0].name);

  check('the hash is cleared so a refresh cannot double-import',
    receiver.location.hash === '' || !receiver.location.hash.includes('#g='),
    receiver.location.hash);

  // A mangled link must not take the app down with it.
  const broken = boot(undefined, '#g=this-is-not-base64!!!');
  check('a corrupt link leaves a working app',
    broken.peek().saved.roster.length === 6);
  check('and falls back to the default VolleyGram',
    broken.peek().saved.name === 'My team', broken.peek().saved.name);
}

console.log('\n35. A tap on a player is not a drag');
{
  const app = boot(JSON.stringify({ system: '4-2', roster: null, entrySlot: 1 }));
  const el = app.players().S1;
  const before = app.stacks().undos;

  // Down and straight back up. One pixel of jitter, which a real finger always
  // has, must still read as a tap.
  app.call.startDrag({ currentTarget: el, clientX: 100, clientY: 100, pointerId: 1 });
  app.call.onDrag({ clientX: 101, clientY: 100 });
  app.call.endDrag();

  const tapped = app.peek().saved;
  check('a tap writes no dragged position',
    Object.keys(tapped.layouts.base).length === 0,
    JSON.stringify(tapped.layouts.base));
  check('a tap costs no undo step', app.stacks().undos === before,
    `${before} -> ${app.stacks().undos}`);

  // The generated position must still be generated -- that is the whole point.
  // Changing the passer count moves a player the app placed, but never one you
  // dragged, so this is what a wrongly-frozen tap would break.
  app.call.setFormation('receive');
  const wasReceiving = app.call.positionsFor('receive', 1).S1;
  app.call.startDrag({ currentTarget: el, clientX: 50, clientY: 50, pointerId: 1 });
  app.call.endDrag();
  const stillGenerated = app.call.positionsFor('receive', 1).S1;
  check('a tapped player keeps its generated position',
    stillGenerated.x === wasReceiving.x && stillGenerated.y === wasReceiving.y,
    `${JSON.stringify(wasReceiving)} -> ${JSON.stringify(stillGenerated)}`);

  // A real drag still behaves exactly as before.
  app.call.setFormation('base');
  app.call.startDrag({ currentTarget: el, clientX: 100, clientY: 100, pointerId: 1 });
  app.call.onDrag({ clientX: 160, clientY: 190 });
  app.call.endDrag();

  const dragged = app.peek().saved.layouts.base['1'];
  check('a real drag is saved', Boolean(dragged && dragged.S1),
    JSON.stringify(app.peek().saved.layouts.base));
  check('a real drag costs exactly one undo step', app.stacks().undos === before + 1,
    `${before} -> ${app.stacks().undos}`);
}

console.log('\n36. Corrupt coordinates never reach the renderer');
{
  // Every one of these would previously have been copied into the store as-is.
  // The null is the dangerous one: it survives the spread in positionsFor() and
  // then throws on `position.x` in render(), before the page has drawn.
  const nasty = boot(JSON.stringify({
    roster: null,
    layouts: {
      base: {
        1: {
          S1: null,                    // throws in render()
          MB1: { x: 'left', y: 10 },   // strings
          OH1: { x: 40, y: 50 },       // the one good entry
          S2: { x: NaN, y: 3 },        // JSON writes this as null
          MB2: 'nope',                 // not an object at all
          OH2: { x: 1e9, y: -400 },    // finite, but off both edges
        },
        notarotation: { S1: { x: 5, y: 5 } },
      },
      receive: [1, 2, 3],
    },
  }));

  const base = nasty.peek().saved.layouts.base;
  check('the good coordinate survived', base['1'].OH1.x === 40 && base['1'].OH1.y === 50);
  check('null position dropped', !('S1' in base['1']));
  check('string coordinates dropped', !('MB1' in base['1']));
  check('NaN coordinate dropped', !('S2' in base['1']));
  check('non-object position dropped', !('MB2' in base['1']));
  // Clamped to the edges rather than thrown away: the coordinate was a real
  // number, so the player is pulled back onto the diagram instead of snapping
  // to wherever the formation would have generated for them.
  check('out-of-range coordinate clamped to both bounds, not dropped',
    base['1'].OH2.x === 100 && base['1'].OH2.y === 0,
    JSON.stringify(base['1'].OH2));
  check('non-numeric rotation key dropped', !('notarotation' in base),
    Object.keys(base).join(', '));
  check('array where an object belongs resets to empty',
    Object.keys(nasty.peek().saved.layouts.receive).length === 0);

  // The real test: it draws.
  let drew = true;
  try { nasty.call.render(); } catch (error) { drew = false; }
  check('and the app still renders', drew);

  // The same payload arriving as a share link, which is the reachable path --
  // localStorage needs devtools, a link needs only a tap.
  const link = boot(undefined).call.encodeLineup({
    name: 'Hostile', system: '4-2', roster: null,
    layouts: { base: { 1: { S1: null } } },
  });
  const victim = boot(undefined, `#g=${link}`);
  let survived = true;
  try { victim.call.render(); } catch (error) { survived = false; }
  check('a hostile share link cannot white-screen the app', survived);
  check('and the bad position never made it into the store',
    Object.keys(victim.peek().saved.layouts.base).length === 0,
    JSON.stringify(victim.peek().saved.layouts.base));
}

console.log('\n37. The version marker reads its own script URL');
{
  const app = boot(undefined);
  const v = app.call.versionFrom;

  check('reads ?v= from a served URL',
    v('https://x.test/app/script.js?v=0.18') === '0.18');
  check('reads it when other params come first',
    v('https://x.test/app/script.js?debug=1&v=0.18') === '0.18');
  check('dotted versions survive whole', v('script.js?v=1.10.2') === '1.10.2');
  // Opened off the filesystem, which is a real way to run this app.
  check('no query means dev', v('file:///Users/x/script.js') === 'dev');
  check('empty and missing sources mean dev',
    v('') === 'dev' && v(null) === 'dev' && v(undefined) === 'dev');
  // A ?v= belonging to some other parameter must not be picked up.
  check('a lookalike param is not mistaken for the version',
    v('script.js?rev=9') === 'dev', v('script.js?rev=9'));

  // The marker must say something, whatever happened above.
  check('the corner is never left blank',
    app.document.getElementById('version').textContent.length > 1,
    app.document.getElementById('version').textContent);

  // index.html and the marker have to agree, or the number in the corner is
  // worse than no number at all.
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const served = (html.match(/script\.js\?v=([\w.]+)/) || [])[1];
  check('index.html serves script.js with a version', Boolean(served), served);
  check('and that is what the marker would show',
    v(`script.js?v=${served}`) === served, `${served}`);
}

console.log('\n38. Overlap legality');
{
  // The invariant the whole feature rests on: base positions come from the
  // rulebook, so untouched base must be legal in every system and every
  // rotation. If this ever fails, either the generator or the checker is wrong.
  for (const system of ['4-2', '5-1', '6-2', 'simple']) {
    const app = boot(JSON.stringify({ system, roster: null, entrySlot: 1 }));
    let total = 0;
    for (let r = 1; r <= 6; r++) total += app.call.overlapViolations(r).length;
    check(`${system} base is legal in all six rotations`, total === 0, `${total} found`);
  }

  // Entry zone rotates the court path, so it's worth checking it doesn't break
  // the ordering either.
  for (const entrySlot of [5, 6]) {
    const app = boot(JSON.stringify({ system: '4-2', roster: null, entrySlot }));
    let total = 0;
    for (let r = 1; r <= 6; r++) total += app.call.overlapViolations(r).length;
    check(`base stays legal with subs entering at zone ${entrySlot}`, total === 0, `${total} found`);
  }

  const app = boot(JSON.stringify({ system: '4-2', roster: null, entrySlot: 1 }));
  const inZone = (zone, rotation) => {
    const { saved } = app.peek();
    const i = saved.roster.findIndex((_, idx) => app.call.slotFor(idx, rotation) === zone);
    return saved.roster[i].id;
  };
  const z4 = inZone(4, 1);
  const z3 = inZone(3, 1);
  const z5 = inZone(5, 1);
  const base = app.peek().saved.layouts.base;

  // Drag zone 4 across zone 3: a lateral breach.
  base['1'] = { [z4]: { x: 90, y: 26 } };
  const lateral = app.call.overlapViolations(1);
  check('dragging zone 4 past zone 3 is caught', lateral.length === 1, JSON.stringify(lateral));
  check('the message names both zones',
    lateral[0].message.includes('4') && lateral[0].message.includes('3'), lateral[0].message);
  check('both players are marked, not just the one that moved',
    lateral[0].ids.includes(z4) && lateral[0].ids.includes(z3), lateral[0].ids.join(','));

  // Drag zone 4 behind zone 5: a column breach, laterally still fine.
  base['1'] = { [z4]: { x: 22, y: 90 } };
  const column = app.call.overlapViolations(1);
  check('dragging a front-row player behind their back-row pair is caught',
    column.length === 1, JSON.stringify(column));
  check('and it names the column pair',
    column[0].ids.includes(z4) && column[0].ids.includes(z5), column[0].message);

  // Exactly level is not a breach -- the rule is about crossing.
  base['1'] = { [z4]: { x: 50, y: 26 } };
  check('standing exactly level with a neighbour is legal',
    app.call.overlapViolations(1).length === 0,
    JSON.stringify(app.call.overlapViolations(1)));

  // A legal nudge stays legal.
  base['1'] = { [z4]: { x: 30, y: 20 } };
  check('a legal adjustment stays legal', app.call.overlapViolations(1).length === 0);

  // Only the rotation you touched is affected.
  base['1'] = { [z4]: { x: 90, y: 26 } };
  check('other rotations are unaffected', app.call.overlapViolations(2).length === 0);

  // Serve receive is deliberately NOT checked -- it draws the post-contact
  // switch, which is illegal before contact. Guards the scoping decision.
  const clean = boot(JSON.stringify({ system: '4-2', roster: null, entrySlot: 1 }));
  clean.call.setFormation('receive');
  clean.call.render();
  check('the status line stays quiet on serve receive',
    !clean.status().includes('overlap'), clean.status());

  // Off by default, and it persists.
  check('overlap checking is off by default', app.peek().store.checkOverlap === false);
  const on = boot(JSON.stringify({ checkOverlap: true, roster: null }));
  check('the setting survives a reload', on.peek().store.checkOverlap === true);
  check('and a bad value falls back to off',
    boot(JSON.stringify({ checkOverlap: 'yes', roster: null })).peek().store.checkOverlap === false);
}

console.log('\n39. A drag updates the overlap marks straight away');
{
  const app = boot(JSON.stringify({
    system: '4-2', roster: null, entrySlot: 1, checkOverlap: true,
  }));
  const { saved } = app.peek();
  const z4 = saved.roster[saved.roster.findIndex((_, i) => app.call.slotFor(i, 1) === 4)].id;
  const el = app.players()[z4];

  // v0.19 asserted this through the status line. That line no longer mentions
  // overlap at all -- the flag lives on the players -- so the same invariant is
  // now read off the player element instead.
  check('a fresh base rotation flags nobody', el.classList.contains('illegal') === false);
  check('and the status line says nothing about overlap',
    !/overlap/i.test(app.status()), app.status());

  // Grabbing at the centre of the stubbed 300x300 box makes both grab offsets
  // zero, so the drag maths is easy to follow: clientX 270 lands on x = 90.
  app.call.startDrag({ currentTarget: el, clientX: 150, clientY: 150, pointerId: 1 });
  app.call.onDrag({ clientX: 270, clientY: 78 });
  app.call.endDrag();

  // Deliberately no render() here. endDrag() used to skip it, since onDrag had
  // already moved the circle -- but the overlap marks are worked out in
  // render(), so the breach stayed invisible until the next redraw.
  check('the breach shows without changing rotation first',
    el.classList.contains('illegal'), app.status());
  check('and the rule is named on the player',
    /zone/i.test(el.title) && /overlap|ahead|left of/i.test(el.title), el.title);
  check('and the dragged position was still saved',
    app.peek().saved.layouts.base['1'][z4].x === 90,
    JSON.stringify(app.peek().saved.layouts.base['1']));

  // A tap still costs nothing and changes nothing.
  const before = app.stacks().undos;
  app.call.startDrag({ currentTarget: el, clientX: 150, clientY: 150, pointerId: 1 });
  app.call.endDrag();
  check('a tap still takes no undo step', app.stacks().undos === before);
}

console.log('\n40. Short-handed rosters');
{
  const shortRoster = (n) => Array.from({ length: n }, (_, i) =>
    ({ id: 'P' + i, role: 'NONE', name: 'P' + i, fallback: 'Player ' + (i + 1) }));

  const app = boot(JSON.stringify({ roster: shortRoster(5), layouts: {}, entrySlot: 1 }));
  const { saved } = app.peek();

  check('five players are kept', saved.roster.length === 5, 'got ' + saved.roster.length);
  check('names are kept', saved.roster.map((p) => p.name).join(',') === 'P0,P1,P2,P3,P4');

  // The point of the whole change: five bodies still play a six-zone game.
  check('still six rotations, not five', app.call.rotationCount() === 6,
    'got ' + app.call.rotationCount());
  check('five of them are on court', app.call.onCourtCount() === 5);

  // Exactly one zone empty each rotation, and a different one each time -- the
  // hole travels like a player. Over six rotations it visits all six zones.
  const vacancies = [];
  for (let r = 1; r <= 6; r++) {
    const empty = [1, 2, 3, 4, 5, 6].filter((z) => !app.call.zoneOccupied(z, r));
    if (empty.length !== 1) {
      check(`rotation ${r} has exactly one empty zone`, false, 'empty: ' + empty.join(','));
    }
    vacancies.push(empty[0]);
  }
  check('exactly one zone empty in every rotation', vacancies.every((z) => z !== undefined),
    vacancies.join(','));
  check('the hole visits all six zones', new Set(vacancies).size === 6, vacancies.join(','));

  // Nobody is ever benched when the roster is short of a full court.
  let benched = 0;
  for (let r = 1; r <= 6; r++) {
    saved.roster.forEach((_, i) => { if (app.call.slotFor(i, r) === null) benched++; });
  }
  check('nobody is sent to the bench', benched === 0, benched + ' bench placements');

  // The rotation where the hole reaches zone 1 is the one that costs you.
  const serveless = [1, 2, 3, 4, 5, 6].filter((r) => !app.call.zoneOccupied(1, r));
  check('exactly one rotation has no server', serveless.length === 1, serveless.join(','));
  app.call.setRotation(serveless[0]);
  check('and the status line says so', /no server/.test(app.status()), app.status());
  app.call.setRotation(serveless[0] === 6 ? 1 : serveless[0] + 1);
  check('other rotations do not', !/no server/.test(app.status()), app.status());

  // Overlap checking treats an empty zone as nothing to compare against.
  let threw = null;
  try { app.call.overlapViolations(1); } catch (e) { threw = e.message; }
  check('overlap checking survives empty zones', threw === null, threw);
  check('a fresh short lineup is legal', app.call.overlapViolations(1).length === 0);

  // Rendering the whole thing must not throw either.
  let renderError = null;
  try { for (let r = 1; r <= 6; r++) { app.call.setRotation(r); app.call.render(); } }
  catch (e) { renderError = e.message; }
  check('renders every rotation short-handed', renderError === null, renderError);

  // A full roster is unchanged by any of this.
  const full = boot(undefined);
  check('six players still gives six rotations', full.call.rotationCount() === 6);
  check('and no empty zones', [1, 2, 3, 4, 5, 6].every((z) => full.call.zoneOccupied(z, 1)));
  const seven = boot(JSON.stringify({ roster: shortRoster(7), layouts: {}, entrySlot: 1 }));
  check('seven players still gives seven rotations', seven.call.rotationCount() === 7);
  check('and one of them is benched', seven.peek().saved.roster
    .some((_, i) => seven.call.slotFor(i, 1) === null));
}

console.log('\n41. Short-handed round trip and sharing');
{
  const shortRoster = (n) => Array.from({ length: n }, (_, i) =>
    ({ id: 'P' + i, role: 'NONE', name: 'P' + i, fallback: 'Player ' + (i + 1) }));

  const first = boot(JSON.stringify({ roster: shortRoster(4), layouts: {}, entrySlot: 1 }));
  const written = first.memory['volleyball-rotations-v1'];
  const second = boot(written);
  check('four players survive a save and reload',
    second.peek().saved.roster.length === 4, 'got ' + second.peek().saved.roster.length);

  // Share links carry the roster, so a short one has to come back short.
  const url = first.call.shareUrl();
  // location.hash keeps its leading '#', and importFromUrl anchors on it.
  const hash = '#' + (String(url).split('#')[1] || '');
  const shared = boot(undefined, hash);
  const sharedSize = shared.peek().saved.roster.length;
  check('and survive a share link', sharedSize === 4, 'got ' + sharedSize);

  // Passer choices can't exceed who is on court.
  const app = boot(JSON.stringify({ roster: shortRoster(3), passers: 5, layouts: {} }));
  app.call.setFormation('receive');
  const positions = app.call.positionsFor('receive', 1);
  check('receive still places every short-handed player',
    Object.keys(positions).length === 3, JSON.stringify(Object.keys(positions)));
}

console.log('\n42. Playing surface');
{
  const app = boot();
  const courtEl = app.document.getElementById('court');

  check('a fresh lineup is indoor', app.peek().saved.surface === 'indoor',
    String(app.peek().saved.surface));
  check('and the court carries no grass class',
    !courtEl.classList.contains('surface-grass'));

  // Pre-v0.21 saves have no surface at all. An optional field with a default is
  // not a new storage shape, so this must work without a version bump.
  const legacy = boot(JSON.stringify({ roster: [], layouts: { 1: {} }, entrySlot: 1 }));
  check('a pre-v0.21 save defaults to indoor',
    legacy.peek().saved.surface === 'indoor', String(legacy.peek().saved.surface));

  const grass = boot(JSON.stringify({ version: 2, activeId: 'a',
    lineups: { a: { name: 'Quads', surface: 'grass', roster: [], layouts: {} } } }));
  check('a saved surface comes back', grass.peek().saved.surface === 'grass');
  grass.call.render();
  check('and paints the court', grass.document.getElementById('court')
    .classList.contains('surface-grass'));

  // Same defence as every other hand-editable field: it arrives from
  // localStorage and from share links, so an unknown value can't leave the
  // court unpainted.
  const bogus = boot(JSON.stringify({ version: 2, activeId: 'a',
    lineups: { a: { name: 'X', surface: 'astroturf', roster: [], layouts: {} } } }));
  check('an unknown surface falls back to indoor',
    bogus.peek().saved.surface === 'indoor', String(bogus.peek().saved.surface));
  const nonString = boot(JSON.stringify({ version: 2, activeId: 'a',
    lineups: { a: { name: 'X', surface: { hex: '#000' }, roster: [], layouts: {} } } }));
  check('so does a non-string surface', nonString.peek().saved.surface === 'indoor');

  // Switching back has to clear the old class, or two .court rules compete.
  const both = boot(JSON.stringify({ version: 2, activeId: 'a',
    lineups: { a: { name: 'X', surface: 'grass', roster: [], layouts: {} } } }));
  both.call.render();
  both.peek().saved.surface = 'indoor';
  both.call.render();
  const cls = both.document.getElementById('court').classList;
  check('switching back to indoor clears the grass class',
    !cls.contains('surface-grass') && cls.contains('surface-indoor'));

  // It's a repaint, not a reshuffle: nobody moves, so dragged positions stay.
  const dragged = boot(JSON.stringify({ version: 2, activeId: 'a', lineups: { a: {
    name: 'X', roster: [], layouts: { base: { 1: { S1: { x: 20, y: 30 } } } } } } }));
  dragged.peek().saved.surface = 'grass';
  dragged.call.render();
  const kept = dragged.peek().saved.layouts.base[1];
  check('changing surface keeps dragged positions',
    kept && kept.S1 && kept.S1.x === 20, JSON.stringify(kept));

  // Surface belongs to the lineup, so it has to survive a share link.
  const hash = '#' + (String(grass.call.shareUrl()).split('#')[1] || '');
  const viaLink = boot(undefined, hash);
  check('surface travels in a share link', viaLink.peek().saved.surface === 'grass',
    String(viaLink.peek().saved.surface));

  // Each lineup owns its own, the same way it owns its system.
  const two = boot();
  two.call.addLineup();
  const ids = Object.keys(two.peek().store.lineups);
  two.peek().store.lineups[ids[0]].surface = 'grass';
  check('one lineup being grass leaves the other indoor',
    two.peek().store.lineups[ids[1]].surface === 'indoor');

  // Cross-file drift: every surface the script offers needs a rule to paint it,
  // or picking it from the dropdown silently does nothing.
  const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
  const { SURFACES, DEFAULT_SURFACE } = app.consts;
  check('the default surface is one of the offered ones',
    Object.keys(SURFACES).includes(DEFAULT_SURFACE), DEFAULT_SURFACE);
  // The export redescribes the court on a canvas, and used to hard-code white
  // for every line it drew -- which silently assumed a dark court and would
  // have drawn invisible lines on a light one. It reads them from the
  // stylesheet now, so there is one definition per colour for both renderers.
  const script = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
  const drawStart = script.indexOf('function drawRotation(');
  const drawBody = script.slice(drawStart, script.indexOf('\n}\n', drawStart));
  check('the export reads court ink from the stylesheet',
    /courtInk\('--line'\)/.test(drawBody) && /courtInk\('--ring'\)/.test(drawBody));
  check('and hard-codes no line colour of its own',
    !/#f2f4f8|rgba\(255, 255, 255/.test(drawBody),
    (drawBody.match(/#f2f4f8|rgba\(255, 255, 255[^)]*\)/g) || []).join(', '));

  // A surface that flips to dark ink has to define the whole set, or it gets a
  // mix of its own and the base one.
  const beachBlock = css.slice(css.indexOf('.court.surface-beach {'),
    css.indexOf('}', css.indexOf('.court.surface-beach {')));
  ['--line', '--line-soft', '--line-faint', '--line-bench', '--ring'].forEach((prop) => {
    check(`beach defines ${prop}`, new RegExp(`${prop}:`).test(beachBlock));
  });

  Object.keys(SURFACES).forEach((key) => {
    // The default is painted by the bare `.court` rule; the rest need their own.
    const painted = key === DEFAULT_SURFACE
      ? /\.court\s*\{[^}]*background:/.test(css)
      : new RegExp(`\\.court\\.surface-${key}\\s*\\{[^}]*background:`).test(css);
    check(`style.css paints the ${key} surface`, painted);
  });
}

console.log('\n43. Scoreboard — scoring, undo, and staying out of the diagram');
{
  const app = boot();
  const match = () => app.peek().store.match;

  check('a fresh match is 0-0 in game 1',
    match().homeScore === 0 && match().awayScore === 0 && match().game === 1);
  check('with no games recorded', match().games.length === 0);

  app.call.scorePoint('home');
  app.call.scorePoint('home');
  app.call.scorePoint('away');
  check('points land on the right side',
    match().homeScore === 2 && match().awayScore === 1);

  // The whole point of the decision to keep these apart: scoring is not
  // allowed to move the diagram. This is the test that would have caught the
  // side-out link coming back by accident.
  check('scoring never moves the rotation', app.peek().currentRotation === 1,
    'rotation ' + app.peek().currentRotation);
  const stacksBefore = app.stacks().undos;
  app.call.scorePoint('home');
  check('and never touches the whiteboard undo stack',
    app.stacks().undos === stacksBefore, `${stacksBefore} -> ${app.stacks().undos}`);
  check('and the match carries no serving field',
    !('serving' in match()), Object.keys(match()).join(','));

  app.call.undoRally();
  check('undo takes the last point back', match().homeScore === 2);
  check('undo does not move the rotation either', app.peek().currentRotation === 1);

  const empty = boot();
  empty.call.undoRally();
  check('undo on an empty trail does nothing',
    empty.peek().store.match.homeScore === 0 && empty.peek().store.match.awayScore === 0);

  // An unknown side must not invent a score key.
  const bogus = boot();
  bogus.call.scorePoint('middle');
  check('scoring for an unknown side does nothing',
    bogus.peek().store.match.rallies.length === 0
    && bogus.peek().store.match.homeScore === 0);

  // The trail is capped, or a long match grows localStorage without limit.
  const long = boot();
  const cap = long.consts.RALLY_LIMIT;
  for (let i = 0; i < cap + 25; i++) long.call.scorePoint(i % 2 ? 'home' : 'away');
  check('the rally trail is capped', long.peek().store.match.rallies.length === cap,
    'got ' + long.peek().store.match.rallies.length);
}

console.log('\n44. Scoreboard — the match record');
{
  const app = boot();
  const match = () => app.peek().store.match;

  app.call.renameTeam('home', 'Riptide');
  app.call.renameTeam('away', 'Sharks');
  for (let i = 0; i < 25; i++) app.call.scorePoint('home');
  for (let i = 0; i < 19; i++) app.call.scorePoint('away');
  app.call.newGame('home');

  check('the finished game is recorded', match().games.length === 1);
  check('with its final score', match().games[0].home === 25 && match().games[0].away === 19);
  check('and its winner', match().games[0].winner === 'home');
  check('the game number advances', match().game === 2);
  check('the score resets', match().homeScore === 0 && match().awayScore === 0);
  check('the rally trail clears', match().rallies.length === 0);
  check('team names survive', match().home === 'Riptide' && match().away === 'Sharks');
  check('games won reads 1-0', JSON.stringify(app.call.gamesWon()) === '[1,0]',
    JSON.stringify(app.call.gamesWon()));

  app.call.scorePoint('away');
  app.call.newGame('away');
  check('games won reads 1-1', JSON.stringify(app.call.gamesWon()) === '[1,1]',
    JSON.stringify(app.call.gamesWon()));
  check('and the header says so',
    /Games 1–1/.test(app.document.getElementById('sbGame').textContent),
    app.document.getElementById('sbGame').textContent);

  // A game nobody played shouldn't enter the record as a 0-0 win.
  const skipped = boot();
  skipped.call.newGame(null);
  check('a game with no result records nothing',
    skipped.peek().store.match.games.length === 0);
  check('but still advances the game number', skipped.peek().store.match.game === 2);
  skipped.call.newGame('sideways');
  check('an unknown winner records nothing',
    skipped.peek().store.match.games.length === 0);

  // The end-game panel offers a winner only when there was one.
  const panel = boot();
  panel.call.openScoreboard();
  panel.call.openNewGame();
  check('with no points, the winner buttons are hidden',
    panel.document.getElementById('sbNewGame').classList.contains('nothing-played'));
  panel.call.scorePoint('home');
  panel.call.openNewGame();
  check('once a point is scored, they are offered',
    !panel.document.getElementById('sbNewGame').classList.contains('nothing-played'));
  check('and the winner buttons carry the team names',
    panel.document.getElementById('sbHomeWon').textContent === 'Home won',
    panel.document.getElementById('sbHomeWon').textContent);
  panel.call.newGame('home');
  check('choosing a winner closes the panel',
    panel.document.getElementById('sbNewGame').hidden === true);

  // The record is capped like everything else that grows.
  const many = boot();
  const gameCap = many.consts.GAME_LIMIT;
  for (let i = 0; i < gameCap + 10; i++) {
    many.call.scorePoint('home');
    many.call.newGame('home');
  }
  check('the game record is capped',
    many.peek().store.match.games.length === gameCap,
    'got ' + many.peek().store.match.games.length);
}

console.log('\n45. Scoreboard — storage and bad data');
{
  // A phone will background the tab mid-set, so the score has to survive.
  const live = boot();
  live.call.renameTeam('away', 'Sharks');
  live.call.scorePoint('home');
  live.call.scorePoint('home');
  live.call.newGame('home');
  live.call.scorePoint('away');
  const reloaded = boot(live.memory['volleyball-rotations-v1']);
  check('the score survives a reload', reloaded.peek().store.match.awayScore === 1);
  check('so does the match record', reloaded.peek().store.match.games.length === 1);
  check('and the names', reloaded.peek().store.match.away === 'Sharks');

  // But it must never ride in a share link -- that carries a lineup, and a
  // score is not a fact about a team.
  const hash = '#' + (String(live.call.shareUrl()).split('#')[1] || '');
  const shared = boot(undefined, hash);
  check('a share link carries no score', shared.peek().store.match.awayScore === 0);
  check('and no match record', shared.peek().store.match.games.length === 0);
  check('and no team names', shared.peek().store.match.away === 'Away');

  const legacy = boot(JSON.stringify({ roster: [], layouts: {}, entrySlot: 1 }));
  check('a pre-v0.22 save gets a fresh match',
    legacy.peek().store.match.homeScore === 0 && legacy.peek().store.match.game === 1);

  const lineups = { a: { name: 'X', roster: [], layouts: {} } };
  const junk = boot(JSON.stringify({ version: 2, activeId: 'a', lineups,
    match: { home: 42, away: '   ', homeScore: -5, awayScore: 3.7, game: 0,
      games: 'not an array', rallies: 'not an array' } }));
  const m = junk.peek().store.match;
  check('a non-string team name falls back', m.home === 'Home', String(m.home));
  check('a blank team name falls back', m.away === 'Away', String(m.away));
  check('a negative score becomes zero', m.homeScore === 0, String(m.homeScore));
  check('a fractional score is floored', m.awayScore === 3, String(m.awayScore));
  check('game zero becomes game one', m.game === 1, String(m.game));
  check('a non-array record becomes empty',
    Array.isArray(m.games) && m.games.length === 0);
  check('a non-array rally trail becomes empty',
    Array.isArray(m.rallies) && m.rallies.length === 0);

  const badRecords = boot(JSON.stringify({ version: 2, activeId: 'a', lineups,
    match: { game: 2, games: [null, { home: 25, away: 20, winner: 'home' },
      { home: 1, away: 2, winner: 'neither' }, 'nope'] } }));
  check('malformed game records are dropped, good ones kept',
    badRecords.peek().store.match.games.length === 1,
    JSON.stringify(badRecords.peek().store.match.games));

  // A stored game number that contradicts the record is not believed.
  const behind = boot(JSON.stringify({ version: 2, activeId: 'a', lineups,
    match: { game: 1, games: [{ home: 25, away: 1, winner: 'home' },
      { home: 25, away: 2, winner: 'away' }] } }));
  check('the game number is at least one past the record',
    behind.peek().store.match.game === 3, String(behind.peek().store.match.game));

  const badRallies = boot(JSON.stringify({ version: 2, activeId: 'a', lineups,
    match: { rallies: [null, { side: 'home' }, { side: 'sideways' }, 7] } }));
  check('malformed rallies are dropped, good ones kept',
    badRallies.peek().store.match.rallies.length === 1);

  const longName = boot();
  longName.call.renameTeam('home', 'x'.repeat(200));
  check('team names are capped',
    longName.peek().store.match.home.length === longName.consts.MAX_TEAM_NAME);

  // An emptied name field must not leave a blank half of the screen.
  const blank = boot();
  blank.call.renameTeam('home', '');
  blank.call.openScoreboard();
  check('an empty name still shows something',
    blank.document.getElementById('sbHomeWon').textContent === 'Home won',
    blank.document.getElementById('sbHomeWon').textContent);
}

console.log('\n46. The roster is the serving order');
{
  // The invariant v0.4 broke and v0.23 restored, and the reason this section
  // exists: with a bench, roster row 7 was serving second. Nothing in this
  // suite noticed, because nothing asked.
  const namesFor = (n) => Array.from({ length: n }, (_, i) => 'P' + i);
  const rosterOf = (n) => namesFor(n).map((name, i) =>
    ({ id: 'P' + i, role: 'NONE', name, fallback: name }));

  const servingOrder = (app) => {
    const order = [];
    const { saved } = app.peek();
    for (let r = 1; r <= app.call.rotationCount(); r++) {
      const server = saved.roster.find((_, i) =>
        app.call.slotFor(i, r) === app.consts.SERVE_SLOT);
      order.push(server ? server.name : null);
    }
    return order;
  };

  // Seeded at zone 6, the one entry zone that also lines the roster up with the
  // zones at rotation 1. Serving order is checked at every zone further down.
  [6, 7, 8, 12].forEach((size) => {
    const app = boot(JSON.stringify({ version: 2, activeId: 'a', lineups: { a: {
      name: 'T', system: 'simple', entrySlot: 6, roster: rosterOf(size),
      layouts: {} } } }));

    check(`${size} players: everyone serves exactly once per cycle`,
      servingOrder(app).join(',') === namesFor(size).join(','),
      servingOrder(app).join(','));

    // The other half of the contract, unchanged since v0.4.
    const rotationOne = [1, 2, 3, 4, 5, 6]
      .every((zone) => app.call.slotFor(zone - 1, 1) === zone);
    check(`${size} players: rotation 1 puts row N in zone N`, rotationOne);

    // Consecutive roster rows must be consecutive around the ring, or the
    // lineup you typed is not the lineup being drawn.
    let adjacent = true;
    for (let r = 1; r <= app.call.rotationCount(); r++) {
      for (let i = 0; i < size - 1; i++) {
        const mine = app.call.cycleIndexFor(i, r);
        const next = app.call.cycleIndexFor(i + 1, r);
        if (mod6(mine - next, app.call.cycleLength()) !== 1) adjacent = false;
      }
    }
    check(`${size} players: neighbours in the roster stay neighbours in the ring`,
      adjacent);
  });

  // The exact roster from the bug report, with the reported symptom named.
  const reported = ['Jen', 'Matt', 'Taylor', 'Evi', 'Cammi', 'Alec', 'Ashley'];
  const app = boot(JSON.stringify({ version: 2, activeId: 'a', lineups: { a: {
    name: 'My team', system: '4-2', layouts: {},
    roster: reported.map((name, i) => ({ id: 'P' + i,
      role: ['S', 'MB', 'OH', 'S', 'MB', 'S', 'OH'][i], name, fallback: name })) } } }));

  check('the reported roster serves in roster order',
    servingOrder(app).join(' → ') === reported.join(' → '), servingOrder(app).join(' → '));
  check('Ashley serves seventh, not second',
    servingOrder(app)[6] === 'Ashley', servingOrder(app)[1]);

  // Everybody spends exactly one rotation per cycle on the bench, and nobody
  // sits twice in a row while someone else never sits.
  const benchCounts = reported.map((_, i) => {
    let sat = 0;
    for (let r = 1; r <= app.call.rotationCount(); r++) {
      if (app.call.slotFor(i, r) === null) sat += 1;
    }
    return sat;
  });
  check('with seven players everyone sits exactly once per cycle',
    benchCounts.every((n) => n === 1), benchCounts.join(','));

  // The serving order has to survive every entry zone, not just the default.
  // v0.4's whole failure was that one choice of bench position silently
  // reordered the queue, so this asks all six.
  [1, 2, 3, 4, 5, 6].forEach((zone) => {
    const app = boot(JSON.stringify({ version: 2, activeId: 'a', lineups: { a: {
      name: 'T', system: 'simple', entrySlot: zone, layouts: {},
      roster: rosterOf(7) } } }));
    check(`entry zone ${zone}: roster order is still the serving order`,
      servingOrder(app).join(',') === namesFor(7).join(','),
      servingOrder(app).join(','));

    // And exactly one player is off court in each rotation, wherever they enter.
    let benchPerRotation = true;
    for (let r = 1; r <= 7; r++) {
      const off = rosterOf(7).filter((_, i) => app.call.slotFor(i, r) === null);
      if (off.length !== 1) benchPerRotation = false;
    }
    check(`entry zone ${zone}: exactly one player sits each rotation`,
      benchPerRotation);
  });

  // Only middle back keeps rows 1-6 on court together at rotation 1. That is
  // the documented cost of the other five, and the note in the roster panel
  // is driven by the same fact.
  const together = (zone) => {
    const app = boot(JSON.stringify({ version: 2, activeId: 'a', lineups: { a: {
      name: 'T', system: 'simple', entrySlot: zone, layouts: {},
      roster: rosterOf(7) } } }));
    return [1, 2, 3, 4, 5, 6].every((z) => app.call.slotFor(z - 1, 1) === z);
  };
  // The roster-panel note fires on the fact, not on the default -- otherwise
  // changing the default silently inverts what it says.
  const noteHidden = (zone, size) => {
    const app = boot(JSON.stringify({ version: 2, activeId: 'a', lineups: { a: {
      name: 'T', system: 'simple', entrySlot: zone, layouts: {},
      roster: rosterOf(size) } } }));
    return app.document.getElementById('entryNote').hidden;
  };
  check('the note is shown for zone 1 with a bench', noteHidden(1, 7) === false);
  check('and hidden for zone 6', noteHidden(6, 7) === true);
  check('and hidden with no bench at all', noteHidden(1, 6) === true);

  check('middle back keeps rows 1-6 on court at rotation 1', together(6));
  check('and no other entry zone does',
    [1, 2, 3, 4, 5].every((zone) => !together(zone)));

  // Short-handed has no bench at all, so the ring is just the six zones.
  const short = boot(JSON.stringify({ version: 2, activeId: 'a',
    lineups: { a: { name: 'T', system: 'simple', roster: rosterOf(4), layouts: {} } } }));
  check('four players still gives six rotations', short.call.rotationCount() === 6);
  let everOnBench = false;
  for (let r = 1; r <= 6; r++) {
    for (let i = 0; i < 4; i++) if (short.call.slotFor(i, r) === null) everOnBench = true;
  }
  check('and nobody is ever benched short-handed', !everOnBench);
}

console.log('\n47. Bench seats stay on the bench');
{
  // The bench block moves with the entry zone, so its coordinates have to be
  // read off the ring rather than assumed. v0.23 could assume, because the
  // bench always sat directly after zone 1; v0.24 made that one case of six and
  // benchPosition went on subtracting 1, which put the seat at x = 300% -- three
  // court widths off the right edge -- for every entry zone but middle back.
  //
  // Nothing here checked a bench coordinate. §46 checked *who* was benched and
  // never *where* they were drawn.
  const rosterOfN = (n) => Array.from({ length: n }, (_, i) =>
    ({ id: 'P' + i, role: 'NONE', name: 'P' + i, fallback: 'P' + i }));

  [1, 2, 3, 4, 5, 6].forEach((zone) => {
    [7, 8, 12].forEach((size) => {
      const app = boot(JSON.stringify({ version: 2, activeId: 'a', lineups: { a: {
        name: 'T', system: 'simple', entrySlot: zone, layouts: {},
        roster: rosterOfN(size) } } }));

      const seats = new Set();
      let worst = null;
      for (let r = 1; r <= app.call.rotationCount(); r++) {
        for (let i = 0; i < size; i++) {
          if (app.call.slotFor(i, r) !== null) continue;
          const { x } = app.call.benchPosition(i, r);
          seats.add(Math.round(x * 100) / 100);
          if (!(x > 0 && x < 100)) worst = x;
        }
      }
      check(`entry ${zone}, ${size} players: every bench seat is on screen`,
        worst === null, `x = ${worst}`);
      // One seat per bench slot, and no two players sharing one.
      check(`entry ${zone}, ${size} players: ${size - 6} distinct seats`,
        seats.size === size - 6, [...seats].join(','));
    });
  });
}

console.log('\n48. Touch handling');
{
  // Read out of the real stylesheet, same rule as contrast.js: a copy here
  // would drift and go on passing while the app misbehaved.
  const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
  // Anchored to the start of a line, and the selector escaped. Neither is
  // optional: an unescaped "body" begins with \b, a word boundary, and an
  // unanchored ".player" matches "body.quiz-hide-players .player" first.
  const ruleFor = (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`(?:^|\n)${escaped}\\s*\\{([^}]*)\\}`));
    const touch = (match ? match[1] : '').match(/touch-action:\s*([a-z- ]+);/);
    return touch ? touch[1].trim() : null;
  };

  // The court is most of the screen. `none` here meant a touch starting on it
  // could not scroll the page at all, so you had to find a margin to get past.
  check('the court allows vertical scrolling', ruleFor('.court') === 'pan-y',
    String(ruleFor('.court')));

  // ...but players must stay draggable in every direction. A descendant's
  // touch-action intersects with its ancestors', so this has to stay `none`
  // for a vertical drag not to be stolen by the page scroll.
  check('players are still fully draggable', ruleFor('.player') === 'none',
    String(ruleFor('.player')));

  // Double-tap-to-zoom on a page of large buttons fires by accident and leaves
  // you zoomed somewhere you did not ask to be.
  check('double-tap zoom is off page-wide', ruleFor('body') === 'manipulation',
    String(ruleFor('body')));

  // The roster drag handle has the same requirement as a player.
  check('the roster drag handle keeps its own touch-action',
    /\.roster button\.icon\.handle\s*\{[^}]*touch-action:\s*none/.test(css));
}

console.log('\n49. The control rows');
{
  // The layout is a decision, not an accident, so it is asserted rather than
  // left to drift the next time a button is added. Parsed out of index.html
  // for the same reason contrast.js parses style.css.
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const rows = [...html.matchAll(/<div class="actions([^"]*)"([^>]*)>([\s\S]*?)<\/div>/g)]
    .map(([, classes, attrs, body]) => ({
      classes: classes.trim(),
      hidden: /\bhidden\b/.test(attrs),
      ids: [...body.matchAll(/<button[^>]*id="([^"]+)"/g)].map((m) => m[1]),
    }))
    .filter((row) => row.ids.length > 0);

  const find = (id) => rows.find((row) => row.ids.includes(id));

  check('Scoreboard sits left of the drawer toggle',
    JSON.stringify(find('toggleMore').ids)
      === JSON.stringify(['openScoreboard', 'toggleMore']),
    JSON.stringify(find('toggleMore').ids));
  check('and the drawer toggle reads Show options',
    /id="toggleMore"[^>]*>Show options</.test(html));

  check('Labels and Quiz Mode share a row inside the drawer',
    JSON.stringify(find('toggleLabels').ids)
      === JSON.stringify(['toggleLabels', 'startQuiz']),
    JSON.stringify(find('toggleLabels').ids));

  check('Share holds the link and both exports on one row',
    JSON.stringify(find('shareLink').ids)
      === JSON.stringify(['shareLink', 'exportImage', 'exportAll']),
    JSON.stringify(find('shareLink').ids));
  check('and the long label was shortened to fit three across',
    /id="exportAll"[^>]*>Save all</.test(html));

  check('the share menu starts closed',
    /<div class="share-menu nested" id="shareMenu" hidden>/.test(html));

  // The setting that governs both exports sits with them rather than in the
  // roster panel, which is where it had drifted away to.
  const shareBlock = (html.match(/id="shareMenu"[\s\S]*?\n      <\/div>/) || [''])[0];
  check('the transparent-export toggle sits with the exports',
    /id="transparentExport"/.test(shareBlock));
  check('and is no longer in the roster panel',
    !/<section class="roster"[\s\S]*?id="transparentExport"[\s\S]*?<\/section>/.test(html));
  check('the drawer toggle controls the outer menu',
    /id="toggleMore"[^>]*aria-controls="moreMenu"/.test(html));
  check('Share controls the inner one',
    /id="toggleShare"[^>]*aria-controls="shareMenu"/.test(html));

  // Both levels live inside the one box, so the outer menu is a container of
  // rows rather than a row itself.
  check('a hidden .submenu is actually hidden',
    /\.submenu\[hidden\]\s*\{[^}]*display:\s*none/.test(
      fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8')));
  // .share-menu deliberately sets no display, so the browser's own rule works.
  check('.share-menu sets no display of its own',
    !/\.share-menu\s*\{[^}]*display:/.test(
      fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8')));

  // It moved out of the roster panel, where it had been the only export.
  check('the all-rotations export is no longer in the roster panel',
    !/<section class="roster"[\s\S]*?id="exportAll"[\s\S]*?<\/section>/.test(html));

  check('Show roster is alone on its row',
    JSON.stringify(find('toggleRoster').ids) === JSON.stringify(['toggleRoster']),
    JSON.stringify(find('toggleRoster').ids));

  // v0.17's rule, kept: Hold to reset all is last, alone, with nothing beside
  // it and nothing after it. v0.34 briefly put the drawer below it; this is the
  // assertion that says it is not there any more.
  check('Hold to reset all is alone on its row',
    JSON.stringify(find('resetAll').ids) === JSON.stringify(['resetAll']),
    JSON.stringify(find('resetAll').ids));
  check('and is still the last row of all',
    JSON.stringify(rows[rows.length - 1].ids) === JSON.stringify(['resetAll']),
    JSON.stringify(rows[rows.length - 1].ids));
  const orderOf = (id) => rows.findIndex((row) => row.ids.includes(id));
  check('the drawer comes first, then Show roster, then reset',
    orderOf('toggleMore') < orderOf('toggleRoster')
    && orderOf('toggleRoster') < orderOf('resetAll'),
    [orderOf('toggleMore'), orderOf('toggleRoster'), orderOf('resetAll')].join(','));
  check('and the drawer is shut',
    /<div class="submenu" id="moreMenu" hidden>/.test(html));

  // .actions is display:grid, so `hidden` needs putting back by hand.
  const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');

  // The status line above these rows flips between one and two lines as the
  // rotation changes, and used to shove every control below it down a line.
  const reserved = css.match(/--status-lines:\s*(\d+)/);
  check('the status line reserves a line so it cannot collapse',
    reserved && Number(reserved[1]) >= 1, reserved ? reserved[1] : 'not set');
  check('and its min-height is built from that reserve',
    /\.status\s*\{[^}]*min-height:\s*calc\(var\(--status-lines\)/.test(css));

  // A long press on a button is a gesture, not a text selection. Most visible
  // on Hold to reset all, where the press lasts 1.5s by design.
  check('buttons do not select their own label on a long press',
    /(?:^|\n)button\s*\{[^}]*-webkit-user-select:\s*none/.test(css));
  check('and raise no iOS callout',
    /(?:^|\n)button\s*\{[^}]*-webkit-touch-callout:\s*none/.test(css));
  // A roster drag has to commit even if the handle's own pointerup never
  // arrives, or the panel shows an order the roster array does not have.
  const js = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
  check('the roster reorder has a document-level release fallback',
    /document\.addEventListener\('pointerup', endRowDrag\)/.test(js));
  check('and endRowDrag is safe to call twice',
    /function endRowDrag\(\) \{\s*\n\s*if \(!rowDrag\) return;/.test(js));

  // The overlap flag moved out of the status line and onto the players, so the
  // badge markup and the rule that reveals it both have to exist.
  const js49 = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
  check('every player carries an overlap badge',
    /<span class="overlap-tag">Overlap<\/span>/.test(js49));
  check('shown only when the player is flagged',
    /\.player\.illegal \.overlap-tag\s*\{[^}]*display:\s*block/.test(css));
  // Checked against the code rather than the words, or the comment explaining
  // the change fails the check describing it.
  check('and render no longer writes overlap into the status line',
    !/overlapNote/.test(js49)
    && /statusLine\.textContent =\s*\n\s*`\$\{FORMATION_LABELS\[currentFormation\]\} · \$\{describeRotation\(\)\}`;/
      .test(js49));

  check('a hidden .actions row is actually hidden',
    /\.actions\[hidden\]\s*\{[^}]*display:\s*none/.test(css));

  // aria-expanded has to follow the panel, not be set once and forgotten.
  const app = boot();
  const menu = (id) => app.document.getElementById(id);
  check('both menus report closed at startup',
    menu('moreMenu').hidden === true && menu('shareMenu').hidden === true);

  // Closing the outer one has to take the inner one with it, or Save would be
  // found already open the next time More is pressed.
  menu('moreMenu').hidden = false;
  menu('shareMenu').hidden = false;
  app.call.syncMenuButtons();
  check('aria-expanded follows both panels',
    menu('toggleMore').attrs['aria-expanded'] === 'true'
    && menu('toggleShare').attrs['aria-expanded'] === 'true',
    JSON.stringify([menu('toggleMore').attrs, menu('toggleShare').attrs]));
  check('and the label follows the panel',
    menu('toggleMore').textContent === 'Hide options',
    menu('toggleMore').textContent);
  app.call.closeMore();
  check('closing the drawer closes Share with it',
    menu('moreMenu').hidden === true && menu('shareMenu').hidden === true);
  check('and the label goes back',
    menu('toggleMore').textContent === 'Show options',
    menu('toggleMore').textContent);
}

console.log('\n50. Reordering the roster by drag');
{
  // The bug this section exists for: swapping two rows moved them on screen and
  // never reached saved.roster, so the next buildRosterRows() -- which changing
  // rotation triggers -- rebuilt the list from the array and it snapped back.
  //
  // Cause: onRowDragMove moves the row through the DOM, the handle lives inside
  // that row, and moving it drops the handle's pointer capture. The release then
  // landed elsewhere and endRowDrag never ran.
  const names = ['Jen', 'Player 4', 'Matt', 'Evi', 'Player 5', 'Player 6', 'Player 7'];
  const seed = JSON.stringify({ version: 2, activeId: 'a', lineups: { a: {
    name: 'My team', system: 'simple', layouts: {},
    roster: names.map((name, i) => ({ id: 'P' + i, role: 'NONE', name, fallback: name })) } } });

  const app = boot(seed);
  const rows = () => app.document.getElementById('rosterRows').children;
  const order = () => app.peek().saved.roster.map((p) => p.name).join(',');

  check('starting order', order() === names.join(','), order());

  // Nothing after pointerdown is bound to the handle any more, which is the
  // whole point -- the handle is what stops being reachable mid-drag.
  const handle = rows()[2].children[0];
  check('the handle only starts the drag',
    Object.keys(handle.listeners).sort().join(',') === 'keydown,pointerdown',
    Object.keys(handle.listeners).join(','));
  check('move and release listen on the document',
    ['pointermove', 'pointerup', 'pointercancel']
      .every((type) => (app.document.listeners[type] || []).length > 0));

  // Swap Matt and Evi, exactly as the screenshots did.
  handle.dispatch('pointerdown', { currentTarget: handle, pointerId: 1 });
  const kids = app.document.getElementById('rosterRows').children;
  [kids[2], kids[3]] = [kids[3], kids[2]];

  // The release does NOT arrive at the handle -- that is the failure being
  // reproduced. It arrives at the document, and that has to be enough.
  app.document.dispatch('pointerup', {});

  const swapped = ['Jen', 'Player 4', 'Evi', 'Matt', 'Player 5', 'Player 6', 'Player 7'];
  check('the swap reaches the roster array', order() === swapped.join(','), order());

  // The symptom, checked directly: changing rotation rebuilds the rows, and the
  // order has to survive that.
  app.call.setRotation(2);
  check('and survives changing rotation', order() === swapped.join(','), order());
  check('the rebuilt rows show it too',
    rows().map((r) => r.dataset.playerId).join(',') === 'P0,P1,P3,P2,P4,P5,P6',
    rows().map((r) => r.dataset.playerId).join(','));

  // Rotation 2 benches roster row 3, so who is off court is the giveaway that
  // the array really changed -- it was Matt in the report, and is now Evi.
  const benched = app.peek().saved.roster
    .filter((_, i) => app.call.slotFor(i, 2) === null)
    .map((p) => p.name);
  check('and the bench follows the new order', benched.join(',') === 'Evi', benched.join(','));

  // A reorder naming nobody must say so rather than quietly doing nothing. The
  // keep-everyone-anyway guard made that failure indistinguishable from success.
  const quiet = boot(seed);
  const before = quiet.peek().saved.roster.map((p) => p.id).join(',');
  const acted = quiet.call.applyRosterOrder([undefined, undefined, undefined]);
  check('a reorder naming no known player is refused', acted === false, String(acted));
  check('and changes nothing',
    quiet.peek().saved.roster.map((p) => p.id).join(',') === before);
  check('and warns', quiet.warnings.some((w) => /named no known players/.test(w)),
    quiet.warnings.join(' | '));
}

console.log('\n51. Undo is scoped to the diagram');
{
  // The bug this section exists for: pushHistory() snapshotted the whole
  // store, and the match lives in the store -- so one undo of a player nudge
  // rewound a live scoreboard to whatever the score was when the nudge was
  // made, rally trail included. Fifteen call sites armed it.
  const app = boot();
  const match = () => app.peek().store.match;

  // A diagram edit, then a game happens on top of it.
  app.call.pushHistory();
  for (let i = 0; i < 8; i++) app.call.scorePoint(i % 3 ? 'home' : 'away');
  check('set up: 8 rallies on the board',
    match().homeScore + match().awayScore === 8,
    `${match().homeScore}-${match().awayScore}`);

  app.call.undo();
  check('undoing a diagram edit leaves the score alone',
    match().homeScore + match().awayScore === 8,
    `${match().homeScore}-${match().awayScore}`);
  check('and the rally trail with it', match().rallies.length === 8,
    String(match().rallies.length));

  // Display preferences are current settings, not edits -- undo skips them too.
  const flags = boot();
  flags.call.pushHistory();
  flags.peek().store.showLabels = false;
  flags.peek().store.checkOverlap = true;
  flags.call.undo();
  check('display flags survive an undo',
    flags.peek().store.showLabels === false
    && flags.peek().store.checkOverlap === true);

  // What undo is *for* still works: lineups, including deletion.
  const team = boot();
  team.call.pushHistory();
  team.peek().saved.roster[0].name = 'Changed';
  team.call.undo();
  check('a roster edit still undoes', team.peek().saved.roster[0].name === '');

  const del = boot();
  del.call.addLineup();
  const beforeIds = Object.keys(del.peek().store.lineups);
  del.call.deleteLineup();
  del.call.undo();
  check('deleting a lineup still undoes, activeId included',
    Object.keys(del.peek().store.lineups).join(',') === beforeIds.join(',')
    && del.peek().store.lineups[del.peek().store.activeId] !== undefined,
    Object.keys(del.peek().store.lineups).join(','));

  // The snapshot must not leak the match by reference either: scoring after a
  // pushHistory and undoing must not hand back a *shared* object that later
  // scoring mutates. (structuredClone of {activeId, lineups} can't contain the
  // match at all, which this asserts from the outside.)
  const leak = boot();
  leak.call.pushHistory();
  leak.call.scorePoint('home');
  leak.call.undo();
  leak.call.scorePoint('home');
  check('scoring still works after an undo', leak.peek().store.match.homeScore === 2,
    String(leak.peek().store.match.homeScore));
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
