import { NextResponse } from 'next/server'

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init)
}

export function fail(code: string, message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, code, message, ...extra }, { status })
}

export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof SyntaxError) return fail('bad_json', 'malformed request body', 400)
    const status = (e as { httpStatus?: number }).httpStatus ?? 500
    if (status === 500) {
      console.error(e)
      return fail('internal', 'internal error', 500)
    }
    const code = (e as { code?: string }).code ?? 'error'
    const msg = e instanceof Error ? e.message : 'error'
    return fail(code, msg, status, (e as { extra?: Record<string, unknown> }).extra)
  }
}
