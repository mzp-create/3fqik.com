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
    const status = (e as { httpStatus?: number }).httpStatus ?? 500
    const msg = e instanceof Error ? e.message : 'error'
    return fail(status === 500 ? 'internal' : msg, msg, status)
  }
}
