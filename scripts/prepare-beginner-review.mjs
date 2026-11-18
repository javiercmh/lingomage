// Offline preparation of blinded packets for qualified human reviewers.
import fs from 'node:fs';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import assert from 'node:assert/strict';

const [baselineDir, updatedDir, outputDir] = process.argv.slice(2);
if (!baselineDir || !updatedDir || !outputDir) {
  throw Error('Usage: node scripts/prepare-beginner-review.mjs BASELINE UPDATED NEW_OUTPUT_DIR');
}
const read = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
const baseline = read(baselineDir, 'suite.json');
const updated = read(updatedDir, 'suite.json');
assert.notEqual(baseline.promptVersion, updated.promptVersion);
assert.equal(baseline.live, updated.live);
assert.deepEqual(baseline.selectedNotes, updated.selectedNotes);
assert.deepEqual(baseline.cases, updated.cases);
assert.equal(updated.cases.length, 16);

const packets = new Map();
const mapping = [];
for (const [index, spec] of updated.cases.entries()) {
  const records = [baselineDir, updatedDir].map(dir => read(dir, spec.id + '.json'));
  for (const [i, record] of records.entries()) {
    assert.equal(record.promptVersion, [baseline, updated][i].promptVersion);
    assert.ok(record.result?.title && record.result?.story && !record.error, spec.id);
  }
  const order = randomInt(2) ? [1, 0] : [0, 1];
  const pairId = 'pair-' + (index + 1);
  const { language, languageCode, difficulty, levelDescription, topic, currentChapter, recentProse } = spec.input;
  if (!packets.has(languageCode)) packets.set(languageCode, []);
  packets.get(languageCode).push({
    pairId, language, difficulty, levelDescription, topic, kind: spec.kind,
    sourceChapter: currentChapter ?? recentProse ?? null,
    samples: order.map((i, position) => ({
      label: ['A', 'B'][position], title: records[i].result.title, story: records[i].result.story,
    })),
  });
  mapping.push({ pairId, caseId: spec.id, A: records[order[0]].promptVersion, B: records[order[1]].promptVersion });
}

const write = (name, value) => fs.writeFileSync(path.join(outputDir, name), JSON.stringify(value, null, 2) + '\n');
fs.mkdirSync(outputDir);
for (const [languageCode, pairs] of packets) {
  write(languageCode + '.json', {
    live: updated.live,
    reviewer: { nameOrId: '', qualifications: '' },
    pairs: pairs.map(pair => ({
      ...pair,
      judgments: pair.samples.map(({ label }) => ({
        label, plotRelevantTerms: [], vocabularyUsefulness: '', levelFit: '', naturalness: '', continuity: '', materialIssues: [],
      })),
      betterSupport: '',
      comparisonReason: '',
    })),
  });
}
write('private-version-key.json', mapping);
