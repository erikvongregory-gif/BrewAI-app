import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { ACCOUNTS_FILE, ADMIN_2FA_TEST_SECRET_FILE, MOCK_DIR } from "./env";

export type AccountKey = "userA" | "userB" | "teamOwnerExpired" | "teamMember" | "zeroCredits" | "noSub" | "admin" | "resetUser" | "signupUser";
export type Account = { email: string; password: string; id?: string; stripeCustomerId?: string };
export type Accounts = Record<AccountKey, Account>;

const KEYS: AccountKey[] = ["userA", "userB", "teamOwnerExpired", "teamMember", "zeroCredits", "noSub", "admin", "resetUser", "signupUser"];

/** Zugangsdaten werden lokal erzeugt und nur in tests/e2e/.state/ (gitignored) gespeichert. */
export function loadAccounts(): Accounts {
  mkdirSync(MOCK_DIR, { recursive: true });
  const existing: Partial<Accounts> = existsSync(ACCOUNTS_FILE) ? JSON.parse(readFileSync(ACCOUNTS_FILE, "utf8")) : {};
  let changed = false;
  for (const key of KEYS) {
    if (!existing[key]) {
      const slug = key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
      existing[key] = { email: `e2e-${slug}-${randomBytes(3).toString("hex")}@example.com`, password: `E2e!${randomBytes(12).toString("base64url")}` };
      changed = true;
    }
  }
  if (changed) writeFileSync(ACCOUNTS_FILE, JSON.stringify(existing, null, 2));
  return existing as Accounts;
}

export function saveAccounts(accounts: Accounts) {
  writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
}

/** HMAC-Secret für die 2FA-Cookies des Testservers (min. 32 Zeichen), pro Checkout stabil. */
export function twoFactorSecret(): string {
  mkdirSync(MOCK_DIR, { recursive: true });
  if (!existsSync(ADMIN_2FA_TEST_SECRET_FILE)) writeFileSync(ADMIN_2FA_TEST_SECRET_FILE, randomBytes(32).toString("hex"));
  return readFileSync(ADMIN_2FA_TEST_SECRET_FILE, "utf8").trim();
}
