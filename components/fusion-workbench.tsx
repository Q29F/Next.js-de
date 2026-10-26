'use client'

import { useId, useMemo, useState } from 'react'
import { computeFusion, parsePotential, parseVector } from '../lib/fusion'
import type { FusionInput, FusionResult } from '../lib/fusion'

type InputFields = {
  quantum: string
  classical: string
  quantumPotential: string
  classicalPotential: string
}

type Calculation = {
  input: FusionInput | null
  result: FusionResult | null
  error: string | null
  field: keyof InputFields | null
}

const presets = [
  {
    name: 'Balanced mix',
    description: 'Different vectors with a modest structural preference for q.',
    values: {
      quantum: '0.8, 0.3, 0.1, 0.4',
      classical: '0.2, 0.6, 0.5, 0.3',
      quantumPotential: '3',
      classicalPotential: '2',
    },
  },
  {
    name: 'Q emphasis',
    description: 'The same vectors with a stronger structural preference for q.',
    values: {
      quantum: '0.8, 0.3, 0.1, 0.4',
      classical: '0.2, 0.6, 0.5, 0.3',
      quantumPotential: '9',
      classicalPotential: '1',
    },
  },
  {
    name: 'Opposing channels',
    description: 'Equal and opposite vectors reveal the zero-norm confidence boundary.',
    values: {
      quantum: '1, 1, 0, 0',
      classical: '-1, -1, 0, 0',
      quantumPotential: '1',
      classicalPotential: '1',
    },
  },
] as const

function calculateFields(fields: InputFields): Calculation {
  let field: keyof InputFields | null = null
  try {
    field = 'quantum'
    const quantum = parseVector(fields.quantum)
    field = 'classical'
    const classical = parseVector(fields.classical)
    field = 'quantumPotential'
    const quantumPotential = parsePotential(fields.quantumPotential)
    field = 'classicalPotential'
    const classicalPotential = parsePotential(fields.classicalPotential)
    field = null
    const input = { quantum, classical, quantumPotential, classicalPotential }
    return { input, result: computeFusion(input), error: null, field: null }
  } catch (error) {
    return {
      input: null,
      result: null,
      error: error instanceof Error ? error.message : 'Check both vectors and their potentials.',
      field,
    }
  }
}

function formatNumber(value: number, digits = 4): string {
  if (value === 0) return '0'
  if (Math.abs(value) < 0.0001 || Math.abs(value) >= 1_000_000) return value.toExponential(3)
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value)
}

