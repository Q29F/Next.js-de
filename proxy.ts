import { NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64')
  const development = process.env.NODE_ENV === 'development'
  const policy = [
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    development ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    `connect-src 'self'${development ? ' ws: wss:' : ''}`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ')

  const headers = new Headers(request.headers)
  headers.set('x-nonce', nonce)
  headers.set('Content-Security-Policy', policy)
  const response = NextResponse.next({ request: { headers } })
  response.headers.set('Content-Security-Policy', policy)
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export const config = {
  // Similar-looking paths can render HTML errors and still need the nonce policy.
  matcher: ['/((?!_next/static/|_next/image$|favicon\\.ico$).*)'],
}
