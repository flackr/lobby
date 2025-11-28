import { readFileSync } from 'fs';
import type { PGInterface } from './types.ts';
import type { User, Session } from '../common/types.ts';

export interface VerificationEmail {
  email: string;
  verification_code: string;
  created_at: Date;
};

export async function cleanupDatabase(client: PGInterface) {
  const sqlTables = [
    'verification_emails',
    'safe_names',
    'users',
    'sessions',
    'rooms',
    'room_events',
    'room_users',
    'database_migrations',
    'daily_statistics',
  ];
  const sqlTypes = ['VISIBILITY', 'EVENT_TYPE'];
  let sqlCommands = [];
  sqlCommands = sqlCommands.concat(
    sqlTables.map(
      (tableName) => `DROP TABLE IF EXISTS "${tableName}" CASCADE ;`
    )
  );
  sqlCommands = sqlCommands.concat(
    sqlTypes.map((typeName) => `DROP TYPE IF EXISTS ${typeName} CASCADE ;`)
  );
  for (const sqlCommand of sqlCommands) {
    await client.query(sqlCommand);
  }
}

export async function initializeDatabase(client: PGInterface) {
  const sqlCommands = [
    // Verification emails that have been sent out.
    `CREATE TABLE verification_emails (
        email VARCHAR(255) PRIMARY KEY,
        verification_code TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );`,
    `CREATE INDEX idx_verification_emails_created ON verification_emails (created_at);`,

    `CREATE TABLE safe_names (
        name TEXT PRIMARY KEY
    );`,

    // Users table.
    // * Guest users and users who have not yet verified have NULL email.
    // * On registration, verification_email is set, and email remains NULL until verified.
    `CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NULL,
        username VARCHAR(50) UNIQUE NOT NULL DEFAULT CONCAT('user-', currval('users_id_seq')::TEXT),
        hashed_password TEXT NULL,
        alias VARCHAR(50) NOT NULL,
        verification_email VARCHAR(255) NULL,
        created_ip_address INET NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        active_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT check_username
        CHECK (
            NOT (username LIKE 'user-%')
            OR username = CONCAT('user-', id::TEXT)
        )
    );`,
    `CREATE UNIQUE INDEX unique_username ON users (username);`,
    `CREATE INDEX idx_users_email ON users (email);`,
    `CREATE INDEX idx_users_active_at ON users (active_at);`,

    // Sessions tracks associated users for each session cookie.
    `CREATE TABLE sessions (
        id SERIAL PRIMARY KEY,
        session_key TEXT UNIQUE NOT NULL,
        url TEXT NULL,
        user_id INTEGER,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        active_ip_address INET NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );`,
    `CREATE UNIQUE INDEX unique_session_key ON sessions (session_key);`,
    `CREATE INDEX idx_sessions_updated ON sessions (updated_at);`,
    `CREATE INDEX idx_sessions_user_id ON sessions (user_id);`,

    `CREATE TYPE VISIBILITY AS ENUM('public', 'friends', 'private');`,
    `CREATE TABLE rooms (
        id SERIAL PRIMARY KEY,
        code VARCHAR(100) NULL,
        creator_user_id INTEGER NOT NULL,
        url TEXT NOT NULL,
        base_url TEXT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT NULL,
        visibility VISIBILITY NOT NULL DEFAULT 'public',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        FOREIGN KEY (creator_user_id) REFERENCES users(id) ON DELETE RESTRICT
    );`,
    `CREATE UNIQUE INDEX idx_rooms_code ON rooms (base_url, code);`,
    `CREATE INDEX idx_rooms_base_url ON rooms (base_url, updated_at);`,
    `CREATE INDEX idx_rooms_visibility ON rooms (base_url, visibility, updated_at);`,

    `CREATE TYPE EVENT_TYPE AS ENUM('joined', 'left', 'snapshot', 'action', 'message');`,
    `CREATE TABLE room_events (
        id BIGSERIAL PRIMARY KEY,
        room_id INTEGER NOT NULL,
        user_id INTEGER NULL,
        event_type EVENT_TYPE NOT NULL DEFAULT 'action',
        event_data JSONB NULL,      -- JSON data specific to the event
        event_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), -- Timestamp of when event occurred (for ordering)
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE, -- If room is deleted, delete room events
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT -- Users with active room events cannot be deleted
    );`,
    `CREATE INDEX idx_room_events_event_type ON room_events (room_id, event_type, id);`,

    `CREATE TABLE room_users (
        room_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        left_at TIMESTAMP WITH TIME ZONE NULL, -- NULL if user is currently in the room,
        alias VARCHAR(100) NOT NULL, -- Alias at time user joined the room
        PRIMARY KEY (room_id, user_id),
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
    );`,
    `CREATE INDEX idx_room_users_joined_at ON room_users (room_id, joined_at);`,
    `CREATE INDEX idx_room_users_left_at ON room_users (room_id, left_at);`,

    `CREATE TABLE daily_statistics (
        time TIMESTAMP WITH TIME ZONE PRIMARY KEY,
        total_users INTEGER NOT NULL,
        daily_active_users INTEGER NOT NULL,
        daily_active_rooms INTEGER NOT NULL,
        weekly_active_users INTEGER NOT NULL,
        weekly_active_rooms INTEGER NOT NULL,
        monthly_active_users INTEGER NOT NULL,
        monthly_active_rooms INTEGER NOT NULL,
        created_rooms INTEGER NOT NULL,
        removed_users INTEGER NOT NULL,
        removed_rooms INTEGER NOT NULL,
        verification_emails INTEGER NOT NULL,
        recovery_emails INTEGER NOT NULL,
        log TEXT NOT NULL
    );`,

    // Track applied migrations of the database.
    `CREATE TABLE database_migrations (
        version_number INTEGER PRIMARY KEY,
        applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        description TEXT NULL -- Optional: description of the migration
    );`,
    // Insert the initial version (e.g. 1) when you first set up the database
    `INSERT INTO database_migrations (version_number, description) VALUES (1, 'Initial schema creation');`,
  ];
  for (const sqlCommand of sqlCommands) {
    await client.query(sqlCommand);
  }
}

export class Database {
  #client: PGInterface;

  constructor(client: PGInterface) {
    this.#client = client;
    initializeDatabase(this.#client);
  }
}
