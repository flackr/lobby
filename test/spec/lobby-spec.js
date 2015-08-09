describe("lobby.Lobby", function() {

  var lobbyApi;
  var lobbyServerLocation = location.origin.replace('http', 'ws');
  if (lobbyServerLocation == 'file://')
    lobbyServerLocation = 'wss://lobbyjs.com';
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
    //uninstallWebSocketMock();
    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
  });

  describe("if the client does not support WebRTC", function() {
    var session;
    var sessionId;
    var oldRTCPeerConnection = window.RTCPeerConnection;
    var oldRTCSessionDescription = window.RTCSessionDescription;
    var oldRTCIceCandidate = window.RTCIceCandidate;

    beforeEach(function(done) {
      window.RTCPeerConnection = undefined;
      window.RTCSessionDescription = undefined;
      window.RTCIceCandidate = undefined;
      sessionId = undefined;
      session = lobbyApi.createSession();
      session.addEventListener('open', function(id) {
        expect(id).toBeTruthy();
        sessionId = id;
        done();
      })
    });

    afterEach(function() {
      window.RTCPeerConnection = oldRTCPeerConnection;
      window.RTCSessionDescription = oldRTCSessionDescription;
      window.RTCIceCandidate = oldRTCIceCandidate;
    });
    
    describe("it should connect using the relay", function() {
      
      var hostChannel;
      var clientChannel;
      
      beforeEach(function(done) {
        session.addEventListener('connection', function(channel) {
          hostChannel = channel;
          expect(hostChannel.state).toBe('relay');
          if (clientChannel)
            done();
        });
        var client = lobbyApi.joinSession(sessionId);
        client.addEventListener('open', function(channel) {
          clientChannel = client;
          expect(clientChannel.state).toBe('relay');
          if (hostChannel)
            done();
        });
      });

      afterEach(function() {
        hostChannel = undefined;
        clientChannel = undefined;
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

  describe("if the server supports relay", function() {

    var session;
    var sessionId;

    beforeEach(function(done) {
      sessionId = undefined;
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
        hostChannel = undefined;
        clientChannel = undefined;
        mockRTCConnectionShouldSucceed = false;
        session.addEventListener('connection', function(channel) {
          hostChannel = channel;
          expect(hostChannel.state).toBe('relay');
          if (clientChannel)
            done();
        });
        var client = lobbyApi.joinSession(sessionId);
        client.addEventListener('open', function(channel) {
          clientChannel = client;
          expect(clientChannel.state).toBe('relay');
          if (hostChannel)
            done();
        });
      });

      afterEach(function() {
        mockRTCConnectionShouldSucceed = true;
        connectPendingMockRTCConnections = undefined;
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

      it("should upgrade to a direct connection", function(done) {
        var clientState = clientChannel.state;
        var hostState = hostChannel.state;
        expect(clientState).toBe('relay');
        expect(hostState).toBe('relay');
        hostState = 'relay';
        clientState = 'relay';
        clientChannel.addEventListener('state', function(state) {
          if (state == 'closed')
            return;
          clientState = state;
          expect(clientState).toBe('open');
          if (hostState == 'open')
            done();
        });
        hostChannel.addEventListener('state', function(state) {
          if (state == 'closed')
            return;
          hostState = state;
          expect(hostState).toBe('open');
          expect(hostChannel.relay_).not.toBeTruthy();
          if (clientState == 'open')
            done();
        })
        mockRTCConnectionShouldSucceed = true;
        if (connectPendingMockRTCConnections)
          connectPendingMockRTCConnections();
      });

      it("should detect a disconnected client", function(done) {
        hostChannel.addEventListener('close', function() {
          done();
        });
        clientChannel.close();
      });

      it("should detect a disconnected host", function(done) {
        clientChannel.addEventListener('close', function() {
          done();
        });
        hostChannel.close();
      });


    });

  });

  describe("after creating a game", function() {

    var session;
    var sessionId;

    beforeEach(function(done) {
      server.allowRelay_ = false;
      sessionId = undefined;
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
        clientChannel = undefined;
        hostChannel = undefined;
        session.addEventListener('connection', function(channel) {
          hostChannel = channel;
          expect(hostChannel.state).toBe('open');
          if (clientChannel)
            done();
        });
        var client = lobbyApi.joinSession(sessionId);
        client.addEventListener('open', function(channel) {
          clientChannel = client;
          expect(clientChannel.state).toBe('open');
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

      it("should detect a disconnected client", function(done) {
        hostChannel.addEventListener('close', function() {
          done();
        });
        clientChannel.close();
      });

      it("should detect a disconnected host", function(done) {
        clientChannel.addEventListener('close', function() {
          done();
        });
        hostChannel.close();
      });

    });
  }); 

});
