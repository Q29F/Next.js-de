import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computeFusion, entropy, parsePotential, parseVector } from '../lib/fusion.ts'

function close(actual, expected, tolerance = 1e-12) {
  assert.ok(Number.isFinite(actual), `Expected a finite result, received ${actual}`)
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} differs from ${expected}`)
}

function closeVector(actual, expected) {
  assert.equal(actual.length, expected.length)
  actual.forEach((value, index) => close(value, expected[index]))
}

function example(overrides = {}) {
  return { quantum: [1, 1], classical: [1, -1], quantumPotential: 1, classicalPotential: 1, ...overrides }
}

test('entropy has known values in bits, including zero components', () => {
  close(entropy([1, 1]), 1)
  close(entropy([1, 1, 1, 1]), 2)
  close(entropy([1, 3]), 0.8112781244591328)
  close(entropy(Array(128).fill(1)), 7)
  assert.equal(entropy([0, 0]), 0)
  assert.equal(entropy([1, 0]), 0)
})

test('entropy depends on magnitude distribution and is invariant under signs, scale and order', () => {
  const expected = entropy([1, 2, 0, 5])
  close(entropy([-1, 2, 0, -5]), expected)
  close(entropy([20, 40, 0, 100]), expected)
  close(entropy([5, 0, 2, 1]), expected)
})

test('balanced two-component fixture follows every fusion equation', () => {
  const result = computeFusion(example())
  assert.equal(result.dimension, 2)
  close(result.entropyQuantum, 1)
  close(result.entropyClassical, 1)
  close(result.structuralWeight, 0.5)
  close(result.entropyWeight, 0.5)
  close(result.alpha, 0.5)
  closeVector(result.fused, [1, 0])
  close(result.disagreement, 1)
  close(result.fusedNorm, 1)
  close(result.confidenceRaw, 0)
})

test('identical vectors retain their Euclidean norm and have full confidence', () => {
  const result = computeFusion(example({ quantum: [3, 4], classical: [3, 4], quantumPotential: 3 }))
  closeVector(result.fused, [3, 4])
  close(result.fusedNorm, 5)
  close(result.disagreement, 0)
  close(result.confidenceRaw, 1)
})

test('identical subnormal components are preserved by interpolation', () => {
  const smallest = Number.MIN_VALUE
  const result = computeFusion(example({ quantum: [smallest, smallest], classical: [smallest, smallest] }))
  assert.deepEqual(result.fused, [smallest, smallest])
  assert.ok(result.fusedNorm > 0)
  assert.equal(result.confidenceRaw, 1)
})

test('entropy retains representable contributions when probabilities underflow', () => {
  const smallest = Number.MIN_VALUE
  // Rounded values from an independent 400-digit evaluation of the entropy sum.
  assert.equal(entropy([1000, smallest]), smallest)
  assert.equal(entropy([10000, ...Array(127).fill(smallest)]), 14 * smallest)
  const vector = [1000, smallest]
  const result = computeFusion(example({ quantum: vector, classical: vector }))
  assert.equal(result.entropyQuantum, smallest)
  assert.equal(result.entropyClassical, smallest)
  assert.equal(result.alpha, 0.5)
  assert.deepEqual(result.fused, vector)
  assert.equal(result.confidenceRaw, 1)
})

test('unequal entropies produce the specified 70/30 weight and Euclidean disagreement', () => {
  const result = computeFusion(example({ classical: [1, 0] }))
  close(result.entropyWeight, 1)
  close(result.alpha, 0.65)
  closeVector(result.fused, [1, 0.65])
  close(result.disagreement, 0.35)
  close(result.fusedNorm, Math.sqrt(1.4225))
  close(result.confidenceRaw, 0)
})

test('the fusion coefficient is clamped at both specified endpoints', () => {
  const low = computeFusion(example({ quantum: [1, 0], classical: [1, 1], quantumPotential: 0 }))
  const high = computeFusion(example({ classical: [1, 0], classicalPotential: 0 }))
  close(low.alpha, 0.05)
  close(high.alpha, 0.95)
  closeVector(low.fused, [1, 0.95])
  closeVector(high.fused, [1, 0.95])
})

test('exchanging channels and potentials preserves the fused vector and confidence', () => {
  const input = { quantum: [0.8, 0.3, 0.1, 0.4], classical: [0.2, 0.6, 0.5, 0.3], quantumPotential: 3, classicalPotential: 2 }
  const first = computeFusion(input)
  const exchanged = computeFusion({ quantum: input.classical, classical: input.quantum, quantumPotential: 2, classicalPotential: 3 })
  close(first.alpha + exchanged.alpha, 1)
  closeVector(first.fused, exchanged.fused)
  close(first.disagreement, exchanged.disagreement)
  close(first.confidenceRaw, exchanged.confidenceRaw)
})

test('common vector and potential scaling preserve the appropriate invariants', () => {
  const input = { quantum: [0.8, -0.3, 0.1, 0.4], classical: [0.2, 0.6, -0.5, 0.3], quantumPotential: 3, classicalPotential: 2 }
  const original = computeFusion(input)
  const scaledVectors = computeFusion({ ...input, quantum: input.quantum.map(value => value * 7), classical: input.classical.map(value => value * 7) })
  close(scaledVectors.alpha, original.alpha)
  closeVector(scaledVectors.fused, original.fused.map(value => value * 7))
  close(scaledVectors.disagreement, original.disagreement * 7)
  close(scaledVectors.fusedNorm, original.fusedNorm * 7)
  close(scaledVectors.confidenceRaw, original.confidenceRaw)
  const scaledPotentials = computeFusion({ ...input, quantumPotential: 69, classicalPotential: 46 })
  close(scaledPotentials.alpha, original.alpha)
  closeVector(scaledPotentials.fused, original.fused)
})

test('each fused component stays between its two inputs', () => {
  for (const [quantumPotential, classicalPotential] of [[0, 1], [1, 0], [1, 1], [9, 1]]) {
    const input = { quantum: [-4, 2, 0, 6], classical: [3, -1, 2, -3], quantumPotential, classicalPotential }
    const result = computeFusion(input)
    assert.ok(result.alpha >= 0.05 && result.alpha <= 0.95)
    result.fused.forEach((value, index) => {
      assert.ok(value >= Math.min(input.quantum[index], input.classical[index]))
      assert.ok(value <= Math.max(input.quantum[index], input.classical[index]))
    })
  }
})

test('exact cancellation has an explicitly undefined confidence index', () => {
  const result = computeFusion(example({ classical: [-1, -1] }))
  closeVector(result.fused, [0, 0])
  assert.equal(result.fusedNorm, 0)
  assert.equal(result.confidenceRaw, null)
  close(result.disagreement, Math.sqrt(2))
})

test('a negative confidence index is preserved without clamping', () => {
  const result = computeFusion(example({ classical: [-0.9, -0.9] }))
  closeVector(result.fused, [0.05, 0.05])
  close(result.confidenceRaw, -18)
})

test('a zero channel entropy is valid when the other channel has entropy', () => {
  const result = computeFusion(example({ quantum: [0, 0], classical: [1, 1] }))
  close(result.alpha, 0.35)
  closeVector(result.fused, [0.65, 0.65])
  assert.equal(result.confidenceRaw, 0)
})

test('undefined total weights and confidence overflow are rejected', () => {
  assert.throws(() => computeFusion(example({ quantumPotential: 0, classicalPotential: 0 })), RangeError)
  assert.throws(() => computeFusion(example({ quantum: [1, 0], classical: [0, 1] })), RangeError)
  assert.throws(() => computeFusion(example({ quantum: [0, 0], classical: [0, 0] })), RangeError)
  const tiny = Number.MIN_VALUE * 2
  assert.throws(() => computeFusion(example({ quantum: [1, 1, tiny], classical: [-1, -1, tiny] })), RangeError)
})

test('computation preserves frozen input objects and vectors', () => {
  const input = Object.freeze({ quantum: Object.freeze([1, 1]), classical: Object.freeze([1, -1]), quantumPotential: 1, classicalPotential: 1 })
  computeFusion(input)
  assert.deepEqual(input, example())
})

test('vector parsing supports signed decimal and scientific notation without expressions', () => {
  assert.deepEqual(parseVector(' +1e-3, -.5 2.\n4E+0 '), [0.001, -0.5, 2, 4])
  assert.deepEqual(parseVector('-1000000, +1000000'), [-1_000_000, 1_000_000])
  for (const text of ['', ' ', '1,,2', ',1,2', '1,2,', '1, ,2', 'NaN,1', 'Infinity,1', '1e309,1', '0x10,1', '1/2,1', 'Math.random(),1', '1e6,1000001', '1 '.repeat(6_001)]) {
    assert.throws(() => parseVector(text), `Rejected vector: ${text.slice(0, 40)}`)
  }
})

test('potential parsing accepts the bounds and rejects malformed or excessive values', () => {
  assert.equal(parsePotential('0'), 0)
  assert.equal(parsePotential(' +1e6 '), 1_000_000)
  close(parsePotential('.125'), 0.125)
  for (const value of ['', '-1', '1000001', 'NaN', 'Infinity', '1e309', '0x10', '1+1', '1_000', '0'.repeat(129), true, null]) {
    assert.throws(() => parsePotential(value))
  }
})

test('negative potential text remains invalid when conversion would underflow to zero', () => {
  for (const value of ['-1e-999', '-.5e-999', '-1e-324']) {
    assert.throws(() => parsePotential(value), RangeError)
  }
  for (const value of ['-0', '-0.0e-999']) assert.ok(parsePotential(value) === 0)
  assert.equal(parsePotential('5e-324'), Number.MIN_VALUE)
})

test('dimension limits are inclusive and vector lengths must agree', () => {
  const boundary = Array(128).fill(1_000_000)
  const result = computeFusion(example({ quantum: boundary, classical: boundary, quantumPotential: 1_000_000, classicalPotential: 1_000_000 }))
  assert.equal(result.dimension, 128)
  close(result.confidenceRaw, 1)
  for (const vector of [[], [1], Array(129).fill(1)]) {
    assert.throws(() => computeFusion(example({ quantum: vector })), RangeError)
    assert.throws(() => entropy(vector), RangeError)
  }
  assert.throws(() => computeFusion(example({ classical: [1, 1, 1] })), RangeError)
})

test('the numeric API rejects malformed objects and nonfinite components or potentials', () => {
  for (const input of [null, undefined, true, '1,1', {}, { quantum: [1, 1] }]) {
    assert.throws(() => computeFusion(input))
  }
  for (const value of [NaN, Infinity, -Infinity, 1_000_001, -1_000_001, '1', null, true, undefined]) {
    assert.throws(() => computeFusion(example({ quantum: [value, 1] })))
  }
  for (const vector of ['1,1', new Float64Array([1, 1]), Array(2), null]) {
    assert.throws(() => computeFusion(example({ quantum: vector })))
  }
  for (const value of [-1, 1_000_001, NaN, Infinity, '1', null, true, undefined]) {
    assert.throws(() => computeFusion(example({ quantumPotential: value })))
  }
})
