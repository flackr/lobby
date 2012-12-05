
var lobby = lobby || {};

lobby.GameLobby = (function() {

  /**
   * How often we automaticaly request an update to the games list in ms.
   * @type {Number}
   * @const
   */
  var recheckInterval = 20000;

  /**
   * Ignore a recheck if too close to the previous.
   * @type {Number}
   * @const
   */
  var minimumListRefreshInterval = 2000;

  /**
   * URL for the Lobby used if not specified as a query parameter of the form:
   * '?lobby=url'.
   * @type {string}
   */
  var defaultLobbyUrl = 'http://localhost:9999';

  /**
   * Resolved URL for the lobby.
   * @type {string}
   */
  var lobbyUrl = undefined;

  // TODO: Implement click spamming safeguard.
  var lastRefresh = null;

  /**
   * Constructor.
   */
  function GameLobby() {
    var element = document.createElement('div');
    GameLobby.decorate(element);
    return element;
  }

  /**
   * Morphs an HTML element into a game lobby.
   * @param {!Element} el Element to embelish.
   */
  GameLobby.decorate = function(el) {
    el.__proto__ = GameLobby.prototype;
    el.decorate();
  };

  /**
   * Force an immediate update of the game list.
   */
  GameLobby.refresh = function() {
    var lobbies = document.querySelectorAll('.game-lobby-list');
    for (var i = 0; i < lobbies.length; i++) {
      lobbies[i].requestListUpdate(false);
    }
  };

  GameLobby.setUrl = function(url) {
    lobbyUrl = url;
  };

  GameLobby.setDefaultUrl = function(url) {
    defaultLobbyUrl = url;
  };

  GameLobby.prototype = {
    __proto__: HTMLDivElement.prototype,

    /**
     * List of raw info for each game.
     * @type{Array.<Object>}
     */
    games_: undefined,

    /**
     * Optional filter for restricting games.
     */
    filter_: undefined,

    /**
     * Connects the list update mechanism.
     */
    decorate: function() {

      this.games_ = [];

      this.requestListUpdate(true);
    },

    refresh: function() {
      this.requestListUpdate(false);
    },

    /**
     * Sets filter for restricting games.
     * @param {Object<string,string>} filter.
     */
    setFilter: function(filter) {
      this.filter_ = filter;
    },

    getUrl: function() {
      return lobbyUrl;
    },

    /**
     * Updates the display.
     * @param {Array.<Ojbect>} list List of game info.
     * @param {boolean} autoRepeat Indicates if another request should be
     *     queued.
     */
    updateGameList: function(list, autoRepeat) {

      // TODO: Handle incremental update of list.
      this.games_ = list;

      while(this.firstChild)
        this.removeChild(this.firstChild);

      // TODO - display data.

      // Add headers.
      var header = document.createElement('div');
      header.className = 'game-entry game-entry-header';
      this.appendChild(header);
      var addField = function(row, name, className) {
        var label = document.createElement('div');
        label.textContent = name;
        label.className = className;
        row.appendChild(label);
      }
      var addStatusIcon = function(parent, name, state) {
        var element = document.createElement('div');
        element.classList.add(name);
        element.classList.add('game-status-icon');
        element.setAttribute('disabled', !state);
        parent.appendChild(element);
      };
 
      addField(header, 'Status', 'game-list-status-column');
      addField(header, 'Game', 'game-list-name-column');
      addField(header, 'Hosted By', 'game-list-hosted-column');
      addField(header, 'Description', 'game-list-description-column');

      for (var i = 0; i < list.length; i++) {
        var data = this.games_[i];

        if (this.filter_) {
          var match = true;
          for (var key in this.filter_) {
            if(this.filter_[key] != data[key]) {
              match = false;
              continue;
            }
          }
          if (!match)
            continue;
        }

        var entry = document.createElement('div');
        entry.className = 'game-entry';

        // TODO - custom status flags.
        // Status, accepting, observable and password can be squeezed into a
        // set of icons with tooltips.
        var flags = document.createElement('div');
        flags.classList.add('game-status-flags');
        flags.classList.add('game-list-status-column');
        addStatusIcon(flags,
                      'status-waiting',
                      data.status == 'awaiting_players');
        addStatusIcon(flags,
                      'status-accepting-players',
                      data.accepting);
        addStatusIcon(flags,
                      'status-observable',
                      data.observable);
        addStatusIcon(flags,
                      'status-password-protected', 
                      data.password.length > 0);

        entry.appendChild(flags);

        addField(entry, data.name, 'game-list-name-column');
        addField(entry, data.gameId, 'game-list-hosted-column');
        addField(entry, data.description, 'game-list-description-column');

        this.appendChild(entry);

        entry.addEventListener('click', this.onSelectGame.bind(this, data), true);
      }

      if (autoRepeat) {
        var self = this;
        setTimeout(function() {
          self.requestListUpdate(true);
        }, recheckInterval);
      }
    },

    /**
     * Requests an update to the game list.
     * @param {boolean}  autoRepeat Indicates of the request should be repeated
     *     at a regular interval.
     */
    requestListUpdate: function(autoRepeat) {
      var self = this;
      var xmlHttp = new XMLHttpRequest();
      xmlHttp.onreadystatechange = function() {
        if (xmlHttp.readyState == 4 && xmlHttp.status == 200) {
          var response = xmlHttp.response;
          var json = JSON.parse(response);
          self.updateGameList(json.games, autoRepeat);
        }
      };
      var url = lobbyUrl + '/list';
      xmlHttp.open( "GET", url, true );
      xmlHttp.send( null );
    },

    onSelectGame: function(data) {
      // TODO: Launch game.
      console.log('selected ' + data.name + ' hosted by ' + data.gameId);
    },
   
   
  };

  /**
   * Any element that includes "game-lobby-list" in the class list is converted
   * to an instance of GameLobby.  The list of games automatically udpates for
   * each instance.  
   */
  function initialize() {
   
    if (!lobbyUrl) {
      var query = window.location.search;
      if (query && query.length > 0) {
        var params = query.slice(1).split('&');
        for (var i = 0; i < params.length; i++) {
          var pair = params[i].split('=');
          if (pair[0] == 'lobby')
             lobbyUrl = 'http://' + pair[1];
        }
      }
      if (!lobbyUrl)
        lobbyUrl = defaultLobbyUrl;
    }
    var lobbies = document.querySelectorAll('.game-lobby-list');
    for (var i = 0; i < lobbies.length; i++)
      GameLobby.decorate(lobbies[i]);
  }

  window.addEventListener('load', initialize, false);

  return GameLobby;

})();
