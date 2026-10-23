/** Prints fresh secrets for a new environment. Paste them into the server's environment, never into git. */
import { randomBytes } from "node:crypto";
import webpush from "web-push";

const vapid = webpush.generateVAPIDKeys();
console.log(`SESSION_SECRET=${randomBytes(48).toString("base64url")}
ENCRYPTION_KEY=${randomBytes(32).toString("base64")}
CRON_SECRET=${randomBytes(32).toString("base64url")}
VAPID_PUBLIC_KEY=${vapid.publicKey}
VAPID_PRIVATE_KEY=${vapid.privateKey}`);
