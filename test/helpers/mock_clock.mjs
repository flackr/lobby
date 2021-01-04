import PriorityQueue from "./priority_queue.mjs";

class Event {
  constructor(time, callback) {
    this._time = time;
    this._callback = callback;
  }

  dispatch() {
    let callback = this._callback;
    this._callback = null;
    if (callback)
      callback();
    return !!callback;
  }

  cancel() {
    this._callback = null;
  }
}

function compareEvents(a, b) {
  return a._time < b._time;
}

const RAF_INTERVAL = 16.67;
const MOCK_METHODS = ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'requestAnimationFrame', 'performance'];
const COMPARATOR = (a, b) => { return a._time < b._time; };

class MockClock {
  constructor(global) {
    this._events = new PriorityQueue(COMPARATOR);
    this._timeouts = [null];
    this._intervals = [null];
    this._animationFrames = [null];
    this._time = 0;
    this._originals = {};
    this._global = global;
    this._autoAdvance = 0;
    this._advanceTimer = null;
    if (!this._global)
      return;
    for (let method of MOCK_METHODS) {
      this._originals[method] = this._global[method];
      this._global[method] = this[method];
    }
  }

  uninstall() {
    if (!this._global)
    return;
    for (let method of MOCK_METHODS)
      this._global[method] = this._originals[method];
  }

  autoAdvance(ms) {
    this._autoAdvance = this._time + ms;
    this._maybeAdvance();
  }

  _maybeAdvance() {
    if (this._autoAdvance < this._time || this._advanceTimer !== null || this._events.isEmpty())
      return;
    const settimout = this._originals.setTimeout || setTimeout;
    this._advanceTimer = settimout(() => {
      if (this._autoAdvance >= this._time)
        this.finish(this._autoAdvance);
      this._advanceTimer = null;
    }, 0);
  }

  advance(ms) {
    let target = this._time + ms;
    while (!this._events.isEmpty()) {
      let front = this._events.peek();
      if (front._time > target)
        break;
      this._time = front._time;
      this._events.pop();
      front.dispatch();
    }
    this._time = target;
  }

  finish(finishTime) {
    let hadEvents = false;
    while (!this._events.isEmpty() && this._events.peek()._time <= finishTime) {
      let event = this._events.pop();
      this._time = event._time;
      hadEvents = event.dispatch() || hadEvents;
    }
    return hadEvents;
  }

  _addEvent(event) {
    this._events.push(event);
    this._maybeAdvance();
  }

  setTimeout = (fn, time) => {
    const id = this._timeouts.length;
    this._addEvent(this._timeouts[id] = new Event(this.performance.now() + time, fn));
    return id;
  };

  clearTimeout = (id) => {
    this._timeouts[id].cancel();
  }

  setInterval = (fn, interval) => {
    const id = this._intervals.length;
    let initialTime = this.performance.now();
    let count = 0;
    let runInterval = (skipCallback) => {
      this._intervals[id] = new Event(initialTime + (++count) * interval, runInterval);
      if (!skipCallback)
        fn();
      this._addEvent(this._intervals[id]);
    };
    runInterval(true);
    return id;
  };

  clearInterval = (id) => {
    this._intervals[id].cancel();
  }

  requestAnimationFrame = (fn) => {
    const id = this._animationFrames.length;
    const now = this.performance.now();
    this._animationFrames[id] = new Event(now + (RAF_INTERVAL - (now % RAF_INTERVAL)), () => {
      fn();
    });
  };

  clearAnimationFrame = (id) => {
    this._animationFrames[id].cancel();
  }

  performance = {
    now: () => { return this._time; }
  };
  
};

export default MockClock;