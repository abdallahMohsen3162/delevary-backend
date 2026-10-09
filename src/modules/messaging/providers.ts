import { Inject, Injectable } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { CONFIG, type AppConfig } from '../../config/config';

export type MessagePayload = { destination: string; text: string };
export interface MessagePort {
  send(payload: MessagePayload, idempotencyKey: string): Promise<void>;
}
@Injectable()
export class OpenWaProvider implements MessagePort {
  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}
  private async request(path: string, init?: RequestInit): Promise<unknown> {
    const response = await fetch(`${this.config.OPENWA_URL}${path}`, {
      ...init,
      signal: AbortSignal.timeout(15_000),
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.config.OPENWA_API_KEY,
        ...init?.headers,
      },
    });
    if (!response.ok) throw new Error(`OPENWA_HTTP_${response.status}`);
    return response.json();
  }
  async send(payload: MessagePayload, idempotencyKey: string) {
    // rmyndharis/OpenWA: resolve the named session, then use its session-scoped REST endpoint.
    const result = (await this.request('/api/sessions')) as
      | { data?: { id: string; name: string; status: string }[] }
      | { id: string; name: string; status: string }[];
    const sessions = Array.isArray(result) ? result : result.data;
    const session = sessions?.find(
      (item) => item.name === this.config.OPENWA_SESSION_NAME,
    );
    if (!session) throw new Error('OPENWA_SESSION_NOT_CONFIGURED');
    await this.request(
      `/api/sessions/${encodeURIComponent(session.id)}/messages/send-text`,
      {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          chatId: `${payload.destination.replace(/\D/g, '')}@c.us`,
          text: payload.text,
        }),
      },
    );
  }
}
@Injectable()
export class EmailProvider implements MessagePort {
  private readonly transport;
  constructor(@Inject(CONFIG) private readonly config: AppConfig) {
    this.transport = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE === 'true',
      auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
      connectionTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
  async send(payload: MessagePayload, idempotencyKey: string) {
    await this.transport.sendMail({
      from: this.config.SMTP_FROM,
      to: payload.destination,
      subject: 'Your Wasel verification code',
      text: payload.text,
      messageId: `<${idempotencyKey}@wasel.local>`,
    });
  }
}
