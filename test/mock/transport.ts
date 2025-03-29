import type { TransportInterface } from '../../src/server/server';

type MailOptions = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

export class MockTransport implements TransportInterface {
  #lastMail: MailOptions | null = null;

  getLastMail(): MailOptions {
    if (!this.#lastMail) {
      throw new Error('No e-mails sent');
    }
    return this.#lastMail;
  }

  async sendMail(mailOptions: MailOptions): Promise<{ messageId: string }> {
    console.log(`Mock e-mail sent to ${mailOptions.to}`);
    this.#lastMail = mailOptions;
    return new Promise((resolve) => {
      resolve({ messageId: '<1234@localhost>' });
    });
  }
}
