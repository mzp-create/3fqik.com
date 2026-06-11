type Listener = (chunk: string) => void

class SseHub {
  private listeners = new Set<Listener>()

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  broadcast(event: string, data: unknown) {
    const chunk = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    for (const fn of this.listeners) fn(chunk)
  }
}

// survive dev hot-reload; single instance per process
const g = globalThis as unknown as { __sseHub?: SseHub }
export const sseHub = (g.__sseHub ??= new SseHub())
