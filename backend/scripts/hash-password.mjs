#!/usr/bin/env node
// Generates the ADMIN_PASSWORD_HASH value for .env — run with:
//   npm run hash-password -- "your-password"
import bcrypt from "bcryptjs";

const password = process.argv[2];
if (!password) {
  console.error('Usage: npm run hash-password -- "your-password"');
  process.exit(1);
}

console.log(bcrypt.hashSync(password, 10));
