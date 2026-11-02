// Unit tests for the server-side exam grading helpers.
// Run after `npm run build`:  node --test test/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { splitBlueprintQuestions, gradeBlueprintAnswers, normalizeAnswers } = require('../lib/exam-grading.js');

const question = (id, order, correctAnswers, extra = {}) => ({
  id,
  order,
  prompt: `Question ${id}`,
  mode: correctAnswers.length > 1 ? 'multi' : 'single',
  options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }],
  correctAnswers,
  ...extra,
});

test('splitBlueprintQuestions removes answers and explanations from public questions', () => {
  const { publicQuestions, answers, changed } = splitBlueprintQuestions([
    question('q1', 1, ['a'], { explanation: 'Because A.' }),
    question('q2', 2, ['b', 'c']),
  ]);
  assert.equal(changed, true);
  for (const q of publicQuestions) {
    assert.equal('correctAnswers' in q, false);
    assert.equal('explanation' in q, false);
    assert.equal(q.options.length, 3);
  }
  assert.deepEqual(answers, {
    q1: { correctAnswers: ['a'], explanation: 'Because A.' },
    q2: { correctAnswers: ['b', 'c'] },
  });
});

test('splitBlueprintQuestions leaves already-clean questions alone and keys id-less ones', () => {
  const clean = splitBlueprintQuestions([{ id: 'q1', order: 1, prompt: 'x', options: [] }]);
  assert.equal(clean.changed, false);

  const noId = splitBlueprintQuestions([{ order: 1, prompt: 'x', options: [], correctAnswers: ['a'] }]);
  assert.equal(noId.changed, true);
  const id = noId.publicQuestions[0].id;
  assert.ok(id);
  assert.deepEqual(noId.answers[id], { correctAnswers: ['a'] });
});

test('gradeBlueprintAnswers grades against the private key', () => {
  const blueprint = {
    passingScore: 70,
    pointsPerQuestion: 10,
    questions: [
      { id: 'q1', order: 1, prompt: 'One', options: [{ id: 'a' }, { id: 'b' }] },
      { id: 'q2', order: 2, prompt: 'Two', options: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
      { id: 'q3', order: 3, prompt: 'Three', options: [{ id: 'a' }, { id: 'b' }] },
    ],
  };
  const key = {
    q1: { correctAnswers: ['a'], explanation: 'A is right.' },
    q2: { correctAnswers: ['b', 'c'] },
    q3: { correctAnswers: ['b'] },
  };
  const result = gradeBlueprintAnswers(blueprint, key, { q1: ['a'], q2: ['c', 'b'], q3: ['a'] });
  assert.equal(result.correct, 2);
  assert.equal(result.total, 3);
  assert.equal(result.percent, 67);
  assert.equal(result.passed, false);
  assert.equal(result.details[0].explanation, 'A is right.');
  assert.deepEqual(result.details[1].correct, ['b', 'c']);
});

test('gradeBlueprintAnswers ignores option ids that do not exist and partial multi answers', () => {
  const blueprint = {
    passingScore: 50,
    questions: [{ id: 'q1', order: 1, prompt: 'One', options: [{ id: 'a' }, { id: 'b' }] }],
  };
  const key = { q1: { correctAnswers: ['a', 'b'] } };
  assert.equal(gradeBlueprintAnswers(blueprint, key, { q1: ['a'] }).correct, 0);
  assert.equal(gradeBlueprintAnswers(blueprint, key, { q1: ['a', 'zzz'] }).correct, 0);
  assert.equal(gradeBlueprintAnswers(blueprint, key, { q1: ['b', 'a', 'a'] }).correct, 1);
});

test('gradeBlueprintAnswers honours per-question points and the passing score', () => {
  const blueprint = {
    passingScore: 80,
    pointsPerQuestion: 10,
    questions: [
      { id: 'q1', order: 1, prompt: 'Heavy', points: 40, options: [{ id: 'a' }] },
      { id: 'q2', order: 2, prompt: 'Light', options: [{ id: 'a' }, { id: 'b' }] },
    ],
  };
  const key = { q1: { correctAnswers: ['a'] }, q2: { correctAnswers: ['b'] } };
  const result = gradeBlueprintAnswers(blueprint, key, { q1: ['a'], q2: ['a'] });
  assert.equal(result.percent, 80);
  assert.equal(result.passed, true);
});

test('gradeBlueprintAnswers falls back to legacy embedded answers but refuses an incomplete key', () => {
  const legacy = { questions: [question('q1', 1, ['a'])] };
  assert.equal(gradeBlueprintAnswers(legacy, {}, { q1: ['a'] }).percent, 100);

  const missing = { questions: [{ id: 'q1', order: 1, prompt: 'x', options: [{ id: 'a' }] }] };
  assert.throws(() => gradeBlueprintAnswers(missing, {}, { q1: ['a'] }), /answer key is incomplete/);
  assert.throws(() => gradeBlueprintAnswers({ questions: [] }, {}, {}), /no questions/);
});

test('normalizeAnswers keeps only string choice lists', () => {
  assert.deepEqual(normalizeAnswers({ q1: ['a', 2, { x: 1 }], q2: 'a' }), { q1: ['a', '2'], q2: [] });
  assert.deepEqual(normalizeAnswers(null), {});
});
