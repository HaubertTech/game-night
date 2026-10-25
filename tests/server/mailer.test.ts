import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildMessage, ConsoleMailer, SmtpMailer } from '#lib/server/mailer.ts';

const dir = mkdtempSync(join(tmpdir(), 'dl-outbox-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('ConsoleMailer', () => {
  it('writes the message with its links into the outbox', async () => {
    await new ConsoleMailer(dir).send({ to: 'a@example.test', subject: 'Ověření', text: 'Klikni: http://localhost/ucet/overeni?token=abc' });
    const files = readdirSync(dir);
    expect(files).toHaveLength(1);
    const saved = JSON.parse(readFileSync(join(dir, files[0]), 'utf8'));
    expect(saved).toMatchObject({ to: 'a@example.test', subject: 'Ověření', links: ['http://localhost/ucet/overeni?token=abc'] });
  });
});

describe('buildMessage', () => {
  it('encodes Czech subject and body as UTF-8', () => {
    const raw = buildMessage('Domácí liga <liga@example.test>', { to: 'a@example.test', subject: 'Žluťoučký kůň', text: 'Příliš\nžluťoučký' });
    expect(raw).toContain('Subject: =?UTF-8?B?');
    expect(raw).toContain('Content-Transfer-Encoding: base64');
    expect(raw).toContain('To: <a@example.test>');
    const body = raw.split('\r\n\r\n')[1].replace(/\r\n/g, '');
    expect(Buffer.from(body, 'base64').toString('utf8')).toBe('Příliš\r\nžluťoučký');
  });
});

/** Minimal SMTP server: records the conversation, no TLS. */
function fakeSmtp(): Promise<{ server: Server; port: number; log: string[] }> {
  const log: string[] = [];
  const server = createServer((socket) => {
    let data = false;
    let buffer = '';
    socket.write('220 fake ESMTP\r\n');
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let i: number;
      while ((i = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        log.push(line);
        if (data) {
          if (line === '.') {
            data = false;
            socket.write('250 queued\r\n');
          }
          continue;
        }
        if (line.startsWith('EHLO')) socket.write('250-fake\r\n250 AUTH PLAIN\r\n');
        else if (line.startsWith('AUTH PLAIN')) socket.write('235 ok\r\n');
        else if (line.startsWith('MAIL FROM') || line.startsWith('RCPT TO')) socket.write('250 ok\r\n');
        else if (line === 'DATA') {
          data = true;
          socket.write('354 go\r\n');
        } else if (line === 'QUIT') {
          socket.write('221 bye\r\n');
          socket.end();
        }
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as { port: number }).port, log })));
}

describe('SmtpMailer', () => {
  it('talks SMTP with AUTH PLAIN to a local relay', async () => {
    const { server, port, log } = await fakeSmtp();
    try {
      const mailer = new SmtpMailer(`smtp://user%40x:tajne@127.0.0.1:${port}?starttls=0`, 'Domácí liga <liga@example.test>');
      await mailer.send({ to: 'b@example.test', subject: 'Test', text: '.začíná tečkou\nhttp://localhost/x' });
      expect(log).toContain('MAIL FROM:<liga@example.test>');
      expect(log).toContain('RCPT TO:<b@example.test>');
      const auth = log.find((l) => l.startsWith('AUTH PLAIN '))!;
      expect(Buffer.from(auth.slice(11), 'base64').toString()).toBe('\0user@x\0tajne');
      expect(log).toContain('QUIT');
    } finally {
      server.close();
    }
  });

  it('refuses a server without STARTTLS unless told it is a local relay', async () => {
    const { server, port } = await fakeSmtp();
    try {
      await expect(new SmtpMailer(`smtp://127.0.0.1:${port}`, 'liga@example.test').send({ to: 'b@example.test', subject: 'x', text: 'y' })).rejects.toThrow(/STARTTLS/);
    } finally {
      server.close();
    }
  });

  it('rejects header injection in the recipient', async () => {
    await expect(new SmtpMailer('smtp://127.0.0.1:1?starttls=0', 'liga@example.test').send({ to: 'a@x.cz>\r\nBcc: <c@x.cz', subject: 'x', text: 'y' })).rejects.toThrow(/recipient/);
  });
});
