import dotenv from "dotenv";
import path from "path";

for (const envPath of [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "backend", ".env"),
]) {
  dotenv.config({ path: envPath });
}

import app from "./app.js";

const PORT = process.env.PORT ?? 3001;

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    const mode = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY ? "AI" : "MOCK";
    const githubAuth = process.env.GITHUB_CLIENT_ID ? "✓ GitHub" : "✗ GitHub (no keys)";
    const googleAuth = process.env.GOOGLE_CLIENT_ID ? "✓ Google" : "✗ Google (no keys)";
    const dbStatus = process.env.DATABASE_URL ? "✓ PostgreSQL (Supabase)" : "✗ DATABASE_URL missing";

    console.log(`\n🚀 QA-Genius Backend running on http://localhost:${PORT}`);
    console.log(`⚡ Mode: ${mode}`);
    console.log(`🔐 Auth: ${githubAuth}  ${googleAuth}`);
    console.log(`💾 DB: ${dbStatus}\n`);
  });
}

export default app;
