# Mathematical contract

Source: Ainsley Leopold-James, *IDMHYSI EssenceFusion Algorithm*, 2 February 2026,
sections 2.2–2.4, equations 3–9. The implementation operates on two supplied vectors
`q` and `c` with the same dimension. It implements the fusion stage described by
those equations.

For each nonzero vector, form probabilities from absolute component magnitudes:

```text
p[i] = abs(v[i]) / sum(abs(v))
H(v) = -sum(p[i] * log2(p[i]))
```

Zero-probability terms contribute zero. A zero vector is assigned entropy zero.
If both entropies are zero at floating-point precision, the entropy weight is
undefined and the calculation is rejected.

The structural potentials `Aq` and `Ac` are supplied inputs:

```text
structuralWeight = Aq / (Aq + Ac)
entropyWeight = H(q) / (H(q) + H(c))
alpha = clamp(0.7 * structuralWeight + 0.3 * entropyWeight, 0.05, 0.95)
fused = alpha * q + (1 - alpha) * c
disagreement = norm(q - c) * min(alpha, 1 - alpha)
confidence = (1 - abs(H(q) - H(c)) / max(H(q), H(c)))
             * (1 - disagreement / norm(fused))
```

Norms are Euclidean. The blend is evaluated with scale-normalized arithmetic to
preserve equal subnormal components. Calculations use JavaScript's finite
double-precision numbers; they are numerical evaluations rather than symbolic
proofs.

## Input and output rules

- Each vector contains 2–128 finite numeric values with absolute magnitude at
  most 1,000,000. Vector dimensions must match.
- Potentials are finite numbers between zero and 1,000,000, with a positive sum.
- Text inputs accept decimal and scientific notation separated by commas or
  whitespace. Expressions, non-finite values, and missing comma-separated values
  are rejected. Text lengths are bounded before parsing.
- A zero fused norm makes the confidence index undefined, returned as `null`.
- The confidence index can be negative and is retained as the raw mathematical
  value. It is not presented as a probability or a measured accuracy estimate.
- A confidence result outside finite numeric precision is rejected with an
  actionable error.

The zero-vector convention, rejection of zero denominators, and undefined
confidence behavior make the numerical domain explicit. Tests cover the source
equations, symmetry, equal inputs, scale behavior, bounds, malformed input, and
degenerate cases. Hardware execution, learned potentials, essence extraction,
and broader architectural modules are outside this calculator's contract.
