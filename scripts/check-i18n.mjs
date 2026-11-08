// i18n guard: fails the build when a UI string is missing in English or
// Arabic, or when the two dictionaries drift apart.
//
// Runs automatically through the "prebuild" and "predev" npm scripts.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const srcDir = path.join(root, 'src');
const i18nPath = path.join(srcDir, 'ui', 'i18n.ts');

const walk = (dir) => {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
};

const source = fs.readFileSync(i18nPath, 'utf8');

const objectBlock = (name) => {
  const start = source.indexOf(`const ${name}`);
  if (start < 0) throw new Error(`i18n.ts: missing "${name}" dictionary`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`i18n.ts: unbalanced "${name}" dictionary`);
};

const keysOf = (block) => {
  const keys = new Set();
  const re = /'([A-Za-z0-9_.-]+)'\s*:/g;
  let match;
  while ((match = re.exec(block))) keys.add(match[1]);
  return keys;
};

const en = keysOf(objectBlock('EN'));
const ar = keysOf(objectBlock('AR'));

const used = new Map();
const matchers = [
  /\bt\(\s*'([^']+)'/g,
  /localized\(\s*[^,]+,\s*[^,]+,\s*'([^']+)'/g,
  /data-i18n="([^"]+)"/g,
];

for (const file of walk(srcDir)) {
  if (file === i18nPath) continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const re of matchers) {
    let match;
    while ((match = re.exec(text))) {
      if (!used.has(match[1])) used.set(match[1], new Set());
      used.get(match[1]).add(path.relative(root, file));
    }
  }
}

const missingInEn = [];
const missingInAr = [];
for (const key of used.keys()) {
  if (!en.has(key)) missingInEn.push(key);
  if (!ar.has(key)) missingInAr.push(key);
}
const arOnly = [...ar].filter((key) => !en.has(key));

const problems = [];
if (missingInEn.length) problems.push(`missing in EN: ${missingInEn.join(', ')}`);
if (missingInAr.length) problems.push(`missing in AR: ${missingInAr.join(', ')}`);
if (arOnly.length) problems.push(`present only in AR: ${arOnly.join(', ')}`);
if (en.size !== ar.size) problems.push(`size mismatch: EN ${en.size} vs AR ${ar.size}`);

if (problems.length) {
  console.error('\n[Nova Fleet] i18n check failed');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('\nAdd the missing strings to src/ui/i18n.ts (both EN and AR).\n');
  process.exit(1);
}

console.log(
  `[Nova Fleet] i18n ok — ${en.size} keys in EN/AR, ${used.size} referenced.`,
);
