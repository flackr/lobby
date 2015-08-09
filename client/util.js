// Polyfill Object.create
Object.create = Object.create || function(proto) {
  var f = function() {};
  f.prototype = proto;
  return new f();
};

window.lobby = {};

lobby.util = {};

lobby.util.extend = function(base, derived) {
  var proto = Object.create(base);
  for (var i in derived)
    proto[i] = derived[i];
  return proto;
}

lobby.util.EventSource = function() {
};

lobby.util.EventSource.prototype = {
  addEventTypes: function(types) {
    if (!this.listeners_)
      this.listeners_ = {};
    for (var i = 0; i < types.length; i++) {
      this.listeners_[types[i]] = [];
    }
  },

  addEventListener: function(type, callback) {
    if (!this.listeners_[type])
      throw new Error("cannot add event listener for unknown type " + type);
    this.listeners_[type].push(callback);
  },

  removeEventListener: function(type, callback) {
    if (!this.listeners_[type])
      throw new Error("cannot remove event listener for unknown type " + type);
    for (var i = this.listeners_[type].length - 1; i >= 0; i--) {
      if (this.listeners_[type][i] == callback) {
        this.listeners_[type].splice(i, 1);
      }
    }
  },

  dispatchEvent: function(type, args) {
    // Call the onX function if defined.
    if (this['on' + type])
      this['on' + type].apply(/* this */ null, /* args */ Array.prototype.slice.call(arguments, 1));
    if (!this.listeners_[type])
      throw new Error("cannot dispatch event listeners for unknown type " + type);
    for (var i = this.listeners_[type].length - 1; i >= 0; i--) {
      this.listeners_[type][i].apply(
          /* this */ null, /* args */ Array.prototype.slice.call(arguments, 1));
    }
  }
};