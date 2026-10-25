// Outgoing e-mail behind a small interface.
// - SMTP_URL set → SmtpMailer (minimal SMTP client on node:net/tls, no dependency):
//   `smtps://user:pass@host:465` (implicit TLS) or `smtp://user:pass@host:587` (STARTTLS required
//   unless `?starttls=0`, meant only for a local relay). AUTH PLAIN when credentials are given.
// - otherwise ConsoleMailer: logs the message and writes it as JSON to MAIL_OUTBOX_DIR
//   (default data/outbox) — in dev that is where the verification link is.

import { mkdirSync, writeFileSync } from 'node:fs';
import { connect as netConnect, type Socket } from 'node:net';
import { hostname } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { connect as tlsConnect, type TLSSocket } from 'node:tls';
import { loadEnv } from './env.ts';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

const URL_RE = /https?:\/\/\S+/g;

export class ConsoleMailer implements Mailer {
  constructor(private readonly dir = resolve(process.cwd(), process.env.MAIL_OUTBOX_DIR || 'data/outbox')) {}

  async send(message: MailMessage): Promise<void> {
    const links = message.text.match(URL_RE) ?? [];
    // The address stays out of the log; the outbox file has it.
    console.log('[mail] (console) message', { subject: message.subject, links });
    try {
      mkdirSync(this.dir, { recursive: true, mode: 0o700 });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = join(this.dir, `${stamp}-${Math.random().toString(36).slice(2, 8)}.json`);
      writeFileSync(file, JSON.stringify({ ...message, links, created_at: new Date().toISOString() }, null, 2), { mode: 0o600 });
    } catch (err) {
      console.warn('[mail] outbox write failed', { err: (err as Error).message });
    }
  }
}

