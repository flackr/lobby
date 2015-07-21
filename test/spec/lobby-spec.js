describe("lobby.Lobby", function() {

  var lobbyApi;
  var testPort = '1234';
  var server;

  beforeEach(function() {
    // Mock out communication, then run server
    installWebSocketMock();
    lobbyApi = new lobby.LobbyApi(new lobby.WebSocketSignalingClient('ws://localhost:'+testPort));
    server = new Server(testPort);
  });

  describe("after creating a game", function() {

    var session;
    var sessionId;
    var hostDataChannel;

    beforeEach(function(done) {
      session = lobbyApi.createSession(function(callback) {
        var hostRtcConnection = new RTCPeerConnection(null, {optional: [{RtpDataChannels: true}]});
        setTimeout(function(){
          hostDataChannel = hostRtcConnection.createDataChannel("data", {reliable: false});
        }, 0);
        return hostRtcConnection;
      });
      session.addEventListener('open', function(id) {
        expect(id).toBeTruthy();
        sessionId = id;
        done();
      })
    });
    
    it("should be able to connect a client", function(done) {
      var clientMsg = 'ping';
      var serverMsg = 'pong';
      var clientRtcPeerConnection = new RTCPeerConnection(null, {optional: [{RtpDataChannels: true}]});
      var client = lobbyApi.joinSession(sessionId, clientRtcPeerConnection);
      var clientDataChannel;
      clientRtcPeerConnection.ondatachannel = function(e) {
        clientDataChannel = e.channel;
        client.close();
        clientDataChannel.addEventListener('message', function(e) {
          expect(e.message).toBe(serverMsg);
          done();
        });
        hostDataChannel.addEventListener('message', function(e) {
          expect(e.message).toBe(clientMsg);
          hostDataChannel.send(serverMsg);
        });
        clientDataChannel.send(clientMsg);
      };
    })
      
  }); 

});