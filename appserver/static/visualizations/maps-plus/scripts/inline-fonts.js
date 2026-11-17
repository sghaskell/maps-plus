'use strict';
// MP-01: inline woff2 icon fonts as base64 data: URIs so glyphs render in sandboxed
// (null-origin) Dashboard Studio iframes, where cross-origin font fetches are blocked.
// Reads contrib/css-src/*.css (pristine originals), writes contrib/css/*.css. Idempotent.
const fs = require('fs');
const path = require('path');

const MAX_ADDED_BYTES = 450000;
const FILES = ['fontawesome-all.min.css', 'ionicons.min.css', 'glyphicon.css'];
// Families actually referenced outside @font-face (see MP-01 analysis).
const USED_FAMILIES = ['Font Awesome 7 Free', 'Font Awesome 7 Brands', 'Ionicons', 'Glyphicons Halflings'];

const FACE_RE = /@font-face\s*\{[^}]*\}/g;
const SRC_RE = /(?<=^|[;{\s])src\s*:[^;}]*(;|(?=\}))/g;

function unquote(s) { return s.trim().replace(/^['"]|['"]$/g, ''); }

function inlineCss(cssText, opts) {
  const fontsDir = opts.fontsDir;
  const used = new Set(opts.usedFamilies);
  const faces = [];
  const css = cssText.replace(FACE_RE, (block) => {
    const fam = /font-family\s*:\s*([^;}]*)/.exec(block);
    const family = fam ? unquote(fam[1]) : null;
    if (!family || !used.has(family)) { return block; }
    const urls = [];
    block.replace(/src\s*:[^;}]*/g, (decl) => {
      decl.replace(/url\(\s*(['"]?)([^)'"]*)\1\s*\)\s*(format\(\s*['"]?([^)'"]*)['"]?\s*\))?/g,
        (m, q, u, f, fmt) => { urls.push({ raw: m, url: u, fmt: fmt }); return m; });
      return decl;
    });
    const woff2 = urls.find((x) => /\.woff2(\?|#|$)/.test(x.url));
    if (!woff2) { return block; }
    const rel = woff2.url.replace(/[?#].*$/, '');
    const file = path.join(fontsDir, path.basename(rel));
    const b64 = fs.readFileSync(file).toString('base64');
    const entries = [
      'url(data:font/woff2;base64,' + b64 + ') format("woff2")',
      'url(' + rel + ') format("woff2")'
    ];
    if (family === 'Ionicons') {
      const woff = urls.find((x) => /\.woff(\?|#|$)/.test(x.url));
      if (woff) { entries.push('url(' + woff.url + ') format("woff")'); }
    }
    const newSrc = 'src:' + entries.join(', ') + ';';
    let first = true;
    const out = block.replace(SRC_RE, () => {
      if (first) { first = false; return newSrc; }
      return ''; // drop later src declarations (eot/ttf/svg fallbacks)
    });
    faces.push({ family: family, file: path.basename(rel), bytes: Buffer.byteLength(b64) });
    return out;
  });
  const addedBytes = Buffer.byteLength(css) - Buffer.byteLength(cssText);
  return { css: css, addedBytes: addedBytes, faces: faces };
}

function main() {
  const base = path.join(__dirname, '..', 'contrib');
  const fontsDir = path.join(base, 'fonts');
  let total = 0;
  const inlined = new Set();
  for (const f of FILES) {
    const src = fs.readFileSync(path.join(base, 'css-src', f), 'utf8');
    const r = inlineCss(src, { fontsDir: fontsDir, usedFamilies: USED_FAMILIES });
    fs.writeFileSync(path.join(base, 'css', f), r.css);
    total += r.addedBytes;
    r.faces.forEach((face) => inlined.add(face.family));
    console.log(f + ': ' + Buffer.byteLength(src) + ' -> ' + Buffer.byteLength(r.css) +
      ' (+' + r.addedBytes + ' B, ' + r.faces.length + ' faces inlined)');
  }
  console.log('Total added: ' + total + ' B (budget ' + MAX_ADDED_BYTES + ')');
  if (total > MAX_ADDED_BYTES) {
    console.error('ERROR: inlined fonts exceed budget');
    process.exit(1);
  }
  // Fail loudly if a used family was not inlined (e.g. a font upgrade renamed it);
  // otherwise Studio glyphs would silently break again.
  const missing = USED_FAMILIES.filter((fam) => !inlined.has(fam));
  if (missing.length) {
    console.error('ERROR: no @font-face inlined for: ' + missing.join(', '));
    process.exit(1);
  }
}

module.exports = { inlineCss, USED_FAMILIES, FILES, MAX_ADDED_BYTES };
if (require.main === module) { main(); }
