
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
  var defaultLobbyUrl = 'http://lobby-flack.dotcloud.com';

  /**
   * Resolved URL for the lobby.
   * @type {string}
   */
  var lobbyUrl = undefined;

  // TODO: Implement click spamming safeguard.
  var lastRefresh = null;

  var listUrl;

  var gameId = '';

  /**
   * Constructor.
   */
  function GameLobby() {
    var element = document.createElement('div');
    GameLobby.decorate(element);
    return element;
  }


  /**
   * Color scheme for the lobby UI elements.
   * @const
   */
  GameLobby.ColorScheme = {
    DEFAULT: {
      'lobby-background': '#f5f5f5',
      'lobby-border': 'black',
      'lobby-separator': 'rgba(80, 80, 40, 0.3)',
      'lobby-text': 'black',
      'header-background': 'rgb(80, 80, 40)',
      'header-text': 'white',
      'highlight-background': 'rgba(80, 80, 40, 0.3)',
      'highlight-text': 'black',
      'icon-filter': 'none',
    },
    LIGHT_ON_DARK: {
      'lobby-background': 'black',
      'lobby-border': 'white',
      'lobby-separator': '#555',
      'lobby-text': 'white',
      'header-background': '#aaa',
      'header-text': 'black',
      'highlight-background': '#999',
      'highlight-text': 'black',
      'icon-filter': 'invert(0.8)',
    },
  };

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
   * @deprecated
   */
  GameLobby.refresh = function() {
    console.log('call to deprecated method.');
  };

  GameLobby.setUrl = function(url) {
    lobbyUrl = url;
  };

  GameLobby.setDefaultUrl = function(url) {
    defaultLobbyUrl = url;
  };

  GameLobby.getDefaultUrl = function() {
    return defaultLobbyUrl;
  }

  GameLobby.setGameId = function(id) {
    gameId = id;
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

    searchbox_: undefined,

    gameId_: '',

    /**
     * Connects the list update mechanism.
     */
    decorate: function() {

      this.gameId_ = gameId;
      this.games_ = [];

      this.searchbox_ = document.createElement('div');
      var searchInput = document.createElement('input');
      searchInput.className = 'lobby-search';
      var searchButton = document.createElement('button');
      searchButton.classname = 'lobby-search-button';
      searchButton.textContent = 'Search';
      this.searchbox_.appendChild(searchInput);
      this.searchbox_.appendChild(searchButton);
      this.appendChild(this.searchbox_);

      var lobbyList = document.createElement('div');
      lobbyList.className = 'game-lobby-list';
      this.appendChild(lobbyList);

      var self = this;
      searchButton.addEventListener('click', function(evt) {
        self.requestListUpdate(false);
      });
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

    parseQueryParams: function() {
      var query = window.location.search;
      var lobbyIsDefault = !lobbyUrl;

      if (query && query.length > 0) {
        var params = query.slice(1).split('&');
        for (var i = 0; i < params.length; i++) {
          var pair = params[i].split('=');
          if (pair[0] == 'lobby' && lobbyIsDefault) {
            lobbyUrl = 'http://' + pair[1];
          } else if (pair[0] == 'game') {
            var xhr = new XMLHttpRequest();
            var self = this;
            xhr.onreadystatechange = function() {
              if (xhr.readyState == 4 && xhr.status == 200) {
                var game;
                try {
                  game = JSON.parse(xhr.responseText);
                } catch (e) {}
                if (game && game.game) {
                  self.onSelectGame(game.game);
                }
              }
            }
            xhr.open('GET', lobbyUrl + '/details/' + pair[1], true);
            xhr.send(null);
          }
        }
      }
    },

    getUrl: function() {
      if (!lobbyUrl)
        this.parseQueryParams();

      return lobbyUrl || defaultLobbyUrl;
    },

    /**
     * Sets the color scheme for the lobby.
     * @param {!GameLobby.ColorScheme} colors The new color palette, which may
     *    be one of the predefined palettes or customized.
     */
    setColorScheme: function(colors) {
      var palette = {};
      var proto = GameLobby.ColorScheme.DEFAULT;
      for (var key in proto)
        palette[key] = proto[key];
      for(var key in colors)
        palette[key] = colors[key];
      var changeCss = function(rule, property, value) {
        for (var i = 0; i < document.styleSheets.length; i++) {
          var sheet = document.styleSheets[i];
          var cssRules = !!sheet['rules'] ? 'rules' : 'cssRules';
          var rules = sheet[cssRules];
          if (!rules)
            continue;
          for (var j = 0; j < rules.length; j++) {
            var candidate = rules[j];
            if (candidate.selectorText == rule) {
              if (candidate.style[property]) {
                candidate.style[property] = value;
                break;
              }
            }
          }
        }
      };
      changeCss('.game-list-container',
                'background-color',
                palette['lobby-background']);
      changeCss('.game-list-container',
                'border-color',
                palette['lobby-border']);
      changeCss('.game-entry',
                'color',
                palette['lobby-text']);
      changeCss('.game-entry > *',
                'border-right-color',
                palette['lobby-separator']);
      changeCss('.game-entry > *',
                'border-bottom-color',
                palette['lobby-separator']);
      changeCss('.game-entry-header',
                'background-color',
                palette['header-background']);
      changeCss('.game-entry-header',
                'color',
                palette['header-text']);
      changeCss('.game-entry-header:hover',
                'background-color',
                palette['header-background']);
      changeCss('.game-entry-header:hover',
                'color',
                palette['header-text']);
      changeCss('.game-entry:hover',
                'background-color',
                palette['highlight-background']);
      changeCss('.game-entry:hover',
                'color',
                palette['highlight-text']);
      changeCss('.game-entry:hover',
                'color',
                palette['highlight-text']);
      changeCss('.game-status-icon',
                '-webkit-filter',
                palette['icon-filter']);
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

      this.appendChild(this.searchbox_);

      // TODO - display data.

      // Add headers.
      var header = document.createElement('div');
      header.className = 'game-entry game-entry-header';
      this.appendChild(header);
      var addField = function(row, value, className) {
        var label = document.createElement('div');
        if (value instanceof Array) {
          for (var i = 0; i < value.length; i++) {
            var entry = document.createElement('div');
            entry.textContent = value[i];
            label.appendChild(entry);
          }
        } else {
          label.textContent = value;
        }
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
      addField(header, 'Players', 'game-list-players-column');
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
        addField(entry, data.players, 'game-list-players-column');
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
      var url = self.getUrl() + '/list/' + self.gameId_;
      xmlHttp.open( "GET", url, true );
      xmlHttp.send( null );
    },

    onSelectGame: function(data) {
      // TODO: Launch game.
      if (data.url) {
        var url = data.url;
        if (data.params) {
          var re = /(\{[%a-zA-Z]+\})/;
          var params = data.params;
          var result = re.exec(params);
          while (result) {
            var key = result[0].substring(2, result[0].length - 1);
            // TODO: need special treatment for password since not stored in game info.
            var replacement = data[key];
            params = params.replace(result[0], replacement);
            result = re.exec(params);
          }
          url = url + '#' + params;
        }
        window.open(url, '_self', '', false);
      }
    }
  };

  return GameLobby;

})();
