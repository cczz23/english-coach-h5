const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const words = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'words.json'), 'utf8'));
const STOP = new Set('a an the to of and or for on in at is are was were be been being it this that we you i they he she my our your their with from by as if so but not just about'.split(' '));

function tokens(line) {
  return new Set(
    line.replace(/\[\[|\]\]/g, '').toLowerCase().match(/[a-z0-9']+/g)
      .filter(w => !STOP.has(w))
  );
}

test('every word has one Stage A line and five distinct Stage B scenes', () => {
  assert.equal(words.length, 126);
  for (const w of words) {
    assert.equal(w.examples_stage_a.length, 1, w.id + ' stage A');
    assert.equal(w.examples_stage_b.length, 5, w.id + ' stage B');
    const sets = [];
    for (const line of w.examples_stage_b) {
      assert.match(line, /\[\[[^\]]+\]\]/, w.id + ' highlight');
      const t = tokens(line);
      for (const prev of sets) {
        const inter = [...t].filter(x => prev.has(x)).length;
        const union = new Set([...t, ...prev]).size;
        assert.ok(inter / union < 0.55, w.id + ' near-duplicate: ' + line);
      }
      sets.push(t);
    }
  }
});
