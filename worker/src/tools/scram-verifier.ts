// Reads a password on stdin and prints a PostgreSQL SCRAM-SHA-256 verifier, so `alter role ... password '<verifier>'`
// never puts the plaintext into the DB log (log_statement = ddl). Used by infra/nas/deploy-worker.sh.
import crypto from "node:crypto";

export function scramVerifier(password: string, iterations = 4096, salt = crypto.randomBytes(16)): string {
  const salted = crypto.pbkdf2Sync(password.normalize("NFKC"), salt, iterations, 32, "sha256");
  const hmac = (key: Buffer, msg: string) => crypto.createHmac("sha256", key).update(msg).digest();
  const storedKey = crypto.createHash("sha256").update(hmac(salted, "Client Key")).digest();
  const serverKey = hmac(salted, "Server Key");
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
}

if (process.argv[1]?.endsWith("scram-verifier.js")) {
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => (input += c));
  process.stdin.on("end", () => {
    const pw = input.replace(/\r?\n$/, "");
    if (!pw) {
      process.stderr.write("empty password\n");
      process.exit(1);
    }
    process.stdout.write(scramVerifier(pw) + "\n");
  });
}
