import PriorityQueue from '../../src/common/priority_queue.ts';

export class TimedCallback {
  #when: number;
  #callback: Function | null;

  constructor(when: number, cb: Function) {
    this.#when = when;
    this.#callback = cb;
  }

  get when(): number {
    return this.#when;
  }
  get canceled(): boolean {
    return !this.#callback;
  }
  get callback(): Function | null {
    return this.#callback;
  }

  static lessThan(a: TimedCallback, b: TimedCallback) {
    return a.when < b.when;
  }

  cancel() {
    // It's difficult to remove the event from the queue, so canceling
    // only nullifies the effect.
    this.#callback = null;
  }

  // Dispatches the callback. Returns whether the callback was canceled.
  dispatch(): any {
    if (!this.#callback) return undefined;
    return this.#callback();
  }
}

type TimeoutMap = Map<number, TimeoutCallback>;

class TimeoutCallback extends TimedCallback {
  #map: TimeoutMap;
  #id: number;

  constructor(when: number, cb: Function, map: TimeoutMap, id: number) {
    super(when, cb);
    this.#map = map;
    this.#id = id;
    this.#map.set(this.#id, this);
  }

  get id() {
    return this.#id;
  }
  get map(): TimeoutMap {
    return this.#map;
  }

  cancel() {
    this.#map.delete(this.#id);
    super.cancel();
  }

  dispatch(): any {
    const ret = super.dispatch();
    this.#map.delete(this.#id);
    return ret;
  }
}

class IntervalCallback extends TimeoutCallback {
  #clock: MockClock;
  #interval: number;

  constructor(
    when: number,
    interval: number,
    cb: Function,
    map: TimeoutMap,
    id: number,
    clock: MockClock
  ) {
    super(when, cb, map, id);
    this.#clock = clock;
    this.#interval = interval;
  }

  dispatch(): boolean {
    const ret = super.dispatch();
    const callback = this.callback;
    if (callback) {
      const next = this.when + this.#interval;
      this.#clock.schedule(
        new IntervalCallback(
          next,
          this.#interval,
          callback,
          this.map,
          this.id,
          this.#clock
        )
      );
    }
    return ret;
  }
}

type ClockSettings = {
  frameInterval: number;
};

export class MockClock {
  #settings: ClockSettings = {
    frameInterval: 1000.0 / 60,
  };
  #now = 0;
  #lastTimerId = 0;
  #events = new PriorityQueue<TimedCallback>(TimedCallback.lessThan);
  #timeoutMap: TimeoutMap = new Map<number, TimeoutCallback>();
  #intervalMap: TimeoutMap = new Map<number, TimeoutCallback>();
  #rafMap: TimeoutMap = new Map<number, TimeoutCallback>();

  constructor(settings: Partial<ClockSettings> = {}) {
    this.#settings = { ...this.#settings, ...settings };
  }

  // Public API
  api() {
    return {
      performance: {
        now: () => {
          return this.now();
        },
      },

      setTimeout: (cb: Function, delay: number): number => {
        const id = ++this.#lastTimerId;
        this.schedule(
          new TimeoutCallback(this.now() + delay, cb, this.#timeoutMap, id)
        );
        return id;
      },

      clearTimeout: (id: number) => {
        this.#timeoutMap.get(id)?.cancel();
      },

      setInterval: (cb: Function, interval: number): number => {
        const id = ++this.#lastTimerId;
        this.schedule(
          new IntervalCallback(
            this.now() + interval,
            interval,
            cb,
            this.#intervalMap,
            id,
            this
          )
        );
        return id;
      },

      clearInterval: (id: number) => {
        this.#intervalMap.get(id)?.cancel();
      },

      requestAnimationFrame: (cb: Function): number => {
        const id = ++this.#lastTimerId;
        let offset = this.now() % this.#settings.frameInterval;
        this.schedule(
          new TimeoutCallback(
            this.now() + this.#settings.frameInterval - offset,
            cb,
            this.#rafMap,
            id
          )
        );
        return id;
      },
    };
  }

  advanceBy(ms: number): Promise<void> {
    return this.advanceTo(this.#now + ms);
  }

  async advanceTo(ms: number) {
    let promises: Set<Promise<any>> = new Set();
    let next: TimedCallback | undefined;
    while (true) {
      while ((next = this.#events.peek()) !== undefined && next.when <= ms) {
        this.#events.pop();
        this.#now = next.when;
        const promise = Promise.resolve(next.dispatch()).finally(() => {
          promises.delete(promise);
        });
        promises.add(promise);
      }
      if (promises.size == 0) break;
      // Wait until any promise resolves, and then check if we have
      // move events before the target time.
      await Promise.race(promises);
    }
    // Once there are no more events or the next event exceeds the
    // requested time, we just set the clock to this time.
    this.#now = ms;
  }

  async advanceUntilIdle() {
    let promises: Set<Promise<any>> = new Set();
    let next: TimedCallback | undefined;
    while (true) {
      while ((next = this.#events.pop())) {
        this.#now = next.when;
        const promise = Promise.resolve(next.dispatch()).finally(() => {
          promises.delete(promise);
        });
        promises.add(promise);
      }
      if (promises.size == 0) break;
      // Wait until any promise resolves, and then check if we have
      // more events.
      await Promise.race(promises);
    }
  }

  now() {
    return this.#now;
  }

  schedule(cb: TimedCallback) {
    this.#events.push(cb);
  }
}
