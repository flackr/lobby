import bcrypt from 'bcrypt';
import type { ClockAPI } from '../common/interfaces.ts';
import type { PGInterface } from './types.ts';
import type { TransportInterface, LimitsConfig } from './server.ts';
import { randomBytes } from 'crypto';
import type { UserInfo, User, Session } from '../common/types.ts';
import type { VerificationEmail } from './db.ts';

export type RegistrationData = {
  username: string | null;
  password: string | null;
  alias: string;
  email: string | null;
};
export type LoginData = {
  username: string;
  password: string;
}
export type RegistrationResult = {
  resultCode: number;
  message: string;
  sessionId?: string;
}
export type VerificationData = {
  code: string;
  email: string;
};

export type AuthenticationHandlerConfig = {
  db: PGInterface;
  clock: ClockAPI;
  transport: TransportInterface;
  emailFrom: string;
  safeNames: boolean;
  limits: LimitsConfig;
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

  async registerUser(address: string, data: RegistrationData): Promise<RegistrationResult> {
    const { username, password, email, alias } = data;

    let result = await this.#config.db.query<{created: number}>(
      `SELECT COUNT(id) AS created FROM users
       WHERE created_at >= now() - INTERVAL '60 minutes' AND created_ip_address = $1`,
      [address]
    );
    if (result.rows.length > 0 &&
        result.rows[0].created >= this.#config.limits.maxCreatedUsersPerIPPerHour) {
      return {
        resultCode: 429,
        message: 'Too many requests',
      };
    }

    // Input validation
    if (username && (username.length < 3 || username.length > 50 ||
        !/^[a-zA-Z0-9_-]+$/.test(username))) {
      return {
        resultCode: 400,
        message: 'Invalid username',
      };
    }
    if (password && (password.length < 6 || password.length > 128)) {
      return {
        resultCode: 400,
        message: 'Invalid password',
      };
    }
    if (email && (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      return {
        resultCode: 400,
        message: 'Invalid email address',
      };
    }
    if (alias.length < 2 || alias.length > 50) {
      return {
        resultCode: 400,
        message: 'Invalid alias',
      };
    }

    // Check for safe name if enabled.
    if (this.#config.safeNames) {
      const safeNameCheck = await this.#config.db.query(
        `SELECT 1 FROM safe_names WHERE name = $1;`,
        [alias.toLowerCase()]
      );
      if (safeNameCheck.rows.length == 0) {
        return {
          resultCode: 400,
          message: 'Alias is not allowed',
        };
      }
    }

    const hash = password ? await bcrypt.hash(password, SALT_ROUNDS) : null;
    const fields = [
      ['verification_email', email],
      ['hashed_password', hash],
      ['username', username],
      ['alias', alias],
      ['created_ip_address', address]
    ].filter(pair => pair[1] != null);
    let user = await this.#config.db.query<User>(
      `INSERT INTO users (${fields.map(pair => pair[0]).join(', ')})
       VALUES (${fields.map((pair, index) => `\$${index + 1}`).join(', ')}) RETURNING *;`,
      fields.map(pair => pair[1])
    );
    if (user.affectedRows == 0) {
      return {
        resultCode: 500,
        message: 'Failed to create user',
      };
    }
    const userId = user.rows[0].id;
    const sessionId = generateSessionId();
    let session = await this.#config.db.query<Session>(
      `INSERT INTO sessions (session_key, user_id, created_at, active_ip_address, updated_at)
       VALUES ($1, $2, now(), $3, now());`,
      [
        sessionId,
        userId,
        address,
      ]
    );
    if (session.affectedRows == 0) {
      return {
        resultCode: 500,
        message: 'Failed to initialize session',
      };
    }
    if (email) {
      await this.sendVerificationEmail(email, username);
    }
    return {
      resultCode: 200,
      message: 'Registration successful.',
      sessionId: sessionId
    };
  }

  async sendVerificationEmail(email: string, username: string): Promise<void> {
    // TODO: Verify that no e-mail has been sent recently.
    const codeChars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const codeLength = 6;
    const expiryMinutes = this.#config.limits.verificationCodeMinutes;
    let verificationCode = '';
    for (let i = 0; i < codeLength; i++) {
      const randIndex = Math.floor(Math.random() * codeChars.length);
      verificationCode += codeChars[randIndex];
    }
    let emailBody = `Hi ${username},

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
       SET email = $1, verification_email = NULL
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
       WHERE session_key = $1 AND updated_at >= now() - INTERVAL '7 days'
       RETURNING *;`,
      [sessionId, address]
    );
    if (session.affectedRows == 0) {
      return null;
    }
    return session.rows[0];
  }

  async loginUser(address: string, data: LoginData): Promise<RegistrationResult> {
    const { username, password } = data;
    const userResult = await this.#config.db.query<User>(
      `SELECT * FROM users WHERE username = $1;`,
      [username]
    );
    if (userResult.rows.length == 0 || !userResult.rows[0].hashed_password ||
        !await bcrypt.compare(password, userResult.rows[0].hashed_password)) {
      return {
        resultCode: 401,
        message: 'Invalid username or password',
      };
    }
    const user = userResult.rows[0];
    const sessionId = generateSessionId();
    let session = await this.#config.db.query<Session>(
      `INSERT INTO sessions (session_key, user_id, created_at, active_ip_address, updated_at)
       VALUES ($1, $2, now(), $3, now());`,
      [
        sessionId,
        user.id,
        address,
      ]
    );
    if (session.affectedRows == 0) {
      return {
        resultCode: 500,
        message: 'Failed to initialize session',
      };
    }
    return {
      resultCode: 200,
      message: 'Login successful.',
      sessionId: sessionId
    };
  }

  async logoutSession(session: Session, id: number): Promise<void> {
    await this.#config.db.query(
      `DELETE FROM sessions WHERE id = $1 AND user_id = $2;`,
      [id, session.user_id]
    );
  }

  async getUserInfo(session: Session): Promise<UserInfo> {
    const userData = await this.#config.db.query<User>(
      `SELECT id, email, username, alias, verification_email, created_ip_address, created_at, active_at
      FROM users WHERE id = $1;`,
      [session.user_id]
    );
    if (userData.rows.length == 0) {
      throw new Error('User not found');
    }

    // Don't include session_key for security reasons.
    const sessions = await this.#config.db.query<Session>(
      `SELECT id, url, user_id, created_at, active_ip_address, updated_at FROM sessions
       WHERE user_id = $1
       ORDER BY updated_at DESC;`,
      [session.user_id]
    );

    return {
      user: userData.rows[0],
      sessions: sessions.rows,
    };
  }


};
