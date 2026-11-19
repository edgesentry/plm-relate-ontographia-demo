#!/usr/bin/env node
// Fail when the FarmBot tests left a tracked file under farmbot/dist deleted or
// modified. Untracked (gitignored) build outputs such as a local duckdb file do
// not count. Run after the test runner exits, never inside it.

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '..', '..');
export const DIST_RELATIVE = 'farmbot/dist';

/**
 * Tracked changes under `relativePath`, as `git status --porcelain` lines.
 *
 * @param {{ cwd?: string, relativePath?: string }} [options]
 * @returns {{ changes: string[], message?: string }}
 */
export function findTrackedChanges(options = {}) {
  const cwd = options.cwd ?? ROOT;
  const relativePath = options.relativePath ?? DIST_RELATIVE;
  const result = spawnSync(
    'git',
    ['status', '--porcelain', '--untracked-files=no', '--', relativePath],
    { cwd, encoding: 'utf8' },
  );
  if (result.error && result.error.code === 'ENOENT') {
    return {
      changes: [],
      message:
        'git is not available, so the FarmBot tests cannot prove that tracked ' +
        `files under ${relativePath} are unchanged. Install git and rerun the suite.`,
    };
  }
  if (result.status !== 0) {
    return {
      changes: [],
      message: `git status failed (exit ${result.status ?? 'signal'}): ${(result.stderr || '').trim()}`,
    };
  }
  return {
    changes: result.stdout
      .split('\n')
      .map((line) => line.trimEnd())
      .filter(Boolean),
  };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const result = findTrackedChanges();
  if (result.message) {
    process.stderr.write(`\n${result.message}\n`);
    process.exitCode = 1;
  } else if (result.changes.length > 0) {
    process.stderr.write(
      `\nTracked files under ${DIST_RELATIVE} changed during the FarmBot tests:\n` +
        `${result.changes.map((line) => `  ${line}`).join('\n')}\n` +
        'The suite must write build outputs to a temporary directory instead.\n',
    );
    process.exitCode = 1;
  } else {
    process.stdout.write(`dist clean: tracked files under ${DIST_RELATIVE} are unchanged\n`);
  }
}
