/** Per-host politeness: at most `concurrency` parallel requests and `delayMs` between two request starts. */
export class HostGate {
  private state = new Map<string, { active: number; nextAt: number; waiters: Array<() => void> }>();
  constructor(
    private concurrency: number,
    private delayMs: number,
    private now: () => number = Date.now,
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  async run<T>(host: string, fn: () => Promise<T>): Promise<T> {
    let s = this.state.get(host);
    if (!s) this.state.set(host, (s = { active: 0, nextAt: 0, waiters: [] }));
    while (s.active >= this.concurrency) await new Promise<void>((r) => s!.waiters.push(r));
    s.active++;
    try {
      const wait = s.nextAt - this.now();
      s.nextAt = Math.max(this.now(), s.nextAt) + this.delayMs;
      if (wait > 0) await this.sleep(wait);
      return await fn();
    } finally {
      s.active--;
      s.waiters.shift()?.();
    }
  }
}
