// Creates a page from topics/mechanics/_template.html for every topic in
// nav.js whose file does not exist yet. Never overwrites an existing page.
// Usage: node tools/new-pages.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = { window: {} };
vm.runInNewContext(readFileSync(join(root, 'nav.js'), 'utf8'), ctx);
const template = readFileSync(join(root, 'topics/mechanics/_template.html'), 'utf8');

const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let created = 0;
for (const section of ctx.window.PHYSREF_NAV) {
  for (const topic of section.topics) {
    const out = join(root, topic.file);
    if (existsSync(out)) continue;
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, template.replaceAll('{{TITLE}}', escape(topic.title)).replaceAll('{{ID}}', topic.id));
    console.log('created', topic.file);
    created++;
  }
}
console.log(created ? `${created} page(s) created` : 'nothing to create');
