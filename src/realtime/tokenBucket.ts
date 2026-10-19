/**
 * Balde de fichas: começa cheio (`capacity`), recarrega `perSecond` fichas por segundo.
 * Cada mensagem gasta 1. O custo de checar é O(1), então nem 1000 mensagens por segundo pesam.
 */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(private readonly capacity: number, private readonly perSecond: number, now: number) {
    this.tokens = capacity;
    this.last = now;
  }

  take(now: number): boolean {
    const elapsed = Math.max(0, now - this.last);
    this.tokens = Math.min(this.capacity, this.tokens + (elapsed * this.perSecond) / 1000);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
