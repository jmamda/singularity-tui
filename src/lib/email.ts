/**
 * Minimal SMTP send — no dependencies. Speaks STARTTLS or implicit TLS.
 * Caller does the capability check on the SMTP host.
 *
 * Env:
 *   SMTP_HOST       (default smtp.gmail.com)
 *   SMTP_PORT       (default 587)
 *   SMTP_USER, SMTP_PASS
 *   SMTP_FROM       (default = SMTP_USER)
 *   SMTP_TLS        ("implicit" for 465-style, anything else = STARTTLS)
 */

import { createConnection, type Socket } from 'node:net';
import { TLSSocket, connect as tlsConnect } from 'node:tls';

export interface EmailInput {
  to: string;
  subject: string;
  body: string;
  from?: string;
}

interface SmtpConn {
  socket: Socket | TLSSocket;
  read: () => Promise<string>;
  write: (s: string) => Promise<void>;
}

async function makeConn(host: string, port: number, implicitTls: boolean): Promise<SmtpConn> {
  const socket: Socket | TLSSocket = implicitTls
    ? tlsConnect({ host, port, servername: host })
    : createConnection({ host, port });

  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('secureConnect', () => resolve());
    socket.once('error', reject);
  });

  let buf = '';
  const resolvers: ((s: string) => void)[] = [];
  socket.on('data', (chunk: Buffer) => {
    buf += chunk.toString('utf8');
    while (resolvers.length > 0) {
      const idx = buf.indexOf('\r\n');
      if (idx < 0) break;
      const r = resolvers.shift()!;
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      r(line);
    }
  });
  socket.on('error', () => {
    /* swallow; reads will reject via timeout */
  });

  return {
    socket,
    read: () =>
      new Promise<string>((resolve, reject) => {
        const idx = buf.indexOf('\r\n');
        if (idx >= 0) {
          const line = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          resolve(line);
        } else {
          resolvers.push(resolve);
          setTimeout(() => reject(new Error('smtp read timeout')), 10_000);
        }
      }),
    write: (s) =>
      new Promise<void>((resolve, reject) =>
        socket.write(s, (err) => (err ? reject(err) : resolve())),
      ),
  };
}

async function expect(conn: SmtpConn, code: string): Promise<string> {
  const line = await conn.read();
  if (!line.startsWith(code)) throw new Error(`smtp expected ${code}, got ${line}`);
  return line;
}

export async function sendEmail(input: EmailInput): Promise<{ ok: boolean; reason?: string }> {
  const host = process.env.SMTP_HOST ?? 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = input.from ?? process.env.SMTP_FROM ?? user ?? '';
  const implicitTls = process.env.SMTP_TLS === 'implicit';
  if (!user || !pass) return { ok: false, reason: 'SMTP_USER + SMTP_PASS not set' };
  if (!from) return { ok: false, reason: 'SMTP_FROM not set' };
  try {
    let conn = await makeConn(host, port, implicitTls);
    await expect(conn, '220');
    await conn.write(`EHLO singularity\r\n`);
    // drain multi-line 250-…
    let line = await conn.read();
    while (line.startsWith('250-')) line = await conn.read();
    if (!line.startsWith('250')) throw new Error('ehlo failed: ' + line);

    if (!implicitTls) {
      await conn.write('STARTTLS\r\n');
      await expect(conn, '220');
      const upgraded = tlsConnect({ socket: conn.socket as Socket, servername: host });
      await new Promise<void>((res, rej) => {
        upgraded.once('secureConnect', () => res());
        upgraded.once('error', rej);
      });
      conn = await wrapExisting(upgraded);
      await conn.write(`EHLO singularity\r\n`);
      line = await conn.read();
      while (line.startsWith('250-')) line = await conn.read();
      if (!line.startsWith('250')) throw new Error('post-tls ehlo failed: ' + line);
    }

    await conn.write('AUTH LOGIN\r\n');
    await expect(conn, '334');
    await conn.write(Buffer.from(user).toString('base64') + '\r\n');
    await expect(conn, '334');
    await conn.write(Buffer.from(pass).toString('base64') + '\r\n');
    await expect(conn, '235');

    await conn.write(`MAIL FROM:<${from}>\r\n`);
    await expect(conn, '250');
    await conn.write(`RCPT TO:<${input.to}>\r\n`);
    await expect(conn, '250');
    await conn.write('DATA\r\n');
    await expect(conn, '354');
    const headers =
      `From: ${from}\r\n` +
      `To: ${input.to}\r\n` +
      `Subject: ${input.subject}\r\n` +
      `MIME-Version: 1.0\r\n` +
      `Content-Type: text/plain; charset=utf-8\r\n\r\n`;
    const body = input.body.replace(/^\./gm, '..'); // dot-stuffing
    await conn.write(headers + body + '\r\n.\r\n');
    await expect(conn, '250');
    await conn.write('QUIT\r\n');
    conn.socket.destroy();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}

async function wrapExisting(socket: TLSSocket): Promise<SmtpConn> {
  let buf = '';
  const resolvers: ((s: string) => void)[] = [];
  socket.on('data', (chunk: Buffer) => {
    buf += chunk.toString('utf8');
    while (resolvers.length > 0) {
      const idx = buf.indexOf('\r\n');
      if (idx < 0) break;
      const r = resolvers.shift()!;
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      r(line);
    }
  });
  return {
    socket,
    read: () =>
      new Promise<string>((resolve, reject) => {
        const idx = buf.indexOf('\r\n');
        if (idx >= 0) {
          const line = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          resolve(line);
        } else {
          resolvers.push(resolve);
          setTimeout(() => reject(new Error('smtp read timeout')), 10_000);
        }
      }),
    write: (s) =>
      new Promise<void>((resolve, reject) =>
        socket.write(s, (err) => (err ? reject(err) : resolve())),
      ),
  };
}
