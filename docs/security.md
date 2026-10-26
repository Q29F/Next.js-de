# Security boundary

The mathematical calculation runs in browser memory on fixed numeric operations.
It does not evaluate supplied expressions, upload vector inputs, store them in a
database, or invoke an external model or compute service. JSON downloads contain
the calculation the user explicitly chooses to save.

## Input handling

The mathematical module validates types, equal vector dimensions, component
magnitudes, structural potentials, and finite outputs. Text inputs have length
limits and a decimal-only parser. React renders values as text; application data
is not inserted as HTML. The vector size limit bounds plotting and calculation
work.

## Browser policy

`proxy.ts` generates a fresh cryptographic nonce for each page request and supplies
it to both Next.js rendering and the response's content security policy.
Dynamic rendering avoids caching HTML with a reused nonce. Production policy
permits the application's required scripts and styles, blocks inline evaluation,
frames, object content, base-URL changes, and form submissions, and restricts
connections to the same origin. Development-only exceptions support the framework
debugger and hot reload.

Responses also apply `nosniff`, frame denial, a no-referrer policy, and disabled
camera, microphone, geolocation, and payment permissions. The framework branding
header is disabled. The liveness endpoint is read-only and does not disclose
credentials, environment values, or internal paths.

## Verification and operations

Production tests check response headers, fresh nonces, script markup, unsupported
HTTP methods, and browser operation with CSP enforced. Numerical tests cover the
fixed mathematical boundary. Dependency audits run against the committed lock.

The hosting environment is responsible for TLS, network access policy, resource
allocation, logs, and platform updates. This application does not supply multiuser
authentication or claim to assess the security of its hosting infrastructure.
