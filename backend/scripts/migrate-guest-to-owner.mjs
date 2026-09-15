#!/usr/bin/env node
// One-time migration: reassigns everything on the historical shared guest
// account (githubId "mock_user_123") to the site owner's real account
// (githubId "admin_owner", now also linked to Google login) — see
// docs/superpowers/specs/2026-09-15-guest-data-isolation-design.md, section 8.
//
// Nothing is deleted except the guest's UserSettings row (which held the
// previously-exposed OpenAI key) — every Feature/ManualStd/LogAnalysis/
// TestRun keeps its data, just reassigned to the owner.
//
// Dry run by default — prints exactly what it would do. Add --confirm to
// actually write:
//   node scripts/migrate-guest-to-owner.mjs
//   node scripts/migrate-guest-to-owner.mjs --confirm

import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

for (const envPath of [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "backend", ".env"),
]) {
  dotenv.config({ path: envPath });
}

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes("--confirm");

function pickFirstNonEmpty(...values) {
  for (const v of values) {
    if (v != null && v !== "") return v;
  }
  return null;
}

async function uniqueSlugFor(userId, desiredSlug) {
  let candidate = `${desiredSlug}-guest`;
  let suffix = 2;
  while (await prisma.feature.findUnique({ where: { userId_slug: { userId, slug: candidate } } })) {
    candidate = `${desiredSlug}-guest-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

async function main() {
  const guest = await prisma.user.findUnique({ where: { githubId: "mock_user_123" } });
  const owner = await prisma.user.findUnique({ where: { githubId: "admin_owner" } });

  if (!guest) {
    console.log("No historical guest row (githubId mock_user_123) found — nothing to migrate.");
    return;
  }
  if (!owner) {
    console.log("No owner row (githubId admin_owner) found — sign in as Admin at least once first.");
    return;
  }

  const [features, manualStds, logAnalyses, testRuns, guestSettings, ownerSettings] = await Promise.all([
    prisma.feature.findMany({ where: { userId: guest.id } }),
    prisma.manualStd.count({ where: { userId: guest.id } }),
    prisma.logAnalysis.count({ where: { userId: guest.id } }),
    prisma.testRun.count({ where: { userId: guest.id } }),
    prisma.userSettings.findUnique({ where: { userId: guest.id } }),
    prisma.userSettings.findUnique({ where: { userId: owner.id } }),
  ]);

  const ownerSlugs = new Set(
    (await prisma.feature.findMany({ where: { userId: owner.id }, select: { slug: true } })).map((f) => f.slug)
  );
  const collisions = features.filter((f) => ownerSlugs.has(f.slug));

  console.log("=== Guest → Owner migration plan ===");
  console.log(`Guest:  ${guest.id} (${guest.email})`);
  console.log(`Owner:  ${owner.id} (${owner.email})`);
  console.log(`Feature rows to move:      ${features.length}${collisions.length ? ` (${collisions.length} slug collision(s): ${collisions.map((f) => f.slug).join(", ")})` : ""}`);
  console.log(`ManualStd rows to move:    ${manualStds}`);
  console.log(`LogAnalysis rows to move:  ${logAnalyses}`);
  console.log(`TestRun rows to move:      ${testRuns}`);
  console.log(
    `UserSettings: guest has ${guestSettings ? "a" : "no"} row, owner has ${ownerSettings ? "a" : "no"} row — will merge (owner's existing values win) and then remove the guest's row.`
  );

  if (!CONFIRM) {
    console.log("\nDry run only — re-run with --confirm to apply.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    // Default interactive-transaction timeout (5s) isn't enough for this many
    // round-trips over a pooled connection; give it real headroom.
    for (const feature of collisions) {
      const newSlug = await uniqueSlugFor(owner.id, feature.slug);
      await tx.feature.update({ where: { id: feature.id }, data: { slug: newSlug } });
      console.log(`  renamed colliding feature slug "${feature.slug}" -> "${newSlug}"`);
    }

    await tx.feature.updateMany({ where: { userId: guest.id }, data: { userId: owner.id } });
    await tx.manualStd.updateMany({ where: { userId: guest.id }, data: { userId: owner.id } });
    await tx.logAnalysis.updateMany({ where: { userId: guest.id }, data: { userId: owner.id } });
    await tx.testRun.updateMany({ where: { userId: guest.id }, data: { userId: owner.id } });

    if (guestSettings) {
      const merged = {
        openaiApiKey: pickFirstNonEmpty(ownerSettings?.openaiApiKey, guestSettings.openaiApiKey),
        anthropicApiKey: pickFirstNonEmpty(ownerSettings?.anthropicApiKey, guestSettings.anthropicApiKey),
        coralogixApiKey: pickFirstNonEmpty(ownerSettings?.coralogixApiKey, guestSettings.coralogixApiKey),
        coralogixTeamName: pickFirstNonEmpty(ownerSettings?.coralogixTeamName, guestSettings.coralogixTeamName),
        coralogixRegion: pickFirstNonEmpty(ownerSettings?.coralogixRegion, guestSettings.coralogixRegion),
        testsOutputDir: pickFirstNonEmpty(ownerSettings?.testsOutputDir, guestSettings.testsOutputDir),
        githubIssuesRepo: pickFirstNonEmpty(ownerSettings?.githubIssuesRepo, guestSettings.githubIssuesRepo),
        jiraDomain: pickFirstNonEmpty(ownerSettings?.jiraDomain, guestSettings.jiraDomain),
        jiraEmail: pickFirstNonEmpty(ownerSettings?.jiraEmail, guestSettings.jiraEmail),
        jiraApiToken: pickFirstNonEmpty(ownerSettings?.jiraApiToken, guestSettings.jiraApiToken),
      };

      await tx.userSettings.upsert({
        where: { userId: owner.id },
        update: merged,
        create: { userId: owner.id, ...merged },
      });

      // Remove the guest's settings row entirely — nothing should ever read
      // it again (public guests are never DB-backed after the isolation
      // fix), and this is what actually gets rid of the previously-exposed key.
      await tx.userSettings.delete({ where: { userId: guest.id } });
    }
  }, { timeout: 30000, maxWait: 10000 });

  console.log("\nDone. The guest User row itself was left in place (as a historical artifact) with no settings and no remaining child rows.");
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
