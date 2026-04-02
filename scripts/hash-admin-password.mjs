import crypto from "node:crypto";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const rl = readline.createInterface({ input, output });

try {
  const password = await rl.question("Admin password: ");

  if (!password || password.length < 12) {
    throw new Error("Use an admin password with at least 12 characters.");
  }

  const iterations = 310000;
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, iterations, 32, "sha256")
    .toString("hex");

  output.write(`pbkdf2_sha256$${iterations}$${salt}$${hash}\n`);
} catch (error) {
  output.write(
    `${error instanceof Error ? error.message : "Could not generate password hash."}\n`,
  );
  process.exitCode = 1;
} finally {
  rl.close();
}
