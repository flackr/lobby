export class MockEvent {
  constructor(type) {
    this.type = type;
  }
};

export class MockEventTarget {
  constructor(eventTypes) {
    this._handlers = {};
    const self = this;
    for (let type of eventTypes) {
      const typestr = 'on' + type;
      this[typestr] = this[typestr] | undefined;
      this.addEventListener(type, (evt) => {
        if (self[typestr])
          self[typestr](evt);
      });    
    }
  }

  addEventListener(type, fn) {
    this._handlers[type] = this._handlers[type] || [];
    let handlers = this._handlers[type];
    if (handlers.indexOf(fn) == -1)
      handlers.push(fn);
  }

  removeEventListener(type, fn) {
    let handlers = this._handlers[type];
    if (!handlers)
      return;
    let index = handlers.indexOf(fn);
    if (index == -1)
      return;
    handlers.splice(index, 1);
  }

  dispatchEvent(event) {
    let handlers = this._handlers[event.type];
    if (!handlers)
      return;
    for (let handler of handlers) {
      handler.apply(null, [event]);
    }
  }
};