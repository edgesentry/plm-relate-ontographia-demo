// Tests for the fail-fast test preflight and the after-suite dist-clean guard.
//
// Every failure fixture uses a temporary git repository, so the real Genesis
// submodule and the committed farmbot/dist tree are never mutated.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';

import {
  REQUIRED_NODE_MAJOR,
  checkGenesisSubmodule,
  checkNodeVersion,
  nodeMajor,
  readGitlinkPin,
} from '../scripts/test-preflight.mjs';
import { findTrackedChanges } from '../scripts/test-dist-clean.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const INIT_HINT = 'git submodule update --init farmbot/third_party/farmbot-genesis';

const temporaryDirectories = [];

function tempDir(prefix) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

after(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function git(cwd, args) {
  return spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
}

function commitAll(dir, message) {
  assert.equal(git(dir, ['add', '.']).status, 0);
  const commit = spawnSync(
    'git',
    ['-C', dir, '-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-q', '-m', message],
    { encoding: 'utf8' },
  );
  assert.equal(commit.status, 0, commit.stderr);
}

function initRepo(dir) {
  assert.equal(spawnSync('git', ['init', '-q', dir]).status, 0);
  writeFileSync(join(dir, 'README.md'), 'fixture\n');
  commitAll(dir, 'fixture');
  return git(dir, ['rev-parse', 'HEAD']).stdout.trim();
}

test('Node 22 passes the version check', () => {
  assert.equal(REQUIRED_NODE_MAJOR, 22);
  assert.equal(nodeMajor('v22.23.4'), 22);
  const result = checkNodeVersion('v22.23.4');
  assert.equal(result.ok, true);
  assert.equal(result.major, 22);
});

test('a non-22 Node major fails with the required and found version', () => {
  for (const version of ['v20.11.1', 'v24.0.0']) {
    const result = checkNodeVersion(version);
    assert.equal(result.ok, false);
    assert.match(result.message, new RegExp(`major ${REQUIRED_NODE_MAJOR}`));
    assert.ok(result.message.includes(version), result.message);
    assert.match(result.message, /PATH/);
    assert.doesNotMatch(result.message, /npx/i);
  }
});

test('the live checkout has a readable gitlink pin', () => {
  const result = readGitlinkPin(ROOT);
  assert.equal(result.ok, true, result.message);
  assert.match(result.pin, /^[0-9a-f]{40}$/);
});

test('the live Genesis submodule is initialized at its pinned commit', () => {
  const result = checkGenesisSubmodule({ root: ROOT });
  assert.equal(result.ok, true, result.message);
});

test('a missing submodule directory fails and names the pin and the command', () => {
  const expectedPin = 'a'.repeat(40);
  const result = checkGenesisSubmodule({
    submoduleDir: join(tempDir('farmbot-preflight-missing-'), 'farmbot-genesis'),
    expectedPin,
  });
  assert.equal(result.ok, false);
  assert.ok(result.message.includes(expectedPin), result.message);
  assert.match(result.message, /missing/);
  assert.ok(result.message.includes(INIT_HINT), result.message);
});

test('an empty submodule directory fails', () => {
  const directory = join(tempDir('farmbot-preflight-empty-'), 'farmbot-genesis');
  mkdirSync(directory);
  const result = checkGenesisSubmodule({ submoduleDir: directory, expectedPin: 'b'.repeat(40) });
  assert.equal(result.ok, false);
  assert.match(result.message, /empty/);
  assert.ok(result.message.includes(INIT_HINT), result.message);
});

test('a directory that is not a git checkout fails', () => {
  const directory = join(tempDir('farmbot-preflight-plain-'), 'farmbot-genesis');
  mkdirSync(directory);
  writeFileSync(join(directory, 'README.md'), 'not a checkout\n');
  const result = checkGenesisSubmodule({ submoduleDir: directory, expectedPin: 'c'.repeat(40) });
  assert.equal(result.ok, false);
  assert.match(result.message, /not a git checkout/);
  assert.ok(result.message.includes(INIT_HINT), result.message);
});

test('a checkout at a different commit fails and names both pins', () => {
  const directory = join(tempDir('farmbot-preflight-wrong-'), 'farmbot-genesis');
  const actual = initRepo(directory);
  const expectedPin = 'd'.repeat(40);
  const result = checkGenesisSubmodule({ submoduleDir: directory, expectedPin });
  assert.equal(result.ok, false);
  assert.ok(result.message.includes(expectedPin), result.message);
  assert.ok(result.message.includes(actual), result.message);
  assert.ok(result.message.includes(INIT_HINT), result.message);
});

test('a checkout at the expected commit passes', () => {
  const directory = join(tempDir('farmbot-preflight-ok-'), 'farmbot-genesis');
  const actual = initRepo(directory);
  const result = checkGenesisSubmodule({ submoduleDir: directory, expectedPin: actual });
  assert.equal(result.ok, true, result.message);
  assert.equal(result.pin, actual);
});

test('the dist-clean guard ignores an unchanged tracked tree', () => {
  const directory = tempDir('farmbot-dist-clean-ok-');
  initRepo(directory);
  mkdirSync(join(directory, 'farmbot', 'dist'), { recursive: true });
  writeFileSync(join(directory, 'farmbot/dist/farmbot.seed.json'), '{"nodes":[]}\n');
  commitAll(directory, 'add dist');

  const result = findTrackedChanges({ cwd: directory, relativePath: 'farmbot/dist' });
  assert.equal(result.message, undefined);
  assert.deepEqual(result.changes, []);
});

test('the dist-clean guard fails on a modified tracked file', () => {
  const directory = tempDir('farmbot-dist-clean-modified-');
  initRepo(directory);
  mkdirSync(join(directory, 'farmbot', 'dist'), { recursive: true });
  writeFileSync(join(directory, 'farmbot/dist/farmbot.seed.json'), '{"nodes":[]}\n');
  commitAll(directory, 'add dist');
  writeFileSync(join(directory, 'farmbot/dist/farmbot.seed.json'), '{"nodes":[1]}\n');

  const result = findTrackedChanges({ cwd: directory, relativePath: 'farmbot/dist' });
  assert.equal(result.changes.length, 1);
  assert.ok(result.changes[0].includes('farmbot/dist/farmbot.seed.json'));
});

test('the dist-clean guard fails on a deleted tracked file', () => {
  const directory = tempDir('farmbot-dist-clean-deleted-');
  initRepo(directory);
  mkdirSync(join(directory, 'farmbot', 'dist'), { recursive: true });
  writeFileSync(join(directory, 'farmbot/dist/farmbot.seed.json'), '{"nodes":[]}\n');
  commitAll(directory, 'add dist');
  rmSync(join(directory, 'farmbot/dist/farmbot.seed.json'));

  const result = findTrackedChanges({ cwd: directory, relativePath: 'farmbot/dist' });
  assert.equal(result.changes.length, 1);
  assert.ok(result.changes[0].includes('farmbot/dist/farmbot.seed.json'));
});
