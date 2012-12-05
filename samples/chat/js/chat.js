function $(id) {
  return document.getElementById(id);
}

document.addEventListener('DOMContentLoaded', function() {
  $('createGame').style.display = lobby.serverCapable() ? 'block' : 'none';
  $('createGameBtn').addEventListener('click', function() {
    var host;
    window.server = new ChatServer(host = new lobby.Host($('lobbyUrl').value));
    // TODO(flackr): Replace this with with a fake client rather than actually
    // connecting.
    window.client = new ChatClient($('connection'), new lobby.Client('ws://localhost:' + host.gameInfo.port + '/'));
  });
  $('chat-game-list').onSelectGame = function(game) {
    window.client = new ChatClient($('connection'), new lobby.Client(game));
  };
});

function ChatServer(connection) {
  this.connection_ = connection;
  this.connection_.addEventListener('message', this.onMessageReceived.bind(this));
}

ChatServer.prototype = {
  onMessageReceived: function(clientIndex, message) {
    console.log('Server received '+message+' from client '+clientIndex);
    // Rebroadcast all messages to all clients
    for (var i in this.connection_.clients) {
      this.connection_.send(i, message);
    }
  }
};

function ChatClient(rootNode, connection) {
  this.connection_ = connection;
  this.rootNode_ = rootNode;
  this.connection_.addEventListener('connected', this.onConnected.bind(this));
  this.connection_.addEventListener('disconnected', this.onDisconnected.bind(this));
  this.connection_.addEventListener('message', this.onMessageReceived.bind(this));
  rootNode.querySelector('.send').addEventListener('click', this.sendMessage.bind(this));
  this.textbox_ = rootNode.querySelector('.input');
  this.textbox_.addEventListener('keypress', this.onKeyPress.bind(this));
}

ChatClient.prototype = {

  onConnected: function() {
    document.body.classList.add('connected');
  },

  onMessageReceived: function(message) {
    this.rootNode_.querySelector('.log').textContent += message.text + '\n';
  },

  sendMessage: function() {
    this.connection_.send({text: this.textbox_.value});
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
