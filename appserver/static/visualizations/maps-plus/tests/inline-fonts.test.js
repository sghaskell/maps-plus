// MP-01: inline icon fonts as data: URIs.
const fs = require('fs');
const path = require('path');
const { inlineCss, USED_FAMILIES, FILES, MAX_ADDED_BYTES } = require('../scripts/inline-fonts');

const contrib = path.join(__dirname, '..', 'contrib');
const fontsDir = path.join(contrib, 'fonts');
const read = (f) => fs.readFileSync(path.join(contrib, 'css-src', f), 'utf8');
const run = (f) => inlineCss(read(f), { fontsDir, usedFamilies: USED_FAMILIES });
const faceBlocks = (css) => css.match(/@font-face\s*\{[^}]*\}/g) || [];
const stripFaces = (css) => css.replace(/@font-face\s*\{[^}]*\}/g, '');
const familyOf = (b) => /font-family\s*:\s*['"]?([^'";}]*)/.exec(b)[1].trim();

test('inlineCss is deterministic / idempotent on the same source', () => {
  FILES.forEach((f) => {
    expect(run(f).css).toBe(run(f).css);
  });
});

test('checked-in contrib/css output matches a fresh run from css-src', () => {
  FILES.forEach((f) => {
    expect(fs.readFileSync(path.join(contrib, 'css', f), 'utf8')).toBe(run(f).css);
  });
});

test('every kept face has a data: entry followed by a url() entry', () => {
  let kept = 0;
  FILES.forEach((f) => {
    faceBlocks(run(f).css).filter((b) => USED_FAMILIES.includes(familyOf(b))).forEach((b) => {
      kept++;
      const src = /src\s*:((?:[^;}]|;base64)*)/.exec(b)[1];
      const entries = src.split(/,\s*(?=url\()/);
      expect(entries[0]).toMatch(/^\s*url\(data:font\/woff2;base64,[A-Za-z0-9+/=]+\) format\("woff2"\)/);
      expect(entries[1]).toMatch(/^\s*url\(\.\.\/fonts\/[^)?]+\.woff2\) format\("woff2"\)/);
      expect(src).not.toMatch(/\.(eot|ttf|svg)/);
    });
  });
  expect(kept).toBe(5); // FA7 Free x2, FA7 Brands, Ionicons, Glyphicons
});

test('Ionicons keeps the woff fallback last', () => {
  const b = faceBlocks(run('ionicons.min.css').css)[0];
  expect(b).toMatch(/format\("woff2"\), url\(\.\.\/fonts\/ionicons\.woff\?v=4\.5\.5\) format\("woff"\);/);
});

test('unused alias faces are untouched', () => {
  const before = faceBlocks(read('fontawesome-all.min.css'));
  const after = faceBlocks(run('fontawesome-all.min.css').css);
  expect(after.length).toBe(before.length);
  let seen = 0;
  before.forEach((b, i) => {
    if (!USED_FAMILIES.includes(familyOf(b))) { seen++; expect(after[i]).toBe(b); }
  });
  expect(seen).toBe(7);
});

test('non-font CSS is byte-identical', () => {
  FILES.forEach((f) => {
    expect(stripFaces(run(f).css)).toBe(stripFaces(read(f)));
  });
});

test('total added size is under budget', () => {
  const total = FILES.reduce((n, f) => n + run(f).addedBytes, 0);
  expect(total).toBeGreaterThan(0);
  expect(total).toBeLessThanOrEqual(MAX_ADDED_BYTES);
});
