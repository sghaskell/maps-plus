#!/usr/bin/env node
// Checks that Maps+ option defaults agree across the three places they live:
//   1. defaultConfig in src/maps-plus.js          (source of truth for the JS fallback)
//   2. [default] stanza in default/savedsearches.conf
//   3. Format panel controls in formatter.html
// Exit 0 when every key present in more than one source has the same value.
// Exit 1 when a value mismatch remains.

'use strict';

const fs = require('fs');
const path = require('path');

const PKG_DIR = path.resolve(__dirname, '..');
const REPO_DIR = path.resolve(PKG_DIR, '..', '..', '..', '..');
const SRC_FILE = path.join(PKG_DIR, 'src', 'maps-plus.js');
const FORMATTER_FILE = path.join(PKG_DIR, 'formatter.html');
const SAVEDSEARCHES_FILE = path.join(REPO_DIR, 'default', 'savedsearches.conf');

const NAMESPACE = 'display.visualizations.custom.leaflet_maps_app.maps-plus.';

// Keys deliberately not compared. Each needs a reason.
const IGNORE = [
  // Basemap keys are being changed by MP-08 (basemap logic). Do not touch them in MP-11.
  { key: 'mapTile', reason: 'basemap logic owned by MP-08' },
  { key: 'mapTileOverride', reason: 'basemap logic owned by MP-08' },
  { key: 'useOpenFreeMap', reason: 'basemap logic owned by MP-08' },
  { key: 'maplibreStylePreset', reason: 'basemap logic owned by MP-08' },
  { key: 'maplibreStyleOverride', reason: 'basemap logic owned by MP-08' },
  { key: 'mapAttributionOverride', reason: 'basemap logic owned by MP-08' },
];
const IGNORED = new Map(IGNORE.map((i) => [i.key, i.reason]));

function unwrapQuotes(raw) {
  let v = raw.trim();
  if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0]) {
    v = v.slice(1, -1);
  }
  // The conf/config convention '""' means an empty JSON string; treat it as empty.
  if (v === '""' || v === "''") v = '';
  return v;
}

function normalize(v) {
  const t = v.trim();
  if (/^-?\d+(\.\d+)?$/.test(t)) return String(Number(t));
  return t;
}

function readDefaultConfig(text) {
  const start = text.indexOf('defaultConfig:');
  if (start < 0) throw new Error('defaultConfig not found in ' + SRC_FILE);
  const end = text.indexOf('\n},', start);
  const block = text.slice(start, end < 0 ? undefined : end);
  const out = {};
  const re = new RegExp("^\\s*'" + NAMESPACE.replace(/\./g, '\\.') + "(\\w+)'\\s*:\\s*(.*?),?\\s*$", 'gm');
  let m;
  while ((m = re.exec(block)) !== null) {
    out[m[1]] = unwrapQuotes(m[2]);
  }
  return out;
}

function readSavedSearches(text) {
  const out = {};
  let inDefault = false;
  for (const line of text.split(/\r?\n/)) {
    const header = line.match(/^\s*\[(.+)\]\s*$/);
    if (header) {
      inDefault = header[1] === 'default';
      continue;
    }
    if (!inDefault) continue;
    const m = line.match(new RegExp('^' + NAMESPACE.replace(/\./g, '\\.') + '(\\w+)\\s*=\\s*(.*)$'));
    if (m) out[m[1]] = unwrapQuotes(m[2]);
  }
  return out;
}

function readFormatter(text) {
  const out = {};
  const re = /<splunk-[a-z-]+\s[^>]*?name="\{\{VIZ_NAMESPACE\}\}\.(\w+)"([^>]*)>/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const attrs = m[2];
    const v = attrs.match(/\svalue=(?:"([^"]*)"|'([^']*)')/);
    // Only the value attribute counts; a placeholder is not a default.
    out[m[1]] = v ? unwrapQuotes(v[1] !== undefined ? v[1] : v[2]) : '';
  }
  return out;
}

function main() {
  const sources = {
    code: readDefaultConfig(fs.readFileSync(SRC_FILE, 'utf8')),
    conf: readSavedSearches(fs.readFileSync(SAVEDSEARCHES_FILE, 'utf8')),
    form: readFormatter(fs.readFileSync(FORMATTER_FILE, 'utf8')),
  };
  const labels = { code: 'defaultConfig', conf: 'savedsearches', form: 'formatter' };

  const keys = new Set();
  for (const s of Object.values(sources)) Object.keys(s).forEach((k) => keys.add(k));

  const mismatches = [];
  const gaps = [];
  const ignoredSeen = [];
  for (const key of [...keys].sort()) {
    if (IGNORED.has(key)) {
      ignoredSeen.push(key);
      continue;
    }
    const present = Object.keys(sources).filter((s) => key in sources[s]);
    const values = present.map((s) => normalize(sources[s][key]));
    const distinct = new Set(values);
    if (present.length < Object.keys(sources).length) {
      const missing = Object.keys(sources).filter((s) => !present.includes(s)).map((s) => labels[s]);
      gaps.push(`${key}: missing from ${missing.join(', ')}`);
    }
    if (distinct.size > 1) {
      const detail = present.map((s) => `${labels[s]}=${JSON.stringify(sources[s][key])}`).join('  ');
      mismatches.push(`${key}: ${detail}`);
    }
  }

  console.log(`Keys checked: ${keys.size - ignoredSeen.length} (ignored: ${ignoredSeen.length})`);
  for (const i of IGNORE) console.log(`  IGNORE ${i.key}: ${i.reason}`);
  console.log('');
  console.log(`Value mismatches: ${mismatches.length}`);
  for (const line of mismatches) console.log('  MISMATCH ' + line);
  console.log('');
  console.log(`Presence gaps (informational, not a failure): ${gaps.length}`);
  for (const line of gaps) console.log('  ' + line);

  if (mismatches.length > 0) {
    console.log('\nFAIL: value mismatches remain.');
    process.exit(1);
  }
  console.log('\nOK: no value mismatches.');
}

main();
