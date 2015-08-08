var lobbyApi = new lobby.LobbyApi('wss://lobbyjs.com');

function $(id) {
  return document.getElementById(id);
}

document.addEventListener('DOMContentLoaded', function() {
  if (location.hash) {
    joinGame(location.hash.slice(1));
  } else {
    var session = lobbyApi.createSession();
    window.server = new ChatServer(session, $('gameName').value);
    session.addEventListener('open', function(id) {
      location.hash = id;
      joinGame(id);
    });
  }
});

function joinGame(id) {
  window.client = new ChatClient($('connection'), lobbyApi.joinSession(id), $('localAlias').value);
}

function ChatServer(connection, name) {
  this.clients_ = [];
  this.connection_ = connection;
  this.connection_.addEventListener('connection', this.onConnection.bind(this));
}

ChatServer.prototype = {

  onConnection: function(connection) {
    for (var i = 0; i < this.clients_.length; i++) {
      this.clients_[i].send('connection');
    }
    this.clients_.push(connection);
    connection.addEventListener('message', this.onMessageReceived.bind(this, connection));
    connection.addEventListener('close', this.onClose.bind(this, connection))
  },

  onMessageReceived: function(connection, e) {
    // Rebroadcast all messages to all clients.
    for (var i = 0; i < this.clients_.length; i++) {
      this.clients_[i].send(e.data);
    }
  },

  onClose: function(connection) {
    var i = this.clients_.indexOf(connection);
    if (i == -1)
      throw new Error('Client not found');
    this.clients_.splice(i, 1);
    for (var i = 0; i < this.clients_.length; i++) {
      this.clients_[i].send('disconnection');
    }
  },
};

function ChatClient(rootNode, connection, name) {
  this.connection_ = connection;
  this.rootNode_ = rootNode;
  this.name_ = name || 'Anonymous';
  this.connection_.addEventListener('open', this.onConnected.bind(this));
  this.connection_.addEventListener('close', this.onDisconnected.bind(this));
  this.connection_.addEventListener('message', this.onMessageReceived.bind(this));
  rootNode.querySelector('.send').addEventListener('click', this.sendMessage.bind(this));
  this.textbox_ = rootNode.querySelector('.input');
  this.textbox_.addEventListener('keypress', this.onKeyPress.bind(this));
}

ChatClient.prototype = {

  onConnected: function() {
    document.body.classList.add('connected');
  },

  onMessageReceived: function(e) {
    this.rootNode_.querySelector('.log').textContent += e.data + '\n';
  },

  sendMessage: function() {
    this.connection_.send(this.textbox_.value);
    this.textbox_.value = '';
    this.textbox_.focus();
  },

  onKeyPress: function(evt) {
    if (evt.keyCode == 13)
      this.sendMessage();
  },

  onDisconnected: function() {
    document.body.classList.remove('connected');
  }
};
