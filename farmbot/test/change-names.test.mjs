// Name matching for the Change Log rules, with fixtures built from the
// committed seed rows. The three collision shapes the rule must survive are a
// case difference, two display names that normalize to one key, and a changed
// part whose name equals an unmatched name.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  isRemovalStatement,
  matchChangeNames,
  normalizeName,
  stripWikilinks,
} from '../../src/farmbot/agent/names.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const seed = JSON.parse(
  readFileSync(resolve(ROOT, 'farmbot/dist/farmbot.seed.json'), 'utf8'),
);

const designChanges = seed.nodes
  .filter((node) => node.labels.includes('DesignChange'))
  .map((node) => ({ id: node.id, text: node.properties.text }));
const partByName = new Map(
  seed.nodes
    .filter((node) => node.labels.includes('Part'))
    .map((node) => [node.properties.name, node]),
);

function changeWith(text) {
  const change = designChanges.find((entry) => entry.text.includes(text));
  assert.ok(change, `the committed Change Log has no unit containing ${JSON.stringify(text)}`);
  return change;
}

const teeNutsNote = changeWith('drop-in tee nuts');
const ptfeNote = changeWith('PTFE tape');
const woodScrewNote = changeWith('black oxide Phillips drive wood screws');
const trackNote = changeWith('New in this version of FarmBot Genesis');

function downstream(displayName, resolvedPart = null) {
  return { displayName, resolvedPart };
}

test('a case difference and two names that normalize to one key merge', () => {
  assert.equal(normalizeName('Tee Nuts'), normalizeName('tee nuts'));
  const matches = matchChangeNames({
    changes: [teeNutsNote],
    changedParts: [],
    downstream: [downstream('Tee Nuts'), downstream('tee nuts')],
  });
  assert.equal(matches.length, 1, 'the two names must produce one finding');
  const [match] = matches;
  assert.equal(match.key, 'tee nuts');
  assert.equal(match.inferred, true);
  assert.equal(match.displayName, 'Tee Nuts');
  assert.deepEqual(match.downstreamIndexes, [0, 1]);
});

test('a changed part whose name equals an unmatched name stays one fact', () => {
  // The committed seed has no part named Tee Nuts, so this fixture combines the
  // real Change Log statement and the real unmatched display names with a
  // changed part whose name is the collision case the rule must handle.
  const matches = matchChangeNames({
    changes: [teeNutsNote],
    changedParts: [
      { changeId: teeNutsNote.id, partId: 'part:Tee Nuts', partName: 'Tee Nuts' },
    ],
    downstream: [downstream('Tee Nuts', 'Tee Nuts'), downstream('tee nuts')],
  });
  assert.equal(matches.length, 1, 'the link and the prose must not split into two findings');
  const [match] = matches;
  assert.equal(match.key, 'Tee Nuts');
  assert.equal(match.inferred, false, 'the linked fact wins');
  assert.deepEqual(match.downstreamIndexes, [0, 1]);
  assert.deepEqual(match.changeIds, [teeNutsNote.id]);
});

test('a linked replacement hides the old name in the same statement', () => {
  const part = partByName.get('T25 Wood Screw');
  assert.ok(part, 'the committed seed has no T25 Wood Screw part');
  const matches = matchChangeNames({
    changes: [woodScrewNote],
    changedParts: [
      { changeId: woodScrewNote.id, partId: part.id, partName: 'T25 Wood Screw' },
    ],
    downstream: [downstream('Wood Screws'), downstream('wood screws')],
  });
  assert.deepEqual(
    matches.filter((match) => match.downstreamIndexes.length > 0),
    [],
    'the replacement link must keep the old name out of the inference',
  );
});

test('a removed name that appears twice in one list is reported once', () => {
  const matches = matchChangeNames({
    changes: [ptfeNote],
    changedParts: [],
    downstream: [downstream('PTFE Tape'), downstream('Crop Stickers'), downstream('PTFE Tape')],
  });
  assert.equal(matches.length, 2);
  const ptfe = matches.find((match) => match.key === 'ptfe tape');
  assert.ok(ptfe, 'PTFE Tape is not reported');
  assert.deepEqual(ptfe.downstreamIndexes, [0, 2]);
  assert.equal(new Set(matches.map((match) => match.key)).size, matches.length);
});

test('input order does not change the matches', () => {
  const input = {
    changes: [teeNutsNote, ptfeNote, woodScrewNote],
    changedParts: [],
    downstream: [downstream('Tee Nuts'), downstream('PTFE Tape'), downstream('Crop Stickers')],
  };
  const forward = matchChangeNames(input);
  const reversedDownstream = [...input.downstream].reverse();
  const reversed = matchChangeNames({
    changes: [...input.changes].reverse(),
    changedParts: [],
    downstream: reversedDownstream,
  });
  const semantic = (matches, downstreamRows) =>
    matches.map((match) => ({
      ...match,
      downstream: match.downstreamIndexes
        .map((index) => downstreamRows[index].displayName)
        .sort(),
      downstreamIndexes: [],
    }));
  assert.deepEqual(
    semantic(reversed, reversedDownstream),
    semantic(forward, input.downstream),
  );
});

test('only a list item that removes or replaces something is a removal statement', () => {
  assert.equal(isRemovalStatement(teeNutsNote.text), true);
  assert.equal(isRemovalStatement(ptfeNote.text), true);
  assert.equal(isRemovalStatement(trackNote.text), false);
  assert.equal(isRemovalStatement('The new design also removes the need for supports.'), false);
  assert.equal(stripWikilinks(teeNutsNote.text).includes('[['), false);
});
