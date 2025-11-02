import { initializeDatabase } from "./server/db";

/**
 * Hides all screens and shows only the specified one.
 * @param {string} viewName The ID of the screen to show (e.g., 'login-screen').
 */
export function showView(viewName) {
  // Get all elements with the class 'screen'
  const screens = document.querySelectorAll('.screen');

  screens.forEach(screen => {
    // Hide all screens
    screen.classList.add('hidden');
  });

  // Show the requested screen
  const targetScreen = document.getElementById(viewName);
  if (targetScreen) {
    targetScreen.classList.remove('hidden');

    // Adjust body alignment for form screens to ensure they are centered vertically
    if (viewName === 'login-screen' || viewName === 'register-screen' || viewName === 'authorize-screen') {
      document.body.style.alignItems = 'center';
    } else {
      document.body.style.alignItems = 'flex-start'; /* Use flex-start or stretch for the dashboard */
    }
  } else {
    console.error(`Screen with ID ${viewName} not found.`);
  }
}

function hashChangeHandler() {
  const hash = window.location.hash.substring(1);
  switch (hash) {
    case 'register':
      showView('register-screen');
      break;
    case 'profile':
      showView('profile-screen');
      break;
    case 'friends':
      showView('friends-screen');
      break;
    case 'authorize':
      showView('authorize-screen');
      break;
    case 'login':
    default:
      showView('login-screen');
      break;
  }
}

function initializeUI() {
  hashChangeHandler();
  window.addEventListener('hashchange', hashChangeHandler);

  // TODO: Implement application logic for these actions
  document.querySelector('#login-screen form').addEventListener('submit', async (event) => {
    event.preventDefault();
    window.location.hash = '#profile';
  });
  document.querySelector('#register-screen form').addEventListener('submit', async (event) => {
    event.preventDefault();
    window.location.hash = '#profile';
  });
  document.querySelector('#show-profile').addEventListener('click', (event) => {
    event.preventDefault();
    window.location.hash = '#profile';
  });
  document.querySelector('#show-friends').addEventListener('click', (event) => {
    event.preventDefault();
    window.location.hash = '#friends';
  });
  document.querySelector('#authorize-test').addEventListener('click', (event) => {
    event.preventDefault();
    window.location.hash = '#authorize';
  });
  document.querySelector('#logout-button').addEventListener('click', (event) => {
    event.preventDefault();
    window.location.hash = '#login';
  });
  document.querySelector('#authorize-button').addEventListener('click', (event) => {
    event.preventDefault();
    // When complete, this will redirect back to the authorizing application.
    window.location.hash = '#profile';
  });
  document.querySelector('#deny-button').addEventListener('click', (event) => {
    event.preventDefault();
    // When complete, this will redirect back to the application with an error.
    window.location.hash = '#profile';
  });

  // Friends list
  document.querySelector('.add-friend-container button').addEventListener('click', (event) => {
    event.preventDefault();
    addFriend();
  });
  renderFriends();
}

// Set the initial view when the page loads
document.addEventListener('DOMContentLoaded', () => {
  initializeUI();
});

// --- Friend List State and Logic ---
let friends = [
  { id: 1, name: "Alice Johnson" },
  { id: 2, name: "Bob Smith" },
  { id: 3, name: "Charlie Brown" }
];
let nextFriendId = 4;

/**
 * Renders the current list of friends to the UI.
 */
function renderFriends() {
  const listElement = document.getElementById('friends-list');
  if (!listElement) return;

  // Clear existing list
  listElement.innerHTML = '';

  if (friends.length === 0) {
    listElement.innerHTML = '<li class="friend-item" style="color: #6b7280; justify-content: center;">You currently have no friends. Add one above!</li>';
    return;
  }

  friends.forEach(friend => {
      const listItem = document.createElement('li');
      listItem.className = 'friend-item';
      listItem.innerHTML = `
        <span class="friend-name">${friend.name}</span>
        <button class="remove-friend-btn">
          Remove
        </button>
      `;
      listItem.querySelector('.remove-friend-btn').addEventListener('click', () => {
        removeFriend(friend.id);
      });
      listElement.appendChild(listItem);
  });
}

/**
 * Adds a new friend based on the input field value.
 */
function addFriend() {
    const input = document.getElementById('new-friend-name') as HTMLInputElement;
    const name = input.value.trim();

    if (name) {
        friends.push({ id: nextFriendId++, name: name });
        input.value = ''; // Clear input
        renderFriends();
    }
}

/**
 * Removes a friend by ID.
 * @param {number} id The ID of the friend to remove.
 */
function removeFriend(id) {
  friends = friends.filter(friend => friend.id !== id);
  renderFriends();
}
