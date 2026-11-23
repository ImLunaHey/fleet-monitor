import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const names = ['fleet-monitor-dashboard.html', 'fleet-monitor-x86_64-linux',
  'fleet-monitor-aarch64-linux', 'fleet-monitor-x86_64-darwin',
  'fleet-monitor-aarch64-darwin', 'release.json', 'SHA256SUMS'];
const script = path.resolve('scripts/publish-release.sh');
function fixture(t, draft = true, existing = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-release-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const child of ['bin', 'local', 'remote']) fs.mkdirSync(path.join(dir, child));
  for (const name of names) fs.writeFileSync(path.join(dir, 'local', name), name);
  for (const name of existing) fs.copyFileSync(path.join(dir, 'local', name), path.join(dir, 'remote', name));
  fs.writeFileSync(path.join(dir, 'draft'), String(draft));
  // Fake GitHub CLI persists uploaded bytes and publication state independently.
  fs.writeFileSync(path.join(dir, 'bin', 'gh'), `#!${process.execPath}
const fs = require('fs'), path = require('path');
const [command, action, tag, ...args] = process.argv.slice(2);
const root = process.env.RELEASE_TEST_ROOT;
if (command !== 'release' || tag !== 'v0.2.2') process.exit(2);
const remote = path.join(root, 'remote');
if (action === 'view') {
  console.log(args.includes('isDraft') ? fs.readFileSync(path.join(root, 'draft'), 'utf8') : fs.readdirSync(remote).join('\\n'));
} else if (action === 'download') {
  const name = args[args.indexOf('--pattern') + 1];
  fs.copyFileSync(path.join(remote, name), path.join(args[args.indexOf('--dir') + 1], name));
} else if (action === 'upload') {
  fs.copyFileSync(args[0], path.join(remote, path.basename(args[0])), fs.constants.COPYFILE_EXCL);
} else if (action === 'edit') {
  if (!args.includes('--draft=false')) process.exit(2);
  fs.writeFileSync(path.join(root, 'draft'), 'false');
} else process.exit(2);
`, { mode: 0o755 });
  return {
    dir,
    run: () => spawnSync('bash', [script, 'v0.2.2', path.join(dir, 'local')], {
      encoding: 'utf8', env: { ...process.env, RELEASE_TEST_ROOT: dir, PATH: `${dir}/bin:${process.env.PATH}` },
    }),
    draft: () => fs.readFileSync(path.join(dir, 'draft'), 'utf8'),
    assets: () => fs.readdirSync(path.join(dir, 'remote')).sort(),
  };
}
test('uploads every artifact before publishing, and retries without replacing assets', t => {
  const f = fixture(t);
  let result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.draft(), 'false');
  assert.deepEqual(f.assets(), [...names].sort());
  result = f.run();
  assert.equal(result.status, 0, result.stderr);
});
test('resumes a partially uploaded draft', t => {
  const f = fixture(t, true, names.slice(0, 3));
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.draft(), 'false');
  assert.deepEqual(f.assets(), [...names].sort());
});
test('refuses different bytes and leaves the release unpublished', t => {
  const f = fixture(t, true, [names[0]]);
  fs.writeFileSync(path.join(f.dir, 'remote', names[0]), 'different bytes');
  assert.notEqual(f.run().status, 0);
  assert.equal(f.draft(), 'true');
  assert.deepEqual(f.assets(), [names[0]]);
});
test('does not add missing assets to a public release', t => {
  const f = fixture(t, false, [names[0]]);
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /refusing to modify/);
  assert.deepEqual(f.assets(), [names[0]]);
});
