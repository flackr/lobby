describe("lobby.Lobby", function() {

  var testPort = '1234';
  var server;

  beforeEach(function() {
    // Mock out communication, then run server
    installWebSocketMock();
    server = new Server(testPort);
  });
  
  it("should be able to create a game", function() {
    
  });

});