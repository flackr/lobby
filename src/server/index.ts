import pg from 'pg';
import nodemailer from 'nodemailer';
import 'dotenv/config';

import { Server } from './server.ts';
const { Pool } = pg;

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
};

const smtpConfig = {
  host: process.env.SMTP_HOST,
  secure: (process.env.SECURE || '').toLowerCase() == 'true',
  port: process.env.SMTP_PORT,
  auth: { user: process.env.SMTP_USERNAME, pass: process.env.SMTP_PASSWORD },
};

async function main() {
  run();
}

async function run() {
  for (const key in dbConfig) {
    if (dbConfig[key] === undefined) {
      throw Error('Missing database config var ' + key);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transport = nodemailer.createTransport(smtpConfig as any);
  const pool = new Pool(dbConfig);
  //await pool.connect();
  console.log('Connected to PostgreSQL database.');
  const server = new Server({
    port: parseInt(process.env.PORT),
    emailFrom: process.env.EMAIL_FROM,
    db: pool,
    transport: transport,
    safeNames: process.env.SAFE_NAMES == 'yes',
    limits: {
      verificationCodeMinutes: parseInt(process.env.VERIFICATION_CODE_MINUTES, 10) || undefined,
      maxVerificationEmailsPerHour: parseInt(process.env.MAX_VERIFICATION_EMAILS_PER_HOUR, 10) || undefined,
      maxUnverifiedUsersPerIPPerHour: parseInt(process.env.MAX_UNVERIFIED_USERS_PER_IP_PER_HOUR, 10) || undefined,
      maxCreatedUsersPerIPPerHour: parseInt(process.env.MAX_CREATED_USERS_PER_IP_PER_HOUR, 10) || undefined,
    },
    cleanupDelays: {
      unverifiedUserDays: parseInt(process.env.CLEANUP_UNVERIFIED_USERS_DAYS, 10) || undefined,
      inactiveSessionDays: parseInt(process.env.CLEANUP_INACTIVE_SESSIONS_DAYS, 10) || undefined,
      inactiveUserDays: parseInt(process.env.CLEANUP_INACTIVE_USERS_DAYS, 10) || undefined,
      inactiveRoomDays: parseInt(process.env.CLEANUP_INACTIVE_ROOMS_DAYS, 10) || undefined,
    }
  });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const cleanup = async (options: { cleanup?: boolean; exit?: boolean }) => {
    console.log('Closing database connection and closing the server');
    await Promise.all([server.close(), pool.end()]);
    console.log('Done.');
    process.exit();
  };
  const addr = await server.listen();
  console.log(`Listening on ${addr}.`);
  process.on('SIGINT', cleanup);
}

main();
