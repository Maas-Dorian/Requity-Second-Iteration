/**
 * QA harness for the announcements pure logic (no DB required):
 * CTA URL validation and status/date-window visibility rules.
 *
 * Usage: npx tsx backend/scripts/qa-announcements.ts
 */
import {
  isSafeCtaUrl,
  effectiveAnnouncementStatus,
} from "../lib/announcements.js";

let failures = 0;
function check(name: string, cond: boolean): void {
  if (cond) console.log(`PASS ${name}`);
  else {
    failures += 1;
    console.error(`FAIL ${name}`);
  }
}

// --- CTA URL validation --------------------------------------------------------
check("relative URL ok", isSafeCtaUrl("/agent/dashboard.html"));
check("https URL ok", isSafeCtaUrl("https://www.requityapp.com/agent/dashboard.html"));
check("http rejected", !isSafeCtaUrl("http://evil.example.com"));
check("javascript rejected", !isSafeCtaUrl("javascript:alert(1)"));
check("protocol-relative rejected", !isSafeCtaUrl("//evil.example.com"));
check("empty rejected", !isSafeCtaUrl(""));

// --- Effective status (date-window rules) ----------------------------------------
const now = new Date("2026-07-11T12:00:00Z");
const eff = (row: any) => effectiveAnnouncementStatus(row, now);

check("draft stays draft", eff({ status: "draft" }) === "draft");
check("archived stays archived", eff({ status: "archived", starts_at: "2020-01-01T00:00:00Z" }) === "archived");
check("active with no window is active", eff({ status: "active" }) === "active");
check(
  "active before start is scheduled",
  eff({ status: "active", starts_at: "2026-08-01T00:00:00Z" }) === "scheduled"
);
check(
  "scheduled past start becomes active",
  eff({ status: "scheduled", starts_at: "2026-07-01T00:00:00Z" }) === "active"
);
check(
  "active past end is expired",
  eff({ status: "active", ends_at: "2026-07-01T00:00:00Z" }) === "expired"
);
check(
  "inside window is active",
  eff({ status: "active", starts_at: "2026-07-01T00:00:00Z", ends_at: "2026-08-01T00:00:00Z" }) === "active"
);
check(
  "expired beats scheduled when both passed",
  eff({ status: "scheduled", starts_at: "2026-06-01T00:00:00Z", ends_at: "2026-07-01T00:00:00Z" }) === "expired"
);

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll announcement logic checks passed.");
