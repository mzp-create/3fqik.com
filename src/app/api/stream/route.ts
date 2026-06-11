import { requirePlayer } from '@/lib/auth/session'
import { sseHub } from '@/lib/sse'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  // requirePlayer throws {httpStatus} errors; this route does NOT use handle(),
  // so we catch and return a plain 401 Response instead of an unhandled throw.
  try {
    await requirePlayer()
  } catch (e) {
    const status = (e as { httpStatus?: number }).httpStatus ?? 401
    return new Response('Unauthorized', { status })
  }

  const encoder = new TextEncoder()
  let unsub = () => {}
  let ping: ReturnType<typeof setInterval> | undefined
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(': connected\n\n'))
      unsub = sseHub.subscribe(chunk => {
        try { controller.enqueue(encoder.encode(chunk)) } catch { clearInterval(ping); unsub() }
      })
      ping = setInterval(() => {
        try { controller.enqueue(encoder.encode(': ping\n\n')) } catch { clearInterval(ping); unsub() }
      }, 25_000)
    },
    cancel() { unsub(); if (ping) clearInterval(ping) },
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  })
}
