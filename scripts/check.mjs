import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Script } from 'node:vm';
import assert from 'node:assert/strict';

for (const path of ['worker.js', 'push-client.js', 'data-transfer.js', 'sw.js', 'app.js', 'scripts/build.mjs']) {
  execFileSync(process.execPath, ['--check', path], { stdio: 'inherit' });
}
const html = readFileSync('index.html', 'utf8');
for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new Script(match[1]);
assert.match(html, /src="\.\/push-client.js"/);
assert.match(html, /src="\.\/data-transfer.js"/);
assert.match(html, /rel="manifest"/);
assert.doesNotMatch(html, /new Notification\(/);
assert.doesNotMatch(html, /src=["']\/?app.js/);
assert.equal(JSON.parse(readFileSync('manifest.webmanifest', 'utf8')).display, 'standalone');
console.log('JavaScript, inline script and PWA entry points checked');
