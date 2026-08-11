// Checks the role colours in style.css against the white text on .player.
// Run with: node test/contrast.js
//
// Player names are white for every role, so each background has to carry the
// contrast on its own. WCAG AA wants 4.5:1 for normal text.

const fs = require('fs');
const path = require('path');

const CSS = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
const MIN_CONTRAST = 4.5;
const MIN_HUE_GAP = 25; // degrees, between two saturated colours

// A role sits *on* the court rather than beside another role, and every player
// circle carries a dark border, so the court gets a lower bar than two roles do.
// It isn't zero: the clay court is 17 degrees off the setter's gold, which is
// the tightest pair that ships and the reason this floor is 15 rather than 25.
const MIN_COURT_HUE_GAP = 15;
// The second route. Two colours sharing a hue are still tellable apart if one
// is much darker than the other, and against the court that's available in a
// way it isn't between two roles: every role fill is deliberately held to a
// 5.4-7.6:1 band against the same text, so they all sit at a similar lightness
// and hue is genuinely all they have. The court is under no such constraint.
//
// Beach is the case that needs it. Every sandy hue lands within a few degrees
// of the setter's gold, so no shade of sand can clear the hue gap -- sand is
// gold. It clears on contrast instead, at 3:1, WCAG's non-text figure.
const MIN_ROLE_COURT_CONTRAST = 3;
// The third route. Two colours sharing a hue at similar lightness are still
// unmistakable if one of them is barely coloured at all: a saturated disc on a
// near-neutral ground is not a collision, whatever the ratio says. Beach is the
// surface that needs this -- every sandy hue is the setter's hue -- and the bar
// is that the court carries at most this fraction of the role's saturation.
const MAX_COURT_CHROMA_RATIO = 0.4;
// Same figure as the roles, for the court against the lines drawn on it. Each
// surface is measured against *its own* ink, not against white: a light court
// flips the whole set to dark, so a fixed colour here would test a court that
// does not exist.
const MIN_LINE_CONTRAST = 3;