function VectorChart({ input, result }: { input: FusionInput; result: FusionResult }) {
  const chartId = useId()
  const width = Math.max(640, result.dimension * 48 + 96)
  const height = 276
  const left = 72
  const top = 22
  const plotHeight = 200
  const plotWidth = width - left - 24
  const baseline = top + plotHeight / 2
  const maximum = Math.max(...input.quantum.map(Math.abs), ...input.classical.map(Math.abs), ...result.fused.map(Math.abs)) || 1
  const groupWidth = plotWidth / result.dimension
  const barWidth = Math.min(20, groupWidth * 0.2)
  const channels = [
    { name: 'q', values: input.quantum, className: 'chart-q' },
    { name: 'c', values: input.classical, className: 'chart-c' },
    { name: 'fused', values: result.fused, className: 'chart-fused' },
  ]

  return (
    <section className="comparison-section" aria-labelledby={`${chartId}-heading`}>
      <div className="section-title-row">
        <div>
          <h3 id={`${chartId}-heading`}>Component comparison</h3>
          <p className="section-note">Original values and their weighted result.</p>
        </div>
        <ul className="chart-legend" aria-label="Chart legend">
          <li><span className="legend-dot legend-q" aria-hidden="true" />q</li>
          <li><span className="legend-dot legend-c" aria-hidden="true" />c</li>
          <li><span className="legend-dot legend-fused" aria-hidden="true" />Fused</li>
        </ul>
      </div>
      <div className="chart-scroll" tabIndex={0} role="region" aria-label="Scrollable component comparison">
        <svg className="vector-chart" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${chartId}-title ${chartId}-description`}>
          <title id={`${chartId}-title`}>Vector comparison</title>
          <desc id={`${chartId}-description`}>Grouped bars compare q, c and the fused value for {result.dimension} components. Exact values are available in the table below.</desc>
          {[maximum, 0, -maximum].map((tick, index) => {
            const y = top + index * plotHeight / 2
            return (
              <g key={index}>
                <line className={tick === 0 ? 'chart-baseline' : 'chart-gridline'} x1={left} y1={y} x2={width - 24} y2={y} />
                <text className="chart-axis-label" x={left - 12} y={y + 4} textAnchor="end">{formatNumber(tick)}</text>
              </g>
            )
          })}
          {result.fused.map((value, index) => (
            <g key={index}>
              {channels.map((channel, channelIndex) => {
                const component = channel.values[index]
                const barHeight = Math.abs(component / maximum) * plotHeight / 2
                const x = left + groupWidth * (index + 0.5) + (channelIndex - 1.5) * (barWidth + 2)
                return (
                  <rect key={channel.name} className={channel.className} x={x} y={component >= 0 ? baseline - barHeight : baseline} width={barWidth} height={barHeight} rx={2}>
                    <title>{`${channel.name}[${index + 1}] = ${formatNumber(component, 8)}`}</title>
                  </rect>
                )
              })}
              <text className="chart-axis-label" x={left + groupWidth * (index + 0.5)} y={height - 26} textAnchor="middle">{index + 1}</text>
            </g>
          ))}
          <text className="chart-axis-title" x={left + plotWidth / 2} y={height - 5} textAnchor="middle">Component</text>
        </svg>
      </div>
      <p className="scroll-note">Scroll the chart to view every component on smaller screens.</p>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Scrollable component values">
        <table className="vector-table">
          <caption>Component values</caption>
          <thead>
            <tr><th scope="col">Component</th><th scope="col">q</th><th scope="col">c</th><th scope="col">Fused</th></tr>
          </thead>
          <tbody>
            {result.fused.map((value, index) => (
              <tr key={index}>
                <th scope="row">{index + 1}</th>
                <td>{formatNumber(input.quantum[index], 8)}</td>
                <td>{formatNumber(input.classical[index], 8)}</td>
                <td className="fused-value">{formatNumber(value, 8)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="table-note">Values are rounded for display. The JSON file contains the full calculation.</p>
    </section>
  )
}

function FusionResults({ input, result }: { input: FusionInput; result: FusionResult }) {
  const qPercent = result.alpha * 100
  const cPercent = (1 - result.alpha) * 100

  return (
    <>
      <div className="result-overview">
        <section className="weight-panel" aria-labelledby="weight-heading">
          <div className="weight-title"><h3 id="weight-heading">Fusion weight <span aria-hidden="true">α</span></h3><span className="metric-unit">q share</span></div>
          <output className="weight-value" aria-label="Fusion weight alpha">{formatNumber(result.alpha)}</output>
          <div className="weight-labels"><span>q <strong>{formatNumber(qPercent, 1)}%</strong></span><span>c <strong>{formatNumber(cPercent, 1)}%</strong></span></div>
          <svg className="weight-bar" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true">
            <rect className="chart-c" x={0} y={0} width={100} height={8} rx={4} />
            <rect className="chart-q" x={0} y={0} width={qPercent} height={8} rx={4} />
          </svg>
          <p>70% structural weight + 30% entropy weight, bounded to 0.05–0.95.</p>
        </section>
        <section className="confidence-panel" aria-labelledby="confidence-heading">
          <div className="weight-title"><h3 id="confidence-heading">Confidence index</h3><span className="metric-unit">raw</span></div>
          <output className={result.confidenceRaw === null ? 'confidence-value confidence-undefined' : 'confidence-value'} aria-label="Confidence index">
            {result.confidenceRaw === null ? 'Undefined' : formatNumber(result.confidenceRaw)}
          </output>
          <p>{result.confidenceRaw === null
            ? 'The fused vector has zero norm, so this index is undefined.'
            : 'Negative values are possible. This index is not a probability.'}</p>
        </section>
      </div>
      <dl className="metric-grid">
        <div><dt>Entropy H(q)</dt><dd><output aria-label="Entropy H(q)">{formatNumber(result.entropyQuantum)}</output><span>bits</span></dd></div>
        <div><dt>Entropy H(c)</dt><dd><output aria-label="Entropy H(c)">{formatNumber(result.entropyClassical)}</output><span>bits</span></dd></div>
        <div><dt>Disagreement</dt><dd><output aria-label="Disagreement">{formatNumber(result.disagreement)}</output></dd></div>
      </dl>
      <dl className="weight-details">
        <div><dt>Structural weight</dt><dd>{formatNumber(result.structuralWeight)}</dd></div>
        <div><dt>Entropy weight</dt><dd>{formatNumber(result.entropyWeight)}</dd></div>
        <div><dt>Fused norm</dt><dd><output aria-label="Fused norm">{formatNumber(result.fusedNorm)}</output></dd></div>
      </dl>
      <VectorChart input={input} result={result} />
    </>
  )
}

export default function FusionWorkbench() {
  const [fields, setFields] = useState<InputFields>({ ...presets[0].values })
  const [activePreset, setActivePreset] = useState<string | null>(presets[0].name)
  const [actionMessage, setActionMessage] = useState('')
  const [downloadError, setDownloadError] = useState('')
  const calculation = useMemo(() => calculateFields(fields), [fields])
  const { input, result, error } = calculation

  function updateField(field: keyof InputFields, value: string) {
    setFields(current => ({ ...current, [field]: value }))
    setActivePreset(null)
    setActionMessage('')
    setDownloadError('')
  }

  function applyPreset(index: number) {
    setFields({ ...presets[index].values })
    setActivePreset(presets[index].name)
    setActionMessage(`${presets[index].name} loaded.`)
    setDownloadError('')
  }

  function downloadResult() {
    if (!input || !result) return
    try {
      const content = JSON.stringify({ model: 'EssenceFusion', input, result }, null, 2)
      const url = URL.createObjectURL(new Blob([`${content}\n`], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = 'fusion-result.json'
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1_000)
      setDownloadError('')
      setActionMessage('JSON download started.')
    } catch {
      setDownloadError('The download could not start. Please try again in this browser.')
    }
  }

  function describedBy(field: keyof InputFields, helpId: string) {
    return calculation.field === field ? `${helpId} input-error` : helpId
  }

  return (
    <>
      <a className="skip-link" href="#workbench">Skip to workbench</a>
      <header className="site-header">
        <div className="page-width header-inner">
          <a className="brand" href="/">IDMHYSI <span>systems</span></a>
          <span className="header-note">EssenceFusion</span>
        </div>
      </header>
      <main id="workbench" className="page-width main-content">
        <section className="intro" aria-labelledby="page-title">
          <div>
            <p className="eyebrow">Fixed-vector calculation</p>
            <h1 id="page-title">Fusion workbench</h1>
            <p className="intro-description">Compare two vectors using structural potentials and component entropy.</p>
          </div>
          <div className="local-note"><span className="local-dot" aria-hidden="true" /><span>Runs in your browser<br /><strong>Your inputs stay on this device</strong></span></div>
        </section>

        <div className="workbench-grid">
          <section className="panel input-panel" aria-labelledby="inputs-heading">
            <div className="panel-heading"><div><p className="section-number">01 / Inputs</p><h2 id="inputs-heading">Set your channels</h2></div><span className="small-badge">2–128 values</span></div>
            <div className="preset-section">
              <p className="field-caption">Start with an example</p>
              <div className="preset-list" aria-label="Input presets">
                {presets.map((preset, index) => <button type="button" className="preset-button" key={preset.name} aria-pressed={activePreset === preset.name} onClick={() => applyPreset(index)}>{preset.name}</button>)}
              </div>
              <p className="preset-description">{presets.find(preset => preset.name === activePreset)?.description ?? 'Custom inputs. Results update as you edit.'}</p>
            </div>
            <form className="input-form" aria-label="Fusion inputs" onSubmit={event => event.preventDefault()}>
              <div className="field-group">
                <div className="field-label-row"><label htmlFor="quantum-vector">Vector q</label><span className="channel-name"><span className="legend-dot legend-q" aria-hidden="true" />Quantum channel</span></div>
                <textarea id="quantum-vector" name="quantum-vector" rows={4} maxLength={12_000} spellCheck={false} autoCapitalize="off" value={fields.quantum} onChange={event => updateField('quantum', event.target.value)} aria-invalid={calculation.field === 'quantum' || undefined} aria-describedby={describedBy('quantum', 'quantum-help')} />
                <p className="field-help" id="quantum-help">Separate values with commas, spaces or line breaks.</p>
              </div>
              <div className="field-group">
                <div className="field-label-row"><label htmlFor="classical-vector">Vector c</label><span className="channel-name"><span className="legend-dot legend-c" aria-hidden="true" />Classical channel</span></div>
                <textarea id="classical-vector" name="classical-vector" rows={4} maxLength={12_000} spellCheck={false} autoCapitalize="off" value={fields.classical} onChange={event => updateField('classical', event.target.value)} aria-invalid={calculation.field === 'classical' || undefined} aria-describedby={describedBy('classical', 'classical-help')} />
                <p className="field-help" id="classical-help">Use the same number of values as q. Each value: −1,000,000 to 1,000,000.</p>
              </div>
              <fieldset className="potential-fields">
                <legend>Structural potentials</legend>
                <div className="potential-grid">
                  <div><label htmlFor="quantum-potential">Potential Aq</label><input id="quantum-potential" name="quantum-potential" type="text" inputMode="decimal" maxLength={128} value={fields.quantumPotential} onChange={event => updateField('quantumPotential', event.target.value)} aria-invalid={calculation.field === 'quantumPotential' || undefined} aria-describedby={describedBy('quantumPotential', 'potential-help')} /></div>
                  <div><label htmlFor="classical-potential">Potential Ac</label><input id="classical-potential" name="classical-potential" type="text" inputMode="decimal" maxLength={128} value={fields.classicalPotential} onChange={event => updateField('classicalPotential', event.target.value)} aria-invalid={calculation.field === 'classicalPotential' || undefined} aria-describedby={describedBy('classicalPotential', 'potential-help')} /></div>
                </div>
                <p className="field-help" id="potential-help">Supplied values from 0 to 1,000,000. At least one must be positive.</p>
              </fieldset>
              <div className="form-bottom"><span>Updates as you type</span><button type="button" className="text-button" onClick={() => { applyPreset(0); setActionMessage('Inputs reset to Balanced mix.') }}>Reset inputs</button></div>
            </form>
            <div className="input-guidance"><strong>About these channels</strong><p>q and c are the vectors you supply. This workbench evaluates the fixed-vector equations and uses your chosen structural potentials.</p></div>
          </section>

          <section className="panel result-panel" aria-labelledby="results-heading">
            <div className="panel-heading result-heading"><div><p className="section-number">02 / Result</p><h2 id="results-heading">See the fusion</h2></div><button type="button" className="button button-primary download-button" onClick={downloadResult} disabled={!result}>Download JSON<span aria-hidden="true">↓</span></button></div>
            <p className="result-context">{result ? `${result.dimension} matched components · Euclidean norms` : 'Waiting for valid inputs'}</p>
            {downloadError && <p className="error-message" role="alert">{downloadError}</p>}
            {error && <div id="input-error" className="input-error" role="alert"><h3>Check your inputs</h3><p>{error}</p></div>}
            {input && result ? <FusionResults input={input} result={result} /> : <div className="result-empty"><p className="eyebrow">Calculation paused</p><h3>Enter valid vectors and potentials.</h3><p>Correct the input above or choose a preset to continue.</p></div>}
            <p className="screen-reader-only" role="status" aria-live="polite">{actionMessage || (result ? `Results updated. Fusion weight ${formatNumber(result.alpha)}. Confidence index ${result.confidenceRaw === null ? 'undefined' : formatNumber(result.confidenceRaw)}.` : '')}</p>
          </section>
        </div>

        <details className="equations-panel">
          <summary><span>Equations &amp; interpretation</span><span className="summary-note">The calculation, step by step</span></summary>
          <div className="equations-content">
            <p>The EssenceFusion vector equations use normalized absolute magnitudes for entropy and the original signed values for fusion. All norms below are Euclidean.</p>
            <dl className="equation-list">
              <div><dt>01 / Entropy</dt><dd><code>pᵢ = |vᵢ| / Σ |vⱼ|<br />H(v) = −Σ pᵢ log₂(pᵢ)</code><p>Zero-probability terms contribute zero. An all-zero vector has entropy 0; a total channel entropy of 0 leaves the entropy weight undefined.</p></dd></div>
              <div><dt>02 / Weights</dt><dd><code>aStruct = Aq / (Aq + Ac)<br />aEntropy = H(q) / (H(q) + H(c))<br />α = clamp(0.7 aStruct + 0.3 aEntropy, 0.05, 0.95)</code></dd></div>
              <div><dt>03 / Fusion</dt><dd><code>fused = αq + (1 − α)c<br />disagreement = ‖q − c‖ · min(α, 1 − α)</code><p>The weights blend the supplied vectors component by component.</p></dd></div>
              <div><dt>04 / Raw index</dt><dd><code>confidence = (1 − |H(q) − H(c)| / max(H(q), H(c)))<br />· (1 − disagreement / ‖fused‖)</code><p>This raw confidence index can be negative and has no probability calibration. A zero fused norm makes it undefined. Extremely small nonzero norms can exceed numeric precision and produce a validation message.</p></dd></div>
            </dl>
          </div>
        </details>
      </main>
      <footer className="page-width site-footer"><span>IDMHYSI systems <span aria-hidden="true">/</span> EssenceFusion</span><p>Calculated locally. Export only when you choose.</p></footer>
    </>
  )
}
