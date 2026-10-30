// Generates a VAPID key pair for Web Push. Run once, put the values in your environment.
import webpush from "web-push";
const k = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${k.publicKey}\nVAPID_PRIVATE_KEY=${k.privateKey}\nVAPID_SUBJECT=mailto:you@example.com`);
console.log("\nKeep VAPID_PRIVATE_KEY secret. The public key is sent to browsers by the API.");
