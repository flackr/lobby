import type { TransportInterface } from '../../src/server/server';

export class MockTransport implements TransportInterface {
  sendMail(mailOptions: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<{ messageId: string }> {
    console.log(`Mock e-mail sent to ${mailOptions.to}`);
    return new Promise((resolve) => {
      resolve({ messageId: '<1234@localhost>' });
    });
  }
}
