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

test('every word has usage speak or rw, and rw has 1–2 sayInstead', () => {
  assert.equal(words.length, 176);
  const speakExamples = ['circle back', 'heads-up', 'traction', 'pragmatic', 'plausible'];
  const rwExamples = {
    precarious: ['unstable', 'shaky'],
    tenuous: ['weak', 'thin'],
    elusive: ['hard to pin down', 'slippery'],
    ubiquitous: ['everywhere', 'all over'],
    exacerbate: ['make worse', 'worsen']
  };
  const byTerm = new Map(words.map(w => [w.term, w]));
  for (const term of speakExamples) {
    assert.equal(byTerm.get(term).usage, 'speak', term);
    assert.ok(byTerm.get(term).sayInstead == null, term + ' omits sayInstead');
  }
  for (const [term, alts] of Object.entries(rwExamples)) {
    assert.equal(byTerm.get(term).usage, 'rw', term);
    assert.deepEqual(byTerm.get(term).sayInstead, alts, term);
  }
  const added = words.filter(w => Number(String(w.id).slice(1)) >= 263);
  assert.equal(added.length, 50);
  const tally = {};
  for (const w of added) tally[w.track + '/' + w.usage] = (tally[w.track + '/' + w.usage] || 0) + 1;
  assert.deepEqual(tally, { 'business/speak': 24, 'advanced/speak': 18, 'advanced/rw': 8 });
  for (const w of words) {
    assert.ok(w.usage === 'speak' || w.usage === 'rw', w.id + ' usage');
    if (w.usage === 'rw') {
      assert.ok(Array.isArray(w.sayInstead), w.id + ' sayInstead');
      assert.ok(w.sayInstead.length >= 1 && w.sayInstead.length <= 2, w.id + ' sayInstead count');
      for (const alt of w.sayInstead) {
        assert.equal(typeof alt, 'string', w.id);
        assert.ok(alt.trim().length > 0, w.id + ' empty alternative');
      }
    } else {
      assert.ok(w.sayInstead == null || (Array.isArray(w.sayInstead) && w.sayInstead.length === 0), w.id + ' speak sayInstead');
    }
  }
});

test('every word has one Stage A line and five distinct Stage B scenes', () => {
  assert.equal(words.length, 176);
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
