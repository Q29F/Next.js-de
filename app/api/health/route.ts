export function GET() {
  return Response.json(
    { status: 'ok', application: 'fusion-workbench' },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
