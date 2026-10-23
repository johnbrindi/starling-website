import { createServer, type Server, type Socket } from "node:net";
import { SentenceParser, encodeSentence } from "@/server/network/routeros/protocol";

type Row = Record<string, string>;

/**
 * A tiny in-process RouterOS API server for tests. Speaks the real wire protocol and implements
 * just enough of /ip/hotspot, /system/scheduler and /system/* to exercise the adapter.
 */
export class FakeRouterOsServer {
  server: Server;
  tables: Record<string, Row[]> = {
    "/ip/hotspot/user": [{ ".id": "*1", name: "admin-user", password: "x", profile: "default", comment: "created by hand" }],
    "/ip/hotspot/active": [],
    "/ip/hotspot/user/profile": [{ ".id": "*1", name: "default" }],
    "/system/scheduler": [],
    "/ip/hotspot": [{ ".id": "*1", name: "hotspot1", interface: "bridge-hotspot", profile: "hsprof1", disabled: "false" }],
    "/ip/hotspot/walled-garden/ip": [{ ".id": "*1", "dst-host": "wifi.example.cm", action: "accept", disabled: "false" }],
    "/ip/hotspot/walled-garden": [],
    "/ip/service": [{ ".id": "*1", name: "api-ssl", disabled: "false", port: "8729", address: "10.10.10.0/24" }],
  };
  commands: string[][] = [];
  private nextId = 100;
  readonly password = "s3cret";

  constructor() {
    this.server = createServer((sock) => this.handle(sock));
  }

  listen(): Promise<number> {
    return new Promise((resolve) => this.server.listen(0, "127.0.0.1", () => resolve((this.server.address() as { port: number }).port)));
  }

  close() {
    return new Promise<void>((r) => this.server.close(() => r()));
  }

  private handle(sock: Socket) {
    const parser = new SentenceParser();
    let authed = false;
    sock.on("data", (chunk) => {
      for (const words of parser.push(chunk)) {
        this.commands.push(words);
        const [cmd = "", ...rest] = words;
        const attrs: Row = {};
        const queries: Row = {};
        let tag = "";
        for (const w of rest) {
          if (w.startsWith(".tag=")) tag = w.slice(5);
          else if (w.startsWith("=")) {
            const i = w.indexOf("=", 1);
            attrs[w.slice(1, i)] = w.slice(i + 1);
          } else if (w.startsWith("?")) {
            const i = w.indexOf("=");
            queries[w.slice(1, i)] = w.slice(i + 1);
          }
        }
        const send = (type: string, a: Row = {}) =>
          sock.write(encodeSentence([type, ...Object.entries(a).map(([k, v]) => `=${k}=${v}`), ...(tag ? [`.tag=${tag}`] : [])]));
        if (cmd === "/quit") {
          sock.end();
          continue;
        }
        if (cmd === "/login") {
          if (attrs.name === "api" && attrs.password === this.password) {
            authed = true;
            send("!done");
          } else {
            send("!trap", { message: "invalid user name or password (6)" });
            send("!done");
          }
          continue;
        }
        if (!authed) {
          sock.write(encodeSentence(["!fatal", "not logged in"]));
          sock.end();
          continue;
        }
        this.exec(cmd, attrs, queries, send);
      }
    });
  }

  private exec(cmd: string, attrs: Row, queries: Row, send: (t: string, a?: Row) => void) {
    const action = cmd.slice(cmd.lastIndexOf("/") + 1);
    const table = cmd.slice(0, cmd.lastIndexOf("/"));
    if (cmd === "/system/resource/print") {
      send("!re", { version: "6.48.6 (long-term)", "board-name": "hAP lite", uptime: "1d02:03:04", "cpu-load": "7", "free-memory": "12000000" });
      return send("!done");
    }
    if (cmd === "/system/clock/print") {
      send("!re", { date: "oct/22/2026", time: "10:00:00", "gmt-offset": "+01:00", "time-zone-name": "Africa/Douala" });
      return send("!done");
    }
    if (cmd === "/system/ntp/client/print") {
      send("!re", { enabled: "true", status: "synchronized" });
      return send("!done");
    }
    const rows = (this.tables[table] ??= []);
    const proplist = attrs[".proplist"]?.split(",");
    if (action === "print") {
      for (const r of rows.filter((r) => Object.entries(queries).every(([k, v]) => r[k] === v))) {
        send("!re", proplist ? Object.fromEntries(proplist.filter((p) => p in r).map((p) => [p, r[p]!])) : r);
      }
      return send("!done");
    }
    if (action === "add") {
      if (attrs.name && rows.some((r) => r.name === attrs.name)) {
        send("!trap", { message: "failure: already have such name" });
        return send("!done");
      }
      const id = `*${(this.nextId++).toString(16).toUpperCase()}`;
      rows.push({ ".id": id, ...attrs });
      return send("!done", { ret: id });
    }
    const row = rows.find((r) => r[".id"] === attrs[".id"]);
    if (!row) {
      send("!trap", { message: "no such item" });
      return send("!done");
    }
    if (action === "set") Object.assign(row, attrs);
    if (action === "remove") rows.splice(rows.indexOf(row), 1);
    send("!done");
  }
}
