# Lobby System Repository

**A backend and library for creating and managing game lobbies, rooms, and real-time game events, built with Node.js, PostgreSQL, and designed for WebRTC peer-to-peer gaming.**

This repository contains the code for a robust and flexible lobby system designed to facilitate multiplayer games.
It provides the foundation for features like user management, room creation, user joining, and handling real-time game events with persistence and different consistency levels.

## Key Features

  * **User Management:**
      * User registration and authentication (basic user table structure included).
  * **Room Management:**
      * Create and manage game rooms with various visibility settings (public, friends-only, private with room codes).
      * Room descriptions and customizable names.
      * Unique room URLs for direct session access.
  * **User Room Membership:**
      * Users can join and leave rooms.
      * Track users currently in a room.
  * **Event Handling:**
      * Flexible event system for capturing and processing game actions within rooms.
      * Event persistence in a PostgreSQL database for asynchronous gameplay and history.
      * **Three Event Types:**
          * **Ordered Events (Critical):** For core game state changes requiring strict global ordering and consistency, processed through a central broadcaster.
          * **Eventually Consistent Events (Non-Critical):** For updates where minor inconsistencies are acceptable, distributed directly peer-to-peer with timestamp-based ordering.
          * **Transient Events (Ephemeral):** For real-time, UI-focused updates like mouse positions that are not persisted and only relevant to active players.
  * **Game State Management:**
      * Stores and updates room game state as JSON blobs in the database.
      * Tracks the timestamp of the last processed event to ensure correct state replay and asynchronous consistency.
  * **Experience Definition:**
      * `experiences` table to define different game types with URLs, names, descriptions, and other details.
      * Mapping from URLs to specific game experiences.
  * **TypeScript Ready:**  Codebase designed with TypeScript types for improved maintainability and type safety.

## Technologies Used

  * **Backend:**
      * **Node.js:**  Runtime environment for the server-side logic.
      * **PostgreSQL:** Relational database for persistent storage of users, rooms, events, and game state.
      * **`pg` library:** PostgreSQL client for Node.js.
      * **`ws` (To be implemented):** For initial signaling and potential server-assisted communication (though the core game is P2P).
      * **`http` module:** Node.js core HTTP module (used in mock fetch).
  * **Frontend (Conceptual/Library Focus):**
      * **WebRTC:**  For peer-to-peer data channel communication within game rooms.
      * **JavaScript/TypeScript:**  For frontend and library code.

## Setup Instructions

1.  **Prerequisites:**

    * [Node.js](https://nodejs.org) (version \>= 22 recommended)
    * [PostgreSQL](https://www.postgresql.org)
    * `npm` package manager
    * `postfix` SMTP server

2.  **Clone the Repository:**

    ```bash
    git clone https://github.com/flackr/lobby.git
    cd lobby
    ```

3.  **Install Dependencies:**

    ```bash
    npm install
    ```

4.  **Database Setup:**

    * Create a PostgreSQL database for the lobby system (e.g., `lobby_db`).
    * Configure database connection details:
        * Copy `.env.template` file to `.env` in the root directory of the repository.
        * Replace with your PostgreSQL credentials.

5.  **SMTP settings:**

    * Update the SMTP variables in `.env` with the server credentials.

6.  **Run Database Initialization:**

    * Execute the database schema creation scripts. This will create the necessary tables (`users`, `rooms`, `room_users`, `room_events`, `room_states`, `experiences`).
    ```bash
    npm run initialize
    ```

7.  **Run the Server:**

    * The repository includes a Node.js server:
    ```bash
    npm run start
    ```

## Usage/Example

*(Example code snippets and usage instructions will be added here as the library and backend are further developed. For now, refer to the code examples within the repository itself, particularly in test files or example directories if available).*

**Conceptual Example (Illustrating Event Handling):**

```js
// ... (Assume you have initialized a GameRoom instance) ...

const gameRoom = new GameRoom(roomId, isBroadcaster, (event) => {
    if (event.isOrdered) {
        // Handle critical ordered events to update core game state
        console.log("Ordered Event received:", event);
        if (event.eventType === 'player_move') { /* ... update game state ... */ }
    } else if (event.isEventual) {
        // Handle eventually consistent events
        console.log("Eventual Event received:", event);
        if (event.eventType === 'player_position_update') { /* ... update position ... */ }
    } else if (event.isTransient) {
        // Handle transient, real-time events
        console.log("Transient Event received:", event);
        if (event.eventType === 'mouse_position') { /* ... update UI cursor ... */ }
    }
});

// Sending different types of events:
gameRoom.sendOrderedEvent('player_move', { playerId: 'user123', /* ... move data ... */ });
gameRoom.sendEventualEvent('chat_message', { sender: 'user123', message: 'Hello!' });
gameRoom.sendTransientEvent('mouse_position', { playerId: 'user123', x: 100, y: 200 });
```

## Architecture Overview

This lobby system employs a hybrid client-server and peer-to-peer architecture:

  * **Database (PostgreSQL):** Serves as the persistent data store for users, rooms, event history, and game states.
  * **Node.js Backend (Optional/Signaling - To be implemented):**
      * Used for initial user authentication and room listing/discovery.
      * WebRTC signaling (exchange of SDP and ICE candidates between peers).
  * **WebRTC Data Channels (Peer-to-Peer):**  The primary communication channel for real-time game events between players within a room, enabling low-latency interaction.
  * **Event Handling Flow:**
      * **Ordered Events:** Generated peer -\> Broadcaster -\> All Peers (in order) -\> Database (persistence).
      * **Eventually Consistent Events:** Generated peer -\> Directly broadcast to all peers -\> Optionally database (persistence).
      * **Transient Events:** Generated peer -\> Directly broadcast to all *active* peers (no persistence).

## Contribution Guidelines

Contributions are welcome\! To contribute to this repository:

1.  Fork the repository.
2.  Create a new branch for your feature or bug fix: `git checkout -b feature/your-feature-name` or `git checkout -b fix/bug-fix-name`.
3.  Make your changes and commit them: `git commit -m "Add your descriptive commit message"`.
4.  Push your branch to your fork: `git push origin feature/your-feature-name`.
5.  Create a pull request to the main repository.

Please follow coding style conventions used in the project and provide clear and concise commit messages and pull request descriptions.

## License

This project is licensed under the Apache 2.0 License - see the [LICENSE.md](LICENSE.md) file for details.

-----

**Project Status: Under Development**

This project is currently under active development and is not yet feature-complete. Expect changes and updates as development progresses.

