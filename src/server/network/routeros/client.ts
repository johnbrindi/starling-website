import { connect as tcpConnect, type Socket } from "node:net";
import { connect as tlsConnect } from "node:tls";
import { NetworkUnavailableError } from "../types";
import { SentenceParser, commandWords, encodeSentence, parseReply, type Reply } from "./protocol";

export interface RouterOsConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  tls: boolean;
  /** Accept self-signed router certificates (api-ssl). Prefer installing a trusted certificate. */
  tlsInsecure: boolean;
  timeoutMs: number;
}

/** Error returned by the router (!trap), e.g. "failure: already have user with this name". */
export class RouterOsTrap extends Error {
  constructor(
    message: string,
    readonly category?: string,
  ) {
    super(message);
    this.name = "RouterOsTrap";
  }
}

interface Pending {
  records: Record<string, string>[];
  trap?: RouterOsTrap;
  resolve: (records: Record<string, string>[]) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

/** Minimal RouterOS API client with tagged, concurrent commands. One instance = one TCP connection. */
export class RouterOsClient {
  private socket?: Socket;
  private parser = new SentenceParser();
  private pending = new Map<string, Pending>();
  private nextTag = 1;
  private closed = false;

  constructor(private readonly cfg: RouterOsConfig) {}

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => reject(new NetworkUnavailableError(`Router connection failed: ${err.message}`));
      const socket = this.cfg.tls
        ? tlsConnect({ host: this.cfg.host, port: this.cfg.port, rejectUnauthorized: !this.cfg.tlsInsecure, servername: this.cfg.host })
        : tcpConnect({ host: this.cfg.host, port: this.cfg.port });
      socket.setTimeout(this.cfg.timeoutMs);
      socket.once(this.cfg.tls ? "secureConnect" : "connect", () => {
        socket.off("error", onError);
        socket.on("error", (err) => this.failAll(new NetworkUnavailableError(`Router connection error: ${err.message}`)));
        resolve();
      });
      socket.once("error", onError);
      socket.on("timeout", () => {
        socket.destroy();
        const err = new NetworkUnavailableError("Router connection timed out");
        reject(err);
        this.failAll(err);
      });
      socket.on("data", (chunk: Buffer) => this.onData(chunk));
      socket.on("close", () => {
        this.closed = true;
        this.failAll(new NetworkUnavailableError("Router closed the connection"));
      });
      this.socket = socket;
    });
    // RouterOS 6.43+ plain login. Use api-ssl (TLS) so the password is encrypted in transit.
    await this.exec("/login", { name: this.cfg.username, password: this.cfg.password });
  }

  private failAll(err: Error) {
    for (const [tag, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
      this.pending.delete(tag);
    }
  }

  private onData(chunk: Buffer) {
    for (const words of this.parser.push(chunk)) this.onReply(parseReply(words));
  }

  private onReply(reply: Reply) {
    if (reply.type === "!fatal") {
      this.failAll(new NetworkUnavailableError(`Router fatal: ${reply.attrs.message ?? "unknown"}`));
      this.socket?.destroy();
      return;
    }
    const p = reply.tag ? this.pending.get(reply.tag) : undefined;
    if (!p) return;
    if (reply.type === "!re") p.records.push(reply.attrs);
    else if (reply.type === "!trap") p.trap = new RouterOsTrap(reply.attrs.message ?? "Router returned an error", reply.attrs.category);
    else if (reply.type === "!done" || reply.type === "!empty") {
      clearTimeout(p.timer);
      this.pending.delete(reply.tag!);
      if (p.trap) p.reject(p.trap);
      else p.resolve(reply.type === "!done" && Object.keys(reply.attrs).length && !p.records.length ? [reply.attrs] : p.records);
    }
  }

  /** Runs a command and returns its !re records. Rejects with RouterOsTrap on !trap. */
  exec(path: string, attrs: Record<string, string | number | boolean | undefined> = {}, queries: string[] = []): Promise<Record<string, string>[]> {
    if (!this.socket || this.closed) return Promise.reject(new NetworkUnavailableError("Router not connected"));
    const tag = String(this.nextTag++);
    const words = [...commandWords(path, attrs, queries), `.tag=${tag}`];
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(tag);
        reject(new NetworkUnavailableError(`Router command timed out: ${path}`));
      }, this.cfg.timeoutMs);
      this.pending.set(tag, { records: [], resolve, reject, timer });
      this.socket!.write(encodeSentence(words));
    });
  }

  close() {
    if (this.socket && !this.closed) {
      try {
        this.socket.write(encodeSentence(["/quit"]));
      } catch {
        // ignore
      }
      this.socket.end();
    }
    this.closed = true;
  }
}

/** Opens a connection, runs fn, always closes. Short-lived connections suit the hAP lite's limited resources. */
export async function withRouter<T>(cfg: RouterOsConfig, fn: (c: RouterOsClient) => Promise<T>): Promise<T> {
  const client = new RouterOsClient(cfg);
  try {
    await client.connect();
    return await fn(client);
  } finally {
    client.close();
  }
}
