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

  getLastMail(): MailOptions | null {
    let lastMail = this.#lastMail;
    this.#lastMail = null;
    return lastMail;
  }

  async sendMail(mailOptions: MailOptions): Promise<{ messageId: string }> {
    this.#lastMail = mailOptions;
    return new Promise((resolve) => {
      resolve({ messageId: '<1234@localhost>' });
    });
  }
}
