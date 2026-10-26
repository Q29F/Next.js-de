# IDMHYSI Fusion Workbench

An interactive calculator for the fixed-vector EssenceFusion equations. Enter two
vectors and their structural potentials, inspect the resulting blend, and download
the calculation as JSON. Calculations run in the browser.

## Run

Use Node.js 24 and npm. Node.js 22.13 or later in the 22 release line is also
included in the CI matrix.

```sh
npm ci --ignore-scripts
npm run dev
```

Open http://localhost:3000. For a production build:

```sh
npm run build
npm start
```

Inputs remain in page memory and are not uploaded. JSON download saves the current
calculation; refreshing resets the inputs.

## Mathematics

The implementation follows Ainsley Leopold-James, *IDMHYSI EssenceFusion Algorithm*,
2 February 2026, sections 2.2–2.4. It combines normalized absolute-magnitude
entropies with supplied structural potentials to set the fusion weight, then
reports the fused vector, Euclidean disagreement, and raw confidence index.

See [the mathematical contract](docs/mathematics.md) for equations, bounds, and
undefined cases. The confidence index is a mathematical diagnostic, not a
calibrated probability.

## Organization

- `app/`: App Router layout, page, and HTTP liveness route.
- `components/`: interactive controls and accessible result views.
- `lib/fusion.ts`: pure validated mathematical operations.
- `tests/`: numerical and input-validation regressions.
- `scripts/`: bounded production-server, HTTP, and browser checks.
- `proxy.ts`: request-specific content security policy.
- `docs/`: mathematical and security contracts.

`GET /api/health` returns `{ "status": "ok", "application": "fusion-workbench" }`
with no-store caching. It confirms that this application's HTTP process responds.
Unsupported mutation methods return 405.

## Verify

```sh
npm ci --ignore-scripts
npx playwright install chromium
npm run check
npm audit --audit-level=low
```

`check` runs lint, type generation and strict TypeScript checks, a production
build, numerical tests, HTTP contract tests, and Chromium interface tests. Browser
checks exercise real controls, validation, downloads, keyboard use, responsive
layout, and enforced CSP. Linux CI installs browser system dependencies with
`npx playwright install --with-deps chromium`.

CI uses read-only repository permissions and pinned action revisions. Dependabot
checks npm packages and GitHub Actions weekly. `package-lock.json` is the
authoritative dependency lock and the documented install skips lifecycle scripts.

Lint uses recommended JavaScript, TypeScript, and React Hooks rules. Browser tests
separately check controls, keyboard use, layout, downloads, and CSP.

## Security and deployment

See [the security boundary](docs/security.md). Production responses use a fresh
script/style nonce, restrictive CSP, no-store page caching, anti-framing and
content-type headers, and restricted browser permissions. No user expression is
evaluated as code. The deployment environment must supply HTTPS and any network
access policy it requires.

Repository tests and dependency audits establish their recorded scope at the time
they run. They do not certify a production environment or unknown vulnerabilities.

See `LICENSE.txt` and `NOTICE.txt` for the existing licensing information.