const linear = (channel) => {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

const toRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const luminance = (hex) => {
  const [r, g, b] = toRgb(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
};

const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Saturation tells us whether hue is even meaningful: a grey has no hue worth
// comparing, so it can sit anywhere without colliding with a real colour.
const hsl = (hex) => {
  const [r, g, b] = toRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  if (delta === 0) return { hue: 0, saturation: 0, lightness };
  const raw = max === r ? ((g - b) / delta) % 6
    : max === g ? (b - r) / delta + 2
      : (r - g) / delta + 4;
  return {
    hue: Math.round(((raw * 60) + 360) % 360),
    saturation: delta / (1 - Math.abs(2 * lightness - 1)),
    lightness,
  };
};

// Pull `.role-X { background: #hex; }` straight out of the stylesheet, so this
// tests what actually ships rather than a list copied by hand.
const roles = [...CSS.matchAll(/\.role-([A-Z]+)\s*\{[^}]*background:\s*(#[0-9a-fA-F]{6})/g)]
  .map(([, role, hex]) => ({ role, hex: hex.toLowerCase() }));

// The colour .player sets for its text.
const textMatch = CSS.match(/\.player\s*\{[^}]*color:\s*(#[0-9a-fA-F]{3,6})/);
const textColor = textMatch ? textMatch[1].toLowerCase() : null;

let failures = 0;
const fail = (message) => { failures++; console.log(`  FAIL ${message}`); };

console.log(`\nPlayer text colour: ${textColor || 'NOT FOUND'}`);
if (!textColor) fail('could not find a color on .player');
if (roles.length === 0) fail('found no .role-* background colours');

console.log(`Found ${roles.length} roles\n`);

for (const { role, hex } of roles) {
  const ratio = contrast(hex, textColor);
  const { saturation } = hsl(hex);
  const verdict = ratio >= MIN_CONTRAST ? 'pass' : 'FAIL';
  console.log(`  ${role.padEnd(5)} ${hex}  ${ratio.toFixed(2).padStart(5)}:1  ${verdict}`);
  if (ratio < MIN_CONTRAST) {
    fail(`.role-${role} is ${ratio.toFixed(2)}:1 against ${textColor}, needs ${MIN_CONTRAST}`);
  }
  void saturation;
}

const ratios = roles.map(({ hex }) => contrast(hex, textColor));
console.log(`\n  band: ${Math.min(...ratios).toFixed(2)} to ${Math.max(...ratios).toFixed(2)}:1`);

// Two strongly coloured roles too close in hue look like the same role.
console.log('\nHue separation (greys exempt):');
const saturated = roles
  .map((r) => ({ ...r, ...hsl(r.hex) }))
  .filter((r) => r.saturation > 0.15);

for (const grey of roles.filter((r) => hsl(r.hex).saturation <= 0.15)) {
  console.log(`  ${grey.role.padEnd(5)} neutral grey — exempt`);
}

saturated.sort((a, b) => a.hue - b.hue);
for (let i = 0; i < saturated.length; i++) {
  const current = saturated[i];
  const next = saturated[(i + 1) % saturated.length];
  if (saturated.length < 2) break;
  const gap = (next.hue - current.hue + 360) % 360;
  const verdict = gap >= MIN_HUE_GAP ? 'ok' : 'FAIL';
  console.log(`  ${current.role.padEnd(5)} -> ${next.role.padEnd(5)} ${String(gap).padStart(3)} deg  ${verdict}`);
  if (gap < MIN_HUE_GAP) fail(`.role-${current.role} and .role-${next.role} are only ${gap} degrees apart`);
}

// --- The court underneath ---------------------------------------------
//
// Added in v0.21 with the grass surface. Before that there was one court colour
// and this suite never looked at it -- which is exactly the drift the SPEC
// warned about: a second palette shipping unverified while the suite still says
// ALL PASS. Both courts are pulled out of the stylesheet, same as the roles.
// Each surface's rule block, so its background and its --line come from the
// same place. A surface that does not redefine --line inherits the base one.
const blockFor = (selector) => {
  const at = CSS.indexOf(selector + ' {');
  if (at === -1) return '';
  return CSS.slice(at, CSS.indexOf('}', at));
};
const baseBlock = blockFor('.court');
const baseLine = (baseBlock.match(/--line:\s*(#[0-9a-fA-F]{6})/) || [])[1];

const readSurface = (name, selector) => {
  const block = blockFor(selector);
  const hex = (block.match(/background:\s*(#[0-9a-fA-F]{6})/) || [])[1];
  if (!hex) return null;
  const line = (block.match(/--line:\s*(#[0-9a-fA-F]{6})/) || [])[1] || baseLine;
  return { name, hex: hex.toLowerCase(), line: (line || '').toLowerCase() };
};

const surfaces = [
  readSurface('indoor', '.court'),
  ...[...CSS.matchAll(/\.court\.surface-([a-z]+)\s*\{/g)]
    .map(([, name]) => readSurface(name, `.court.surface-${name}`)),
].filter(Boolean);

console.log(`\nCourt surfaces (${surfaces.length}):`);
if (surfaces.length === 0) fail('found no court background colours');

for (const { name, hex, line } of surfaces) {
  const lines = contrast(hex, line);
  const { hue: courtHue, saturation: courtSat } = hsl(hex);
  console.log(`\n  ${name} ${hex}  hue ${courtHue}  sat ${courtSat.toFixed(2)}`
    + `  ink ${line} ${lines.toFixed(2)}:1`);
  if (lines < MIN_LINE_CONTRAST) {
    fail(`the ${name} court is ${lines.toFixed(2)}:1 against its own lines (${line}), needs ${MIN_LINE_CONTRAST}`);
  }

  // Every role has to stay tellable from the surface it stands on, by hue or by
  // lightness. Failing both is what makes a player disappear into the court.
  for (const role of roles) {
    const { hue, saturation } = hsl(role.hex);
    const ratio = contrast(role.hex, hex);
    // A grey has no hue to collide with, so contrast is all it has to answer to.
    const raw = Math.abs(hue - courtHue);
    const gap = saturation <= 0.15 ? null : Math.min(raw, 360 - raw);

    const byHue = gap !== null && gap >= MIN_COURT_HUE_GAP;
    const byContrast = ratio >= MIN_ROLE_COURT_CONTRAST;
    const byChroma = saturation > 0.15
      && courtSat <= saturation * MAX_COURT_CHROMA_RATIO;
    const how = byHue ? `hue ${gap} deg`
      : byContrast ? `contrast ${ratio.toFixed(2)}:1`
        : byChroma ? `chroma ${courtSat.toFixed(2)} vs ${saturation.toFixed(2)}`
          : 'NEITHER';
    console.log(`    ${role.role.padEnd(5)} ${gap === null ? 'grey  ' : String(gap).padStart(3) + ' deg'}` +
      `  ${ratio.toFixed(2).padStart(5)}:1  ${byHue || byContrast || byChroma ? 'ok  via ' + how : 'FAIL'}`);

    if (!byHue && !byContrast && !byChroma) {
      fail(`.role-${role.role} clears the ${name} court on none of hue ` +
        `(${gap === null ? 'grey' : gap + ' deg'}), contrast (${ratio.toFixed(2)}:1) ` +
        `or chroma (court ${courtSat.toFixed(2)} vs role ${saturation.toFixed(2)})`);
    }
  }
}

// --- Scoreboard team colours ------------------------------------------
//
// A second palette, on a screen the roles never appear on, so it answers to
// different questions: can you read the numerals on it, does it stand off the
// page behind it, and are the two teams tellable apart at a glance from the
// far side of a court.
const teams = [...CSS.matchAll(/\.side-(home|away)\s*\{[^}]*--team:\s*(#[0-9a-fA-F]{6})/g)]
  .map(([, side, hex]) => ({ side, hex: hex.toLowerCase() }));

const numeralMatch = CSS.match(/\.sb-point\s*\{[^}]*color:\s*(#[0-9a-fA-F]{3,6})/);
const numeral = numeralMatch ? numeralMatch[1].toLowerCase() : null;
const PAGE = '#16181d';

console.log(`\nScoreboard teams (${teams.length}), numerals ${numeral || 'NOT FOUND'}:`);
if (teams.length !== 2) fail(`expected 2 team colours, found ${teams.length}`);
if (!numeral) fail('could not find a numeral colour on .sb-point');

for (const { side, hex } of teams) {
  const onNumeral = numeral ? contrast(hex, numeral) : 0;
  const onPage = contrast(hex, PAGE);
  console.log(`  ${side.padEnd(5)} ${hex}  hue ${String(hsl(hex).hue).padStart(3)}` +
    `  numerals ${onNumeral.toFixed(2)}:1  page ${onPage.toFixed(2)}:1`);
  if (numeral && onNumeral < MIN_CONTRAST) {
    fail(`.side-${side} is ${onNumeral.toFixed(2)}:1 against the numerals, needs ${MIN_CONTRAST}`);
  }
  // The panel is its own edge -- there is no border drawn around it.
  if (onPage < MIN_LINE_CONTRAST) {
    fail(`.side-${side} is ${onPage.toFixed(2)}:1 against the page, needs ${MIN_LINE_CONTRAST}`);
  }
}

if (teams.length === 2) {
  const [a, b] = teams.map((team) => hsl(team.hex));
  const raw = Math.abs(a.hue - b.hue);
  const gap = Math.min(raw, 360 - raw);
  console.log(`  separation: ${gap} deg apart`);
  if (gap < MIN_HUE_GAP) {
    fail(`the two team colours are only ${gap} degrees apart`);
  }
  // Neither half should look brighter, and so more important, than the other.
  const evenness = contrast(teams[0].hex, teams[1].hex);
  console.log(`  evenness:   ${evenness.toFixed(2)}:1 between them (1.00 is identical lightness)`);
  if (evenness > 1.6) {
    fail(`one team colour is much lighter than the other (${evenness.toFixed(2)}:1)`);
  }
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
