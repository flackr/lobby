import { MockClock } from './mock/clock.ts';
import { describe, expect, test } from '@jest/globals';

describe('mock clock', () => {
  // Amusing "sleep sort" test to verify that timeouts are fired in the expected order.
  test('Fires timeouts in the expected order', () => {
    // With 100+ seconds per timeout, the test would time out if the
    // clock was realtime.
    const MULTIPLIER = 100000;
    const clock = new MockClock();
    const api = clock.api();
    const ordered: number[] = [];
    const values = [8, 3, 5, 1, 2, 9];
    for (const value of values) {
      api.setTimeout(() => {
        ordered.push(value);
      }, value * MULTIPLIER);
    }
    clock.advanceUntilIdle();
    const sorted = values.sort();

    // If the timers are fired in the correct order, the array should be sorted.
    expect(ordered).toEqual(sorted);
    // And the elapsed "time" should be the maximum value in the array.
    expect(api.performance.now()).toEqual(
      sorted[sorted.length - 1] * MULTIPLIER
    );
  });

  test('Intervals repeat until terminated at the expected time', () => {
    let timesA = 0;
    let timesB = 0;
    const clock = new MockClock();
    const api = clock.api();
    const ordered: string[] = [];
    const iA = api.setInterval(() => {
      if (++timesA == 3) {
        api.clearInterval(iA);
      }
      ordered.push(`A: ${api.performance.now()}`);
    }, 2000);
    const iB = api.setInterval(() => {
      if (++timesB == 3) {
        api.clearInterval(iB);
      }
      ordered.push(`B: ${api.performance.now()}`);
    }, 3300);
    clock.advanceUntilIdle();
    expect(api.performance.now()).toEqual(9900);
    expect(ordered).toEqual([
      'A: 2000',
      'B: 3300',
      'A: 4000',
      'A: 6000',
      'B: 6600',
      'B: 9900',
    ]);
  });

  test('advanceUntilIdle recognizes and waits for dependent asynchronous work', async () => {
    const clock = new MockClock();
    const api = clock.api();
    let calls = 0;
    api.setTimeout(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
      api.setTimeout(() => {
        ++calls;
      }, 1000);
      ++calls;
    }, 1000);
    await clock.advanceUntilIdle();
    expect(calls).toEqual(2);
    expect(api.performance.now()).toEqual(2000);
  });

  test('autoAdvance just works', async () => {
    const clock = new MockClock({autoAdvance: true});
    const api = clock.api();
    let calls = 0;
    await new Promise((resolve) => {
      api.setTimeout(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
        api.setTimeout(() => {
          ++calls;
          resolve(undefined);
        }, 1000);
        ++calls;
      }, 1000);
    });
    expect(calls).toEqual(2);
    expect(api.performance.now()).toEqual(2000);
  });

});
