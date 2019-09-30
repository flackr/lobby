// Copyright 2019 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';
import * as lobby from '../../../src/lobby.js';

let currentPage = undefined;
function $(selector) {
  return document.querySelector(selector);
}

function showPage(page) {
  if (currentPage) {
    document.body.classList.remove(currentPage);
    $('#' + currentPage).classList.remove('visible');
  }
  document.body.classList.add(page);
  $('#' + page).classList.add('visible');
  currentPage = page;
}

let currentGame;
function onhashchange() {
  // Stop updating if we switch away from the current game.
  if (document.body.classList.contains('auth')) {
    if (window.location.hash.startsWith('#game-')) {
      loadGame(window.location.hash.substring(6));
      return;
    }
    // If authenticated, default to the listing page if a valid page is not
    // specified.
    if (['#list', '#create'].indexOf(window.location.hash) == -1)
      window.location = '#list';
    showPage('page-' + window.location.hash.substring(1));
  } else {
    // If not authenticated, allow user to view registration page.
    if (window.location.hash == '#register') {
      showPage('page-register')
      return;
    }
    // Otherwise, show the login page.
    showPage('page-login');
  }
}

window.hidemenu = function() {
  document.querySelector('.mdl-layout__obfuscator').click();
}

let service;
let client;
let listingRoom;

const DEFAULT_MATRIX_HOST = 'https://matrix.org';
const LISTING_ROOM = '!qZGjDGznXuUhkkyAEa:matrix.org';

async function init() {
  showPage('loading');
  service = await lobby.createService({
    appName: 'com.github.flackr.lobby.Chat',
    defaultHost: DEFAULT_MATRIX_HOST,
    lobbyRoom: LISTING_ROOM,
  });
  window.service = service;
  if (client = await service.reauthenticate()) {
    // show games list
    onlogin();
  } else {
    onhashchange();
  }
  $('#login-form').addEventListener('submit', function(evt) {
    evt.preventDefault();
    login();
  });
  $('#register-form').addEventListener('submit', function(evt) {
    evt.preventDefault();
    register();
  });
  $('#login-guest').addEventListener('click', loginGuest);
  $('#room-form').addEventListener('submit', function(evt) {
    evt.preventDefault();
    createRoom();
  })
  $('#logout').addEventListener('click', function(evt) {
    evt.preventDefault();
    client.logout();
    onlogout();
  });
  $('#leave-button').addEventListener('click', leaveRoom);
  $('#game-chat').addEventListener('keypress', gameChatKeypress);
  window.addEventListener('hashchange', onhashchange);
}

async function loginGuest() {
  try {
    if (!(client = await service.loginAsGuest(DEFAULT_MATRIX_HOST))) {
      console.error('Guest login failed');
      return;
    }
    onlogin();
  } catch (e) {
    showError(e);
  }
}

async function login() {
  console.log('attempting log in');
  try {
    if (!(client = await service.login($('#login-user-id').value, $('#login-password').value))) {
      console.error('Login failed');
      return;
    }
    onlogin();
  } catch (e) {
    showError(e);
  }
}

async function register() {
  console.log('attempting log in');
  try {
    if (!(client = await service.register($('#register-user-id').value, $('#register-password').value))) {
      console.error('Login failed');
      return;
    }
    onlogin();
  } catch (e) {
    showError(e);
  }
}

function createRoomElement(room) {
  let elem = stampTemplate('.room');

  elem.querySelector('.title').textContent = room.state_.state['m.room.topic'].content.topic;
  let members = room.state_.activeMembers();
  let memberDisplayNames = [];
  for (let user_id in members) {
    memberDisplayNames.push(members[user_id].displayname);
  }
  elem.querySelector('.details').textContent = memberDisplayNames.join(', ');

  let btn = elem.querySelector('.join');
  btn.setAttribute('room-id', room.room_id);
  btn.addEventListener('click', function(evt) {
    evt.preventDefault();
    window.location = '#game-' + btn.getAttribute('room-id');
  });
  return elem;
}

