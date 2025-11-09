import bcrypt from 'bcrypt';
import type { PGInterface } from './types';

export type RegistrationData = {
  alias: string;
  email: string;
  password: string;
};

const SALT_ROUNDS = 12;

export class AuthenticationHandler {
  #db: PGInterface;

  constructor(db: PGInterface) {
    this.#db = db;
  }

  async registerUser(address: string, data: RegistrationData): Promise<void> {
    const { alias, email, password } = data;
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    console.log(`Registering user: ${alias}, ${email} for ${address}`);
  }
};
