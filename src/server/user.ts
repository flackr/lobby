import bcrypt from 'bcrypt';
import type { ClockAPI } from '../common/interfaces.js';
import type { PGInterface } from './types';

export type RegistrationData = {
  alias: string;
  email: string;
  password: string;
};

export type AuthenticationHandlerConfig = {
  db: PGInterface;
  clock: ClockAPI;
}

const SALT_ROUNDS = 12;

export class AuthenticationHandler {
  #config: AuthenticationHandlerConfig;

  constructor(config: AuthenticationHandlerConfig) {
    this.#config = config;
  }

  async registerUser(address: string, data: RegistrationData): Promise<void> {
    const { alias, email, password } = data;
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    console.log(`Registering user: ${alias}, ${email} for ${address}`);
  }
};
