'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, compilePredicate, PredicateError } = require('../src/engine/predicate');

const ctx = { c: { type: 'api', props: { auth: 'none', logging: false, tags: ['pci'] }, score: 5 } };

test('predicate: comparison operators resolve nested facts', () => {
  assert.equal(evaluate({ fact: 'c.type', op: 'eq', value: 'api' }, ctx), true);
  assert.equal(evaluate({ fact: 'c.type', op: 'in', value: ['web_app', 'api'] }, ctx), true);
  assert.equal(evaluate({ fact: 'c.type', op: 'nin', value: ['api'] }, ctx), false);
  assert.equal(evaluate({ fact: 'c.score', op: 'gte', value: 5 }, ctx), true);
  assert.equal(evaluate({ fact: 'c.props.tags', op: 'contains', value: 'pci' }, ctx), true);
});

test('predicate: notTrue treats undeclared controls as absent', () => {
  assert.equal(evaluate({ fact: 'c.props.logging', op: 'notTrue' }, ctx), true);
  assert.equal(evaluate({ fact: 'c.props.mfa', op: 'notTrue' }, ctx), true);
  assert.equal(evaluate({ fact: 'c.props.mfa', op: 'absent' }, ctx), true);
  assert.equal(evaluate({ fact: 'c.nope.deeper', op: 'exists' }, ctx), false);
});

test('predicate: all / any / not compose, with empty-list identities', () => {
  const p = { all: [
    { fact: 'c.type', op: 'eq', value: 'api' },
    { any: [{ fact: 'c.props.auth', op: 'eq', value: 'oauth' }, { not: { fact: 'c.props.logging', op: 'truthy' } }] },
  ] };
  assert.equal(evaluate(p, ctx), true);
  assert.equal(evaluate({ all: [] }, ctx), true);
  assert.equal(evaluate({ any: [] }, ctx), false);
});

test('predicate: malformed predicates are rejected at compile time', () => {
  assert.throws(() => compilePredicate({ fact: 'x', op: 'regex', value: '.*' }), PredicateError);
  assert.throws(() => compilePredicate({ fact: 'x', op: 'eq' }), /requires "value"/);
  assert.throws(() => compilePredicate({ all: {} }), /must be an array/);
  assert.throws(() => compilePredicate({ all: [], extra: 1 }), /only key/);
  assert.throws(() => compilePredicate({ any: [{ op: 'eq', value: 1 }] }), /missing "fact".*any\[0\]/);
});

test('predicate: prototype keys are not resolvable as facts', () => {
  assert.equal(evaluate({ fact: 'c.constructor', op: 'exists' }, ctx), false);
  assert.equal(evaluate({ fact: '__proto__.toString', op: 'exists' }, ctx), false);
});
