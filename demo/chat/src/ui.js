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
  if (currentPage)
    $('#' + currentPage).classList.remove('visible');
  $('#' + page).classList.add('visible');
  currentPage = page;
}

let currentGame;
function onhashchange() {
  // Stop updating if we switch away from the current game.
  if (currentGame) {
    currentGame.quit();
    currentGame = null;
  }
  if (document.body.classList.contains('auth')) {
    if (window.location.hash.startsWith('#game-')) {
      loadGame(window.location.hash.substring(6));
      return;
    }
    // If authenticated, the only other valid page is the listing page.
    // Update the url to reflect this if necessary.
    if (window.location.hash != '#list')
      window.location = '#list';
    showPage('page-list');
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

let client;
let listingRoom;

const DEFAULT_MATRIX_HOST = 'https://matrix.org';
const LISTING_ROOM = '!qZGjDGznXuUhkkyAEa:matrix.org';

async function init() {
  showPage('loading');
  client = await lobby.createClient('com.github.flackr.lobby.Chat');
  window.client = client;
  if (await client.reauthenticate()) {
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
  $('#create').addEventListener('click', createRoom);
  $('#logout').addEventListener('click', function(evt) {
    evt.preventDefault();
    client.logout();
    onlogout();
  });
  $('#game-chat').addEventListener('keypress', gameChatKeypress);
  window.addEventListener('hashchange', onhashchange);
}

async function loginGuest() {
  if (!(await client.loginAsGuest(DEFAULT_MATRIX_HOST))) {
    console.error('Guest login failed');
    return;
  }
  onlogin();
}

async function login() {
  console.log('attempting log in');
  if (!(await client.login($('#login-user-id').value, $('#login-password').value))) {
    console.error('Login failed');
    return;
  }
  onlogin();
}

async function register() {
  console.log('attempting log in');
  if (!(await client.register($('#register-user-id').value, $('#register-password').value))) {
    console.error('Login failed');
    return;
  }
  onlogin();
}

function createRoomElement(room_id, name) {
  let btn = document.createElement('button');
  btn.className = 'mdl-button mdl-js-button mdl-js-ripple-effect';
  btn.textContent = name;
  // TODO: Add attribute to game event for room id and/or direct link.
  btn.setAttribute('room-id', room_id);
  btn.addEventListener('click', function(evt) {
    evt.preventDefault();
    window.location = '#game-' + btn.getAttribute('room-id');
    if (btn.parentNode.getAttribute('id') != 'joined')
      $('#joined').appendChild(btn);
  });
  return btn;
}

async function onlogin() {
  document.body.classList.add('auth');
  // Fire the hashchange handler to update the currently visible page.
  onhashchange();
  $('#user').textContent = client.user_id;
  let room = await client.join(LISTING_ROOM);
  listingRoom = room;
  // Clear all existing rooms.
  $('#rooms').innerHTML = '';
  $('#joined').innerHTML = '';
  let joinedRooms = await client.joinedRoomStates();
  for (let room_id in joinedRooms) {
    let element = createRoomElement(room_id, joinedRooms[room_id]['m.room.topic'].topic);
    $('#joined').appendChild(element);
  }
  while (true) {
    // TODO: Only fetch N most recent events rather than all events.
    let events = await room.fetchEvents();
    if (!room.connected)
      return;
    for (let evt of events) {
      if (evt.content.url == window.location.origin + window.location.pathname && evt.content.room_id) {
        // Skip rooms we're already in.
        if (joinedRooms[evt.content.room_id])
          continue;
        // TODO: Support removal / update events for existing games.
        let btn = createRoomElement(evt.content.room_id, evt.sender);
        $('#rooms').appendChild(btn);
      }
    }
  }
}

async function onlogout() {
  if (listingRoom) {
    listingRoom.quit();
    listingRoom = null;
  }
  if (currentGame) {
    currentGame.quit();
    currentGame = null;
  }
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
  showPage('page-game');
  let game = await client.join(room_id);
  currentGame = game;
  $('#game-log').innerHTML = '';
  while (true) {
    // TODO: Only fetch N most recent events rather than all events.
    let events = await game.fetchEvents();
    if (!game.connected)
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
  if (evt.key == 'Enter') {
    let msg = evt.target.value;
    evt.target.value = '';
    currentGame.sendEvent('m.room.message', {
      msgtype: 'm.text',
      body: msg,
    });
  }
}

async function createRoom() {
  let room_id = await client.create(listingRoom);
  let joinUrl = window.location.origin + window.location.pathname + '#game-' + room_id;
  listingRoom.sendEvent('m.room.message', {
    msgtype: 'm.text',
    body: 'Created game at ' + joinUrl,
    url: window.location.origin + window.location.pathname,
    room_id 
  });
  window.location = '#game-' + room_id;
}

document.addEventListener('DOMContentLoaded', init);
