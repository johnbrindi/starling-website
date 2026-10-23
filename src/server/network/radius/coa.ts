import { createHash, randomInt } from "node:crypto";
import { createSocket } from "node:dgram";

/** Builds an RFC 5176 Disconnect-Request (code 40) for a User-Name. */
export function buildDisconnectRequest(username: string, secret: string, identifier = randomInt(256)): Buffer {
  const user = Buffer.from(username, "utf8");
  const attrs = Buffer.concat([Buffer.from([1, user.length + 2]), user]); // User-Name
  const length = 20 + attrs.length;
  const header = Buffer.alloc(4);
  header.writeUInt8(40, 0);
  header.writeUInt8(identifier, 1);
  header.writeUInt16BE(length, 2);
  const authenticator = createHash("md5")
    .update(Buffer.concat([header, Buffer.alloc(16), attrs, Buffer.from(secret, "utf8")]))
    .digest();
  return Buffer.concat([header, authenticator, attrs]);
}

/** Sends a Disconnect-Request to the NAS (MikroTik "/radius incoming" must be enabled). */
export function sendDisconnect(host: string, port: number, username: string, secret: string, timeoutMs = 4000): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const socket = createSocket("udp4");
    const packet = buildDisconnectRequest(username, secret);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("RADIUS Disconnect-Request timed out"));
    }, timeoutMs);
    socket.on("message", (msg) => {
      if (msg[1] !== packet[1]) return;
      clearTimeout(timer);
      socket.close();
      resolve(msg[0] === 41); // 41 = Disconnect-ACK, 42 = Disconnect-NAK (e.g. no session)
    });
    socket.on("error", (err) => {
      clearTimeout(timer);
      socket.close();
      reject(err);
    });
    socket.send(packet, port, host);
  });
}
