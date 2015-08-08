describe("lobby.Lobby", function() {

  var lobbyApi;
  var lobbyServerLocation = location.origin.replace('http', 'ws');
  var testPort = '1234';
  var server = {};
  var originalTimeout;

  beforeEach(function() {
    // Mock out communication, then run server
    installWebSocketMock();
    installWebRTCMock();
    lobbyApi = new lobby.LobbyApi(lobbyServerLocation);
    server = new Server({'port': testPort});
    originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;
  });
  
  afterEach(function() {
    uninstallWebSocketMock();
    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
  });

  describe("if the server supports relay", function() {

    var session;
    var sessionId;

    beforeEach(function(done) {
      server.allowRelay_ = true;
      session = lobbyApi.createSession();
      session.addEventListener('open', function(id) {
        expect(id).toBeTruthy();
        sessionId = id;
        done();
      })
    });

    afterEach(function() {
      server.allowRelay_ = true;
    });

    describe("it should be able to relay a client", function() {
      
      var hostChannel;
      var clientChannel;
      
      beforeEach(function(done) {
        mockRTCConnectionShouldSucceed = false;
        session.addEventListener('connection', function(channel) {
          hostChannel = channel;
          if (clientChannel)
            done();
        });
        var client = lobbyApi.joinSession(sessionId);
        client.addEventListener('open', function(channel) {
          clientChannel = client;
          if (hostChannel)
            done();
        });
      });

      afterEach(function() {
        mockRTCConnectionShouldSucceed = true;
      })
      
      it("and be able to send a ping", function(done) {
        var clientMsg = 'ping';
        var serverMsg = 'pong';
        clientChannel.addEventListener('message', function(e) {
          expect(e.data).toBe(serverMsg);
          done();
        });

        hostChannel.addEventListener('message', function(e) {
          expect(e.data).toBe(clientMsg);
          hostChannel.send(serverMsg);
        });

        clientChannel.send(clientMsg);
      });
    });

  });

  describe("after creating a game", function() {

    var session;
    var sessionId;

    beforeEach(function(done) {
      server.allowRelay_ = false;
      session = lobbyApi.createSession();
      session.addEventListener('open', function(id) {
        expect(id).toBeTruthy();
        sessionId = id;
        // Disable relay on this host.
        session.relay_ = false;
        done();
      })
    });

    afterEach(function() {
      server.allowRelay_ = true;
    });
    
    describe("after connecting a client", function() {
      
      var hostChannel;
      var clientChannel;
      
      beforeEach(function(done) {
        session.addEventListener('connection', function(channel) {
          hostChannel = channel;
          if (clientChannel)
            done();
        });
        var client = lobbyApi.joinSession(sessionId);
        client.addEventListener('open', function(channel) {
          clientChannel = client;
          if (hostChannel)
            done();
        });
      });
      
      it("should be able to send a ping", function(done) {
        var clientMsg = 'ping';
        var serverMsg = 'pong';
        clientChannel.addEventListener('message', function(e) {
          expect(e.data).toBe(serverMsg);
          done();
        });

        hostChannel.addEventListener('message', function(e) {
          expect(e.data).toBe(clientMsg);
          hostChannel.send(serverMsg);
        });

        clientChannel.send(clientMsg);
      });      
    });
  }); 

});
