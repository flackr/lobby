var lobby = lobby || {};
lobby.util = {};

lobby.AbstractClassError = function(obj, functionName) {
  this.name = 'AbstractClassError';
  this.message = obj.name + ' is abstract';
  if (functionName)
    this.message += ', ' + functionName + ' not implemented.';
}

lobby.util.extend = function(base, derived) {
  var proto = {};
  for (var i in base)
    proto[i] = base[i];
  for (var i in derived)
    proto[i] = derived[i];
  return proto;
}

/**
 * EventSource implements addEventListener, removeEventListener as expected
 * from DOM nodes. The dispatchEvent helper allows notifying event listeners.
 */
lobby.util.EventSource = function() {
  this.listeners_ = {};
};

lobby.util.EventSource.prototype = {
  /**
   * Add an event listener for events of |type|. |callback| will be disptached
   * when dispatchEvent is called with the same type.
   * 
   * @param {string} type The type of events to listen for.
   * @param {function(...Object)} callback The function to call when this event
   *   type is generated. Arguments from dispatchEvent are passed verbatim.
   */
  addEventListener: function(type, callback) {
    if (!this.listeners_[type])
      this.listeners_[type] = [];
    this.listeners_[type].push(callback);
  },

  /**
   * Remove the event listener for events of |type| given by |callback|.
   *
   * @param {string} type The type of events being listened for.
   * @param {function} callback The callback function which was given to
   *   addEventListener to listen for events.
   */
  removeEventListener: function(type, callback) {
    if (!this.listeners_[type])
      return;
    for (var i = this.listeners_[type].length - 1; i >= 0; i--) {
      if (this.listeners_[type][i] == callback) {
        this.listeners_[type].splice(i, 1);
      }
    }
  },

  /**
   * Dispatch the event of |type| with the given arguments |args|.
   *
   * @param {string} type The type of the event to dispatch.
   * @param {...Object} args The arguments to dispatch the listeners with.
   */
  dispatchEvent: function(type, args) {
    if (!this.listeners_[type])
      return;
    for (var i = this.listeners_[type].length - 1; i >= 0; i--) {
      this.listeners_[type][i].apply(
          /* this */ null, /* args */ Array.prototype.slice.call(arguments, 1));
    }
  }
};

lobby.util.SignalingClientBase = function() {
};

lobby.util.SignalingClientBase.prototype = {
    
  /**
   * Create a new session.
   * 
   * @return {lobby.SignalingHost} A new signaling host session.
   */
  createSession: function() {
    throw new lobby.AbstractClassError(this, 'createSession');
  },

  /**
   * Joins the session with the given identifier.
   * 
   * @return {lobby.SignalingClient} A new signaling client session.
   */
  joinSession: function(identifier) {
    throw new lobby.AbstractClassError(this, 'joinSession');
  },
};

lobby.util.SignalingHost = function() {
  lobby.util.EventSource.apply(this);
};

lobby.util.SignalingHost.prototype =
    lobby.util.extend(lobby.util.EventSource.prototype, {

  /**
   * Close the signaling host session. From this point on it will not be
   * possible to send any more signaling messages.
   */
  close: function() {
    throw new lobby.AbstractClassError(this, 'close');
  },
});

lobby.util.SignalingClient = function() {
  lobby.util.EventSource.apply(this);
};

lobby.util.SignalingClient.prototpe =
    lobby.util.extend(lobby.util.EventSource.prototype, {

  /**
   * Send |message| to the remote device.
   */
  send: function(message) {
    throw new lobby.AbstractClassError(this, 'send');
  },

  /**
   * Close the signaling backend connection.
   */
  close: function() {
    throw new lobby.AbstractClassError(this, 'close');
  },
});
