#!/usr/bin/env node
// Fail-fast preflight for the FarmBot test commands.
//
// Run before `node --test` so a missing Genesis submodule or a wrong Node major
// fails immediately with an actionable message instead of a broken test run.
// The expected Genesis pin is read from the superproject gitlink, so it cannot
// drift from the checkout. `--node-only` runs just the version check; the smoke
// scripts need Node 22 but do not extract the Genesis submodule.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '..', '..');
export const GENESIS_RELATIVE = 'farmbot/third_party/farmbot-genesis';
export const REQUIRED_NODE_MAJOR = 22;

function git(args, cwd) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' });
}

/**
 * The major version of a `process.version` string.
 *
 * @param {string} [version]
 * @returns {number | null}
 */
export function nodeMajor(version = process.version) {
  const major = Number.parseInt(String(version).replace(/^v/, ''), 10);
  return Number.isNaN(major) ? null : major;
}

/**
 * Require the running Node major.
 *
 * @param {string} [version]
 * @returns {{ ok: boolean, major: number | null, message?: string }}
 */
export function checkNodeVersion(version = process.version) {
  const major = nodeMajor(version);
  if (major === REQUIRED_NODE_MAJOR) return { ok: true, major };
  return {
    ok: false,
    major,
    message:
      `The FarmBot tests require Node major ${REQUIRED_NODE_MAJOR}, but this process is ` +
      `${version} (major ${major ?? 'unknown'}). Install Node ${REQUIRED_NODE_MAJOR} and ` +
      'put it first on PATH so that `node -v` reports a v22 version.',
  };
}

/**
 * The commit the superproject pins for the Genesis submodule.
 *
 * @param {string} [root]
 * @returns {{ ok: boolean, pin?: string, message?: string }}
 */
export function readGitlinkPin(root = ROOT) {
  const result = git(['rev-parse', `HEAD:${GENESIS_RELATIVE}`], root);
  if (result.status !== 0) {
    return {
      ok: false,
      message:
        `Cannot read the FarmBot Genesis pin from the superproject gitlink ` +
        `(${GENESIS_RELATIVE}): ` +
        `${(result.stderr || '').trim() || 'git rev-parse failed'}.`,
    };
  }
  return { ok: true, pin: result.stdout.trim() };
}

/**
 * Require the Genesis submodule to be a git checkout at the pinned commit.
 *
 * @param {{ root?: string, submoduleDir?: string, expectedPin?: string }} [options]
 *   `submoduleDir` and `expectedPin` exist for tests: point the check at a
 *   fixture directory and pin without mutating the real submodule.
 * @returns {{ ok: boolean, pin?: string, message?: string }}
 */
export function checkGenesisSubmodule(options = {}) {
  const root = options.root ?? ROOT;
  const submoduleDir = resolve(options.submoduleDir ?? join(root, GENESIS_RELATIVE));

  let expected = options.expectedPin;
  if (!expected) {
    const pin = readGitlinkPin(root);
    if (!pin.ok) return pin;
    expected = pin.pin;
  }

  const describe = (state) =>
    `The FarmBot Genesis submodule at ${GENESIS_RELATIVE} is not usable: ` +
    `expected pin ${expected}, ${state}. ` +
    `Initialize it with: git submodule update --init ${GENESIS_RELATIVE}`;

  let stats;
  try {
    stats = statSync(submoduleDir);
  } catch {
    return { ok: false, pin: expected, message: describe('the directory is missing') };
  }
  if (!stats.isDirectory()) {
    return { ok: false, pin: expected, message: describe('the path is not a directory') };
  }
  if (readdirSync(submoduleDir).length === 0) {
    return { ok: false, pin: expected, message: describe('the directory is empty') };
  }
  if (!existsSync(join(submoduleDir, '.git'))) {
    return { ok: false, pin: expected, message: describe('it is not a git checkout') };
  }
  const head = git(['rev-parse', 'HEAD'], submoduleDir);
  if (head.status !== 0) {
    return { ok: false, pin: expected, message: describe('its HEAD cannot be read') };
  }
  const actual = head.stdout.trim();
  if (actual !== expected) {
    return {
      ok: false,
      pin: expected,
      message: describe(`it is at ${actual || 'an unknown commit'}`),
    };
  }
  return { ok: true, pin: expected };
}

/**
 * Run the preflight checks and return every failure message.
 *
 * @param {{ argv?: string[], root?: string, version?: string }} [options]
 * @returns {string[]}
 */
export function runPreflight(options = {}) {
  const argv = options.argv ?? process.argv.slice(2);
  const root = options.root ?? ROOT;
  const version = options.version ?? process.version;
  const nodeOnly = argv.includes('--node-only');
  const failures = [];

  const node = checkNodeVersion(version);
  if (!node.ok) failures.push(node.message);

  if (!nodeOnly) {
    const submodule = checkGenesisSubmodule({ root });
    if (!submodule.ok) failures.push(submodule.message);
  }

  return failures;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const argv = process.argv.slice(2);
  const failures = runPreflight({ argv });
  if (failures.length > 0) {
    for (const message of failures) process.stderr.write(`\n${message}\n`);
    process.exitCode = 1;
  } else {
    const surfaced = argv.includes('--node-only') ? 'Node version' : 'Node version and Genesis pin';
    process.stdout.write(`preflight ok: ${surfaced} verified\n`);
  }
}
