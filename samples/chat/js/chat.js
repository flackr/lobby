function $(id) {
  return document.getElementById(id);
}

document.addEventListener('DOMContentLoaded', function() {
  lobby.GameLobby.setGameId('chat');
  lobby.GameLobby.decorate($('chat-lobby'));
  $('createGame').style.display = lobby.serverCapable() ? 'block' : 'none';
  $('createGameBtn').addEventListener('click', function() {
    var host;
    window.server = new ChatServer(host = new lobby.Host($('chat-lobby').getUrl().replace('http://', 'ws://'), parseInt($('port').value)), $('gameName').value);
    host.addEventListener('ready', function(address) {
      window.client = new ChatClient($('connection'), server.createLocalClient(), $('localAlias').value);
    });
  });
  $('chat-lobby').onSelectGame = function(game) {
    window.client = new ChatClient($('connection'), new lobby.Client(game), $('alias').value);
  };
});

function ChatServer(connection, name) {
  this.clients_ = [];
  this.connection_ = connection;
  this.connection_.updateInfo({
    'gameId': 'chat',
    'description': name,
    'status': 'running'
  });
  this.connection_.addEventListener('message', this.onMessageReceived.bind(this));
  this.connection_.addEventListener('error', this.onError.bind(this));
  this.connection_.addEventListener('disconnection', this.onDisconnection.bind(this));
}

ChatServer.prototype = {

  createLocalClient: function() {
    return this.connection_.createLocalClient();
  },

  onMessageReceived: function(clientIndex, message) {
    if (message.alias) {
      this.clients_[clientIndex] = message.alias;
      this.updatePlayers();
    } else {
      // Add user alias to message text.
      message.text = (this.clients_[clientIndex] || 'Anonymous') + ': ' + message.text;

      // Rebroadcast all messages to all clients.
      for (var i in this.connection_.clients) {
        this.connection_.send(i, message);
      }
    }
  },

  onError: function(errorMessage) {
    console.log('Error: ', errorMessage);
  },

  onDisconnection: function(clientIndex) {
    delete this.clients_[clientIndex];
    this.updatePlayers();
  },

  updatePlayers: function() {
    var aliases = [];
    for (var i in this.clients_)
      aliases.push(this.clients_[i]);
    this.connection_.updateInfo({
      players: aliases
    });
  }
};

function ChatClient(rootNode, connection, name) {
  this.connection_ = connection;
  this.rootNode_ = rootNode;
  this.name_ = name || 'Anonymous';
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
    this.connection_.send({alias: this.name_});
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
