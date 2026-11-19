/** Anything that can tell the time. The engine never calls Date.now() itself. */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export interface SimClockState {
  /** Simulated time at the anchor. */
  simAnchor: number;
  /** Real time at the anchor. */
  realAnchor: number;
  /** Simulated ms per real ms. 0 = paused. */
  speed: number;
}

/**
 * A clock you can drive: pause it, jump it, or run it fast. This is how the
 * whole day can be demonstrated in a minute, and how tests pin time exactly.
 */
export class SimClock implements Clock {
  private state: SimClockState;

  constructor(
    start: number,
    speed = 1,
    private readonly real: () => number = () => Date.now(),
  ) {
    this.state = { simAnchor: start, realAnchor: real(), speed };
  }

  now(): number {
    const { simAnchor, realAnchor, speed } = this.state;
    return Math.floor(simAnchor + (this.real() - realAnchor) * speed);
  }

  get speed(): number {
    return this.state.speed;
  }

  /** True when the simulated clock tracks real time at normal speed. */
  get isLive(): boolean {
    return this.state.speed === 1 && Math.abs(this.now() - this.real()) < 1000;
  }

  private reanchor(simAnchor: number, speed: number): void {
    this.state = { simAnchor, realAnchor: this.real(), speed };
  }

  setSpeed(speed: number): void {
    this.reanchor(this.now(), Math.max(0, speed));
  }

  pause(): void {
    this.setSpeed(0);
  }

  jumpTo(epochMs: number): void {
    this.reanchor(epochMs, this.state.speed);
  }

  advance(ms: number): void {
    this.jumpTo(this.now() + ms);
  }

  backToNow(): void {
    this.reanchor(this.real(), 1);
  }
}
