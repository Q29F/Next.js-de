export const MIN_DIMENSION = 2
export const MAX_DIMENSION = 128
export const MAX_MAGNITUDE = 1_000_000
export const MAX_POTENTIAL = 1_000_000

export type FusionInput = {
  quantum: readonly number[]
  classical: readonly number[]
  quantumPotential: number
  classicalPotential: number
}

export type FusionResult = {
  dimension: number
  entropyQuantum: number
  entropyClassical: number
  structuralWeight: number
  entropyWeight: number
  alpha: number
  fused: number[]
  disagreement: number
  fusedNorm: number
  confidenceRaw: number | null
}

const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i
const maximumVectorTextLength = 12_000

function validateVector(vector: readonly number[], label: string): void {
  if (!Array.isArray(vector)) {
    throw new TypeError(`${label} must be an array of numbers.`)
  }
  if (vector.length < MIN_DIMENSION || vector.length > MAX_DIMENSION) {
    throw new RangeError(`${label} must contain between ${MIN_DIMENSION} and ${MAX_DIMENSION} values.`)
  }
  for (const value of vector) {
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > MAX_MAGNITUDE) {
      throw new RangeError(`${label} must contain finite numbers between -1,000,000 and 1,000,000.`)
    }
  }
}

function validatePotential(value: number, label: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_POTENTIAL) {
    throw new RangeError(`${label} must be a finite number from 0 to 1,000,000.`)
  }
}

function vectorEntropy(vector: readonly number[]): number {
  const totalMagnitude = vector.reduce((sum, value) => sum + Math.abs(value), 0)
  if (totalMagnitude === 0) return 0

  let result = 0
  let underflowNumerator = 0
  for (const value of vector) {
    const magnitude = Math.abs(value)
    const probability = magnitude / totalMagnitude
    if (probability > 0) result -= probability * Math.log2(probability)
    else if (magnitude > 0) {
      // The entropy term can remain representable when its probability does not.
      // Accumulate these numerators before dividing so their sum is retained.
      underflowNumerator += magnitude * (Math.log2(totalMagnitude) - Math.log2(magnitude))
    }
  }
  result += underflowNumerator / totalMagnitude
  return result === 0 ? 0 : result
}

/** Shannon entropy in bits of the normalized absolute component magnitudes. */
export function entropy(vector: readonly number[]): number {
  validateVector(vector, 'The vector')
  return vectorEntropy(vector)
}

/** Parse decimal values separated by commas, whitespace, or line breaks. */
export function parseVector(text: string): number[] {
  if (typeof text !== 'string' || text.length > maximumVectorTextLength) {
    throw new TypeError('Enter a vector using at most 12,000 characters.')
  }
  const trimmed = text.trim()
  if (!trimmed) throw new Error('Enter between 2 and 128 values for the vector.')
  if (/^,|,\s*(?:,|$)/.test(trimmed)) {
    throw new Error('A vector value is missing between commas.')
  }
  const tokens = trimmed.split(/[\s,]+/)
  if (tokens.some(token => !decimal.test(token))) {
    throw new Error('Use decimal numbers, separated by commas or spaces. Expressions are not supported.')
  }
  const vector = tokens.map(token => Number(token))
  validateVector(vector, 'The vector')
  return vector
}

/** Parse a nonnegative, finite structural potential without evaluating expressions. */
export function parsePotential(text: string): number {
  if (typeof text !== 'string' || text.length > 128 || !decimal.test(text.trim())) {
    throw new Error('Enter a number from 0 to 1,000,000 for the potential.')
  }
  // A negative nonzero coefficient stays invalid even if Number rounds it to -0.
  const coefficient = text.trim().split(/[eE]/, 1)[0]
  if (coefficient.startsWith('-') && /[1-9]/.test(coefficient)) {
    throw new RangeError('The potential must be nonnegative.')
  }
  const value = Number(text.trim())
  validatePotential(value, 'The potential')
  return value
}

/** Evaluate the fixed-vector EssenceFusion equations using Euclidean norms. */
export function computeFusion(input: FusionInput): FusionResult {
  if (input === null || typeof input !== 'object') {
    throw new TypeError('Supply both vectors and their structural potentials.')
  }
  const { quantum, classical, quantumPotential, classicalPotential } = input
  validateVector(quantum, 'Vector q')
  validateVector(classical, 'Vector c')
  if (quantum.length !== classical.length) {
    throw new RangeError('Vectors q and c must have the same number of values.')
  }
  validatePotential(quantumPotential, 'Potential Aq')
  validatePotential(classicalPotential, 'Potential Ac')
  const totalPotential = quantumPotential + classicalPotential
  if (totalPotential === 0) {
    throw new RangeError('The potentials cannot both be zero. Set at least one potential above zero.')
  }

  const entropyQuantum = vectorEntropy(quantum)
  const entropyClassical = vectorEntropy(classical)
  const totalEntropy = entropyQuantum + entropyClassical
  if (totalEntropy === 0) {
    throw new RangeError('Total entropy is zero at numeric precision. Use at least two nonzero components in one vector and avoid extreme magnitude ratios.')
  }

  const structuralWeight = quantumPotential / totalPotential
  const entropyWeight = entropyQuantum / totalEntropy
  const alpha = Math.max(0.05, Math.min(0.95, 0.7 * structuralWeight + 0.3 * entropyWeight))
  const fused = quantum.map((value, index) => {
    const other = classical[index]
    const scale = Math.max(Math.abs(value), Math.abs(other))
    return scale === 0 ? 0 : scale * (alpha * (value / scale) + (1 - alpha) * (other / scale))
  })
  const fusedNorm = Math.hypot(...fused)
  const disagreement = Math.hypot(...quantum.map((value, index) => value - classical[index])) * Math.min(alpha, 1 - alpha)
  const entropyAgreement = 1 - Math.abs(entropyQuantum - entropyClassical) / Math.max(entropyQuantum, entropyClassical)
  const confidenceRaw = fusedNorm === 0
    ? null
    : entropyAgreement === 0
      ? 0
      : entropyAgreement * (1 - disagreement / fusedNorm)

  if (confidenceRaw !== null && !Number.isFinite(confidenceRaw)) {
    throw new RangeError('The confidence index exceeds numeric precision because the fused norm is too small. Adjust the vectors to reduce cancellation.')
  }

  return {
    dimension: quantum.length,
    entropyQuantum,
    entropyClassical,
    structuralWeight,
    entropyWeight,
    alpha,
    fused,
    disagreement,
    fusedNorm,
    confidenceRaw,
  }
}
