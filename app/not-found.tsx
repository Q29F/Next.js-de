import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="not-found">
      <p className="eyebrow">IDMHYSI systems</p>
      <h1>Page not found</h1>
      <p>The Fusion workbench is available from the home page.</p>
      <Link className="button button-primary" href="/">Open workbench</Link>
    </main>
  )
}
