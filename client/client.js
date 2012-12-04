// namespace mock
var mock = {};

mock.search = function(search_options) {
  var game = {
    'game': 'Mock Game Name',
    'connection_details': 'Connect to the game address.',
    'players': 5,
    'status': 'awaiting_players',
    'accepting': true,
    'observable': true,
    'public': true
  };

  var game_list = [];

  for (var i = 0; i < 20; i++)
    game_list.push(game);

  return game_list;
};

// namespace client
var client = {};

// Returns a list of games that match the criteria defined in search_options.
client.search = function(search_options) {
  return search_options.return_mock_data ? mock.search(search_options) : [];
};
