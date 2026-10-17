import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(match => match[1]);
const manifestPath = html.match(/<link rel="manifest" href="([^"]+)"/)?.[1];
const manifest = JSON.parse(readFileSync('manifest.webmanifest', 'utf8'));

for (const path of ['/', '/arkTimer/']) test(path + 'から通知設定・データ引き継ぎのJSとPWAファイルを解決', () => {
  const base = new URL(path, 'https://example.test');
  assert.equal(scripts.length, 3);
  for (const source of [...scripts, manifestPath]) {
    const resolved = new URL(source, base);
    assert.ok(resolved.pathname.startsWith(path), resolved.href);
    assert.ok(existsSync('.' + resolved.pathname.slice(path.length - 1)), source);
  }
  const manifestURL = new URL(manifestPath, base);
  assert.equal(new URL(manifest.start_url, manifestURL).pathname, path);
  assert.equal(new URL(manifest.scope, manifestURL).pathname, path);
  for (const icon of manifest.icons) assert.ok(new URL(icon.src, manifestURL).pathname.startsWith(path));
});
