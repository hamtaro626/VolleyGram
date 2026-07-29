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

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