function showError(e) {
  console.error(e);
  let data = {
    message: e.message,
    timeout: 8000,
  };
  if (data.message.length > 100)
    data.message = data.message.substring(0, 97) + '...';
  if (e.details && e.details.consent_uri) {
    data.actionHandler = function() {
      window.location = e.details.consent_uri;
    }
    data.actionText = 'Consent';
  }
  $('#snackbar').MaterialSnackbar.showSnackbar(data);
  // Rethrow the error if it's not a lobby error
  if (!(e instanceof lobby.MatrixError))
    throw e;
}

async function onlogin() {
  document.body.classList.add('auth');
  // Fire the hashchange handler to update the currently visible page.
  onhashchange();
  $('#user').textContent = client.user_id;
  try {
    updateListings(await client.lobby());
  } catch (e) {
    showError(e);
  }
}

async function updateListings(lobby) {
  // Clear all existing rooms.
  $('#rooms').innerHTML = '';

  const EXTRA_HEIGHT = 200;
  let scroller = document.querySelector('.mdl-layout__content');

  let addRooms = function(rooms, beforeChild) {
    for (let i = 0; i < rooms.length; i++) {
      $('#rooms').insertBefore(createRoomElement(rooms[i]), beforeChild);
    }
  }

  let maybeFetchHistory = async function() {
    if (scroller.getBoundingClientRect().bottom < $('#rooms').getBoundingClientRect().bottom - EXTRA_HEIGHT)
      return;
    while (scroller.getBoundingClientRect().bottom >= $('#rooms').getBoundingClientRect().bottom - EXTRA_HEIGHT) {
      // Avoid additional calls while syncing history.
      scroller.removeEventListener('scroll', maybeFetchHistory);

      let prev = await lobby.syncRooms(true);
      if (!lobby.connected || prev == null) {
        // Nothing more to sync
        return;
      }
      addRooms(prev, null);
    }
    scroller.addEventListener('scroll', maybeFetchHistory);
  }

  let rooms = await lobby.syncRooms();
  if (!lobby.connected)
    return;
  scroller.addEventListener('scroll', maybeFetchHistory);
  addRooms(rooms, $('#rooms').firstChild);
  maybeFetchHistory();
  while (true) {
    rooms = await lobby.syncRooms();
    if (!lobby.connected)
      break;
    addRooms(rooms, $('#rooms').firstChild);
  }
  scroller.removeEventListener('scroll', maybeFetchHistory);
}

async function onlogout() {
  document.body.classList.remove('auth');
  showPage('page-login');
  $('#user').textContent = '';
}

function stampTemplate(template, details) {
  let instance = document.querySelector('#templates > ' + template).cloneNode(true);
  for (let field in details) {
    instance.querySelector('.' + field).textContent = details[field];
  }
  return instance;
}

async function loadGame(room_id) {
  $('#game-log').innerHTML = '';
  showPage('page-game');
  let game = await client.join(room_id);
  currentGame = game;
  while (true) {
    let events = await game.fetchEvents();
    // TODO: Also stop updating if we're not currently viewing the game.
    if (!game == currentGame)
      return;
    let wasScolledToBottom = $('#game-log').scrollTop >= $('#game-log').scrollHeight - $('#game-log').clientHeight;
    for (let evt of events) {
      let div = stampTemplate('.chat-message', {
        sender: evt.sender,
        body: evt.content.body,
      });
      $('#game-log').appendChild(div);
    }
    if (wasScolledToBottom)
      $('#game-log').scrollTop = $('#game-log').scrollHeight - $('#game-log').clientHeight;
  }
}

function gameChatKeypress(evt) {
  if (!currentGame)
    return;
  if (evt.keyCode == 13) {
    let msg = evt.target.value;
    evt.target.value = '';
    currentGame.sendEvent('m.room.message', {
      msgtype: 'm.text',
      body: msg,
    });
  }
}

function leaveRoom() {
  if (!currentGame)
    return;
  currentGame.leave();
  window.location.hash = 'list';
}

async function createRoom() {
  try {
    let room_id = await client.create({topic: $('#room-topic').value});
    let lobby = await client.lobby();
    let joinUrl = window.location.origin + window.location.pathname + '#game-' + room_id;
    if (lobby) {
      lobby.advertise({
        'room_id': room_id,
        'url': joinUrl,
      });
    }
    window.location = '#game-' + room_id;
  } catch (e) {
    showError(e);
  }
}

document.addEventListener('DOMContentLoaded', init);
