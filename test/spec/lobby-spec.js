describe("lobby.Lobby", function() {

  var lobbyApi;
  var testPort = '1234';
  var server;
  var originalTimeout;

  beforeEach(function() {
    // Mock out communication, then run server
    installWebSocketMock();
    installWebRTCMock();
    lobbyApi = new lobby.LobbyApi('ws://localhost:'+testPort);
    server = new Server(testPort);
    originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;
  });
  
  afterEach(function() {
    uninstallWebSocketMock();
    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
  });

  describe("after creating a game", function() {

    var session;
    var sessionId;

    beforeEach(function(done) {
      session = lobbyApi.createSession();
      session.addEventListener('open', function(id) {
        expect(id).toBeTruthy();
        sessionId = id;
        done();
      })
    });
    
    describe("after connecting a client", function() {
      
      var hostDataChannel;
      var clientDataChannel;
      
      beforeEach(function(done) {
        session.addEventListener('connection', function(channel) {
          hostDataChannel = channel;
          if (clientDataChannel)
            done();
        });
        var client = lobbyApi.joinSession(sessionId);
        client.addEventListener('open', function(channel) {
          clientDataChannel = channel;
          if (hostDataChannel)
            done();
        });
      });
      
      it("should be able to connect a client", function(done) {
        var clientMsg = 'ping';
        var serverMsg = 'pong';
        clientDataChannel.addEventListener('message', function(e) {
          expect(e.data).toBe(serverMsg);
          done();
        });

        hostDataChannel.addEventListener('message', function(e) {
          expect(e.data).toBe(clientMsg);
          hostDataChannel.send(serverMsg);
        });

        clientDataChannel.send(clientMsg);
      });      
    });
  }); 

});