
var lobby = {};

lobby.GameLobby = (function() {

  /**
   * How often we automaticaly request an update to the games list in ms.
   */
  var recheckInterval = 20000;

  /**
   *  Ignore a recheck if too close to the previous.
   */
  var minimumListRefreshInterval = 2000;

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
  }

  /**
   * Force an immediate update of the game list.
   */
  GameLobby.refresh = function() {
    var lobbies = document.querySelectorAll('.game-lobby-list');
    for (var i = 0; i < lobbies.length; i++) {
      lobbies[i].requestListUpdate(false);
    }
  }

  GameLobby.prototype = {
    __proto__: HTMLDivElement.prototype,

    /**
     * List of raw info for each game.
     * @type{Array.<Object>}
     */
    games_: undefined,

    /**
     * Columns to report in the game list.
     */
    columns_: undefined,

    /**
     * Connects the list update mechanism.
     */
    decorate: function() {

      this.games_ = [];

      this.requestListUpdate(true);
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
      var addField = function(row, name) {
        var label = document.createElement('div');
        label.textContent = name;
        row.appendChild(label);
      }
      var addStatusIcon = function(parent, name, state) {
        var element = document.createElement('div');
        element.classList.add(name);
        element.classList.add('game-status-icon');
        element.setAttribute('disabled', !state);
        parent.appendChild(element);
      };
 
      addField(header, 'Status');
      addField(header, 'Game');
      addField(header, 'Hosted By');
      addField(header, 'Description');

      for (var i = 0; i < list.length; i++) {
        var data = this.games_[i];
        var entry = document.createElement('div');
        entry.className = 'game-entry';

        // TODO - custom status flags.
        // Status, accepting, observable and password can be squeezed into a
        // set of icons with tooltips.
        var flags = document.createElement('div');
        flags.className = 'game-status-flags';
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

        addField(entry, data.name);
        addField(entry, data.gameId);
        addField(entry, data.description);

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
      var url = window.location + 'list';
      xmlHttp.open( "GET", url, true );
      xmlHttp.send( null );
    },

    onSelectGame: function(data) {
      // TODO: Launch game.
      console.log('selected ' + data.name + ' hosted by ' + data.gameId);
    }
   
  };

  /**
   * Any element that includes "game-lobby-list" in the class list is converted
   * to an instance of GameLobby.  The list of games automatically udpates for
   * each instance.  
   */
  function initialize() {
    var lobbies = document.querySelectorAll('.game-lobby-list');
    for (var i = 0; i < lobbies.length; i++)
      GameLobby.decorate(lobbies[i]);
  }

  window.addEventListener('load', initialize, false);

  return GameLobby;

})();
