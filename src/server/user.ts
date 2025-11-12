import bcrypt from 'bcrypt';
import type { ClockAPI } from '../common/interfaces.ts';
import type { PGInterface } from './types';
import type { TransportInterface } from './server.ts';

export type RegistrationData = {
  alias: string;
  email: string;
  password: string;
};

export type AuthenticationHandlerConfig = {
  db: PGInterface;
  clock: ClockAPI;
  transport: TransportInterface;
}

const SALT_ROUNDS = 12;

export class AuthenticationHandler {
  #config: AuthenticationHandlerConfig;

  constructor(config: AuthenticationHandlerConfig) {
    this.#config = config;
  }

  async registerUser(address: string, data: RegistrationData): Promise<void> {
    const { alias, email, password } = data;

    // TODO: Check if the ip address has exceeded registration limits.
    // TODO: Input validation?

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    // TODO: Store user registration.
    await this.sendVerificationEmail(email, alias);
    console.log(`Registering user: ${alias}, ${email} for ${address}`);
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
    /*
    await this.#config.db.query(
      `INSERT INTO verification_emails (email, verification_code, expiry_timestamp)
       VALUES ($1, $2, now() + INTERVAL ${expiryMinutes} MINUTE)
       ON CONFLICT (email) DO UPDATE
       SET verification_code = EXCLUDED.verification_code,
           expiry_timestamp = EXCLUDED.expiry_timestamp,
           created_at = now();`,
      [
        email,
        verificationCode,
      ]
    );*/
    await this.#config.transport.sendMail({
      to: email,
      subject: 'Verify your email for Lobby',
      text: emailBody,
      from: 'no-reply@example.com',
      html: emailBody.replace(/\n/g, '<br>'),
    });
  }
};
