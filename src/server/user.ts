import bcrypt from 'bcrypt';
import type { ClockAPI } from '../common/interfaces.ts';
import type { PGInterface } from './types';
import type { TransportInterface } from './server.ts';
import { randomBytes } from 'crypto';
import type { User, VerificationEmail, Session } from './db.ts';

export type RegistrationData = {
  alias: string;
  email: string;
  password: string;
};

export type VerificationData = {
  code: string;
  email: string;
};

export type AuthenticationHandlerConfig = {
  db: PGInterface;
  clock: ClockAPI;
  transport: TransportInterface;
}

const SALT_ROUNDS = 12;

function generateSessionId() {
  return randomBytes(32).toString('hex');
}

export class AuthenticationHandler {
  #config: AuthenticationHandlerConfig;

  constructor(config: AuthenticationHandlerConfig) {
    this.#config = config;
  }

  async registerUser(address: string, data: RegistrationData): Promise<string> {
    const { alias, email, password } = data;

    // TODO: Check if the ip address has exceeded registration limits.
    // TODO: Input validation?

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    let user = await this.#config.db.query<User>(
      `INSERT INTO users (verification_email, hashed_password, alias, is_guest, created_ip_address)
       VALUES ($1, $2, $3, FALSE, $4) RETURNING *;`,
      [
        email,
        hash,
        alias,
        address,
      ]
    );
    if (user.affectedRows == 0) {
      throw new Error('Failed to create session for new user');
    }
    const userId = user.rows[0].id;
    console.log(userId);
    const sessionId = generateSessionId();
    let session = await this.#config.db.query<Session>(
      `INSERT INTO sessions (session_id, user_id, created_at, active_ip_address, updated_at)
       VALUES ($1, $2, now(), $3, now());`,
      [
        sessionId,
        userId,
        address,
      ]
    );
    if (session.affectedRows == 0) {
      throw new Error('Failed to create session for new user');
    }
    await this.sendVerificationEmail(email, alias);
    return sessionId;
  }

  async sendVerificationEmail(email: string, alias: string): Promise<void> {
    // TODO: Verify that no e-mail has been sent recently.
    const codeChars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const codeLength = 6;
    const expiryMinutes = 15;
    let verificationCode = '';
    for (let i = 0; i < codeLength; i++) {
      const randIndex = Math.floor(Math.random() * codeChars.length);
      verificationCode += codeChars[randIndex];
    }
    let emailBody = `Hi ${alias},

Thanks for signing up to Lobby!

To verify your email address, please enter the following code on the site:

    ${verificationCode}

This code will expire in ${expiryMinutes} minutes.

If you didn’t request this, you can safely ignore this message — no action is needed.

Enjoy!`;
    await this.#config.db.query(
      `INSERT INTO verification_emails (email, verification_code)
       VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE
       SET verification_code = EXCLUDED.verification_code,
           created_at = now();`,
      [
        email,
        verificationCode,
      ]
    );
    await this.#config.transport.sendMail({
      to: email,
      subject: 'Verify your email for Lobby',
      text: emailBody,
      from: 'no-reply@example.com',
      html: emailBody.replace(/\n/g, '<br>'),
    });
  }

  async verifyEmail(session: Session, data: VerificationData): Promise<boolean> {
    const { code, email } = data;
    const record = await this.#config.db.query<VerificationEmail>(
      `SELECT * FROM verification_emails
       WHERE email = $1 AND verification_code = $2
         AND created_at >= now() - INTERVAL '15 minutes';`,
      [email, code]
    );
    if (record.rows.length == 0) {
      return false;
    }
    let user = await this.#config.db.query<User>(
      `UPDATE users
       SET email = $1, is_guest = FALSE, verification_email = NULL
       WHERE id = $2 AND verification_email = $1
       RETURNING id;`,
      [email, session.user_id]
    );
    return user.affectedRows > 0;
  }


  async getSession(address: string, sessionId?: string): Promise<Session | null> {
    if (!sessionId) {
      return null;
    }
    const session = await this.#config.db.query<Session>(
      `UPDATE sessions
       SET updated_at = now(), active_ip_address = $2
       WHERE session_id = $1 AND updated_at >= now() - INTERVAL '7 days'
       RETURNING *;`,
      [sessionId, address]
    );
    if (session.affectedRows == 0) {
      return null;
    }
    return session.rows[0];
  }
};
