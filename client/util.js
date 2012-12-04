var lobby = {};

lobby.util = {};

lobby.util.EventSource = function() {
  this.eventListeners_ = {};
};

lobby.util.EventSource.prototype = {
  addEventListener: function(type, callback) {
    if (!this.listeners_[type])
      this.listeners_[type] = [];
    this.listeners_[type].push(callback);
  },

  removeEventListener: function(type, callback) {
    if (!this.listeners_[type])
      return;
    for (var i = this.listeners_[type].length - 1; i >= 0; i--) {
      if (this.listeners_[type][i] == callback) {
        this.listeners_[type].splice(i, 1);
      }
    }
  },

  dispatchEvent: function(type, args) {
    if (!this.listeners_[type])
      return;
    for (var i = this.listeners_[type].length - 1; i >= 0; i--) {
      this.listeners_[type][i](args);
    }
  }
};