function encodeHeader(value: string): string {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

/** RFC 5322 message with a base64 UTF-8 text body. */
export function buildMessage(from: string, message: MailMessage, now = new Date()): string {
  const domain = (from.match(/@([^>\s]+)/)?.[1] ?? 'localhost').replace(/[^a-z0-9.-]/gi, '');
  const fromHeader = from.replace(/^(.*?)\s*<(.+)>$/, (_, name: string, addr: string) => (name ? `${encodeHeader(name.replace(/"/g, ''))} <${addr}>` : `<${addr}>`));
  const body = Buffer.from(message.text.replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n');
  return [
    `From: ${fromHeader}`,
    `To: <${message.to}>`,
    `Subject: ${encodeHeader(message.subject)}`,
    `Date: ${now.toUTCString()}`,
    `Message-ID: <${now.getTime()}.${Math.random().toString(36).slice(2)}@${domain}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    body,
  ].join('\r\n');
}

function addressOf(from: string): string {
  return from.match(/<([^>]+)>/)?.[1] ?? from.trim();
}

/** Reads SMTP replies (multi-line aware) from a socket. */
class SmtpConversation {
  private buffer = '';
  private waiters: ((line: { code: number; text: string } | Error) => void)[] = [];
  private lines: string[] = [];

  constructor(public socket: Socket | TLSSocket) {
    this.listen(socket);
  }

  listen(socket: Socket | TLSSocket): void {
    this.socket = socket;
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      this.buffer += chunk;
      let i: number;
      while ((i = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, i).replace(/\r$/, '');
        this.buffer = this.buffer.slice(i + 1);
        this.lines.push(line);
        // Last line of a reply: `250 text` (a dash after the code means more lines follow).
        if (/^\d{3}(?: |$)/.test(line)) {
          const text = this.lines.join('\n');
          this.lines = [];
          this.waiters.shift()?.({ code: Number(line.slice(0, 3)), text });
        }
      }
    });
    socket.on('error', (err) => this.failAll(err));
    socket.on('close', () => this.failAll(new Error('connection closed')));
  }

  private failAll(err: Error): void {
    for (const w of this.waiters.splice(0)) w(err);
  }

  reply(): Promise<{ code: number; text: string }> {
    return new Promise((resolve, reject) => {
      this.waiters.push((r) => (r instanceof Error ? reject(r) : resolve(r)));
    });
  }

  async command(line: string | null, expect: number[]): Promise<{ code: number; text: string }> {
    const pending = this.reply();
    if (line !== null) this.socket.write(`${line}\r\n`);
    const r = await pending;
    if (!expect.includes(r.code)) {
      const shown = line?.startsWith('AUTH') ? 'AUTH ***' : line;
      throw new Error(`[mail] SMTP ${shown ?? 'greeting'} → ${r.code} ${r.text.split('\n').pop()}`);
    }
    return r;
  }
}

export class SmtpMailer implements Mailer {
  private readonly url: URL;

  constructor(
    smtpUrl: string,
    private readonly from: string,
    private readonly options: { timeoutMs?: number; rejectUnauthorized?: boolean } = {},
  ) {
    this.url = new URL(smtpUrl);
    if (this.url.protocol !== 'smtp:' && this.url.protocol !== 'smtps:') throw new Error('[mail] SMTP_URL must start with smtp:// or smtps://');
  }

  async send(message: MailMessage): Promise<void> {
    if (/[\r\n<>]/.test(message.to)) throw new Error('[mail] invalid recipient');
    const implicitTls = this.url.protocol === 'smtps:';
    const host = this.url.hostname;
    const port = Number(this.url.port || (implicitTls ? 465 : 587));
    const requireStartTls = !implicitTls && this.url.searchParams.get('starttls') !== '0';
    const tlsOpts = { host, servername: host, rejectUnauthorized: this.options.rejectUnauthorized ?? true };
    const socket: Socket = implicitTls ? tlsConnect({ ...tlsOpts, port }) : netConnect({ host, port });
    socket.setTimeout(this.options.timeoutMs ?? 20_000, () => socket.destroy(new Error('[mail] SMTP timeout')));
    const smtp = new SmtpConversation(socket);
    const me = hostname() || 'localhost';
    try {
      await smtp.command(null, [220]);
      let ehlo = await smtp.command(`EHLO ${me}`, [250]);
      if (!implicitTls) {
        if (/STARTTLS/i.test(ehlo.text)) {
          await smtp.command('STARTTLS', [220]);
          socket.removeAllListeners('data');
          const secured = tlsConnect({ ...tlsOpts, socket });
          await new Promise<void>((resolve, reject) => {
            secured.once('secureConnect', () => resolve());
            secured.once('error', reject);
          });
          smtp.listen(secured);
          ehlo = await smtp.command(`EHLO ${me}`, [250]);
        } else if (requireStartTls) {
          throw new Error('[mail] SMTP server does not offer STARTTLS (add ?starttls=0 only for a local relay)');
        }
      }
      if (this.url.username) {
        const user = decodeURIComponent(this.url.username);
        const pass = decodeURIComponent(this.url.password);
        await smtp.command(`AUTH PLAIN ${Buffer.from(`\0${user}\0${pass}`).toString('base64')}`, [235]);
      }
      await smtp.command(`MAIL FROM:<${addressOf(this.from)}>`, [250]);
      await smtp.command(`RCPT TO:<${message.to}>`, [250, 251]);
      await smtp.command('DATA', [354]);
      // Dot-stuffing: a line starting with a dot gets another one.
      const data = buildMessage(this.from, message).replace(/\r\n\./g, '\r\n..');
      await smtp.command(`${data}\r\n.`, [250]);
      await smtp.command('QUIT', [221]).catch(() => undefined);
    } finally {
      smtp.socket.end();
    }
  }
}

let mailer: Mailer | null = null;

export function getMailer(): Mailer {
  if (mailer) return mailer;
  loadEnv();
  const url = process.env.SMTP_URL;
  const from = process.env.MAIL_FROM || 'Domácí liga <liga@localhost>';
  mailer = url ? new SmtpMailer(url, from) : new ConsoleMailer();
  if (!url) console.warn('[mail] SMTP_URL not set, e-mails go to the outbox directory only');
  return mailer;
}

/** Tests: replace the mailer (null → default again). */
export function setMailer(next: Mailer | null): void {
  mailer = next;
}

/** Sends without failing the request: a mail outage must not break registration. */
export async function sendSafely(message: MailMessage): Promise<boolean> {
  try {
    await getMailer().send(message);
    return true;
  } catch (err) {
    console.error('[mail] send failed', { subject: message.subject, err: (err as Error).message });
    return false;
  }
}
