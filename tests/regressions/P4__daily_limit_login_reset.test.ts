// P4-03: the daily free-check limit (worker/index.ts:146-149, countBillableToday in worker/lib/store.ts:32-39) is
// counted per owner id. Logging in re-keys the device's checks to "u:<user>" (worker/lib/auth.ts:86), so after a
// logout the same device starts the day at 0 again. Login → logout → N more checks → login → ... has no ceiling.
import { describe, expect, it } from "vitest";
import { mergeDeviceIntoUser, ownerForUser } from "../../worker/lib/auth";
import { countBillableToday, recordCheck } from "../../worker/lib/store";
import { fakeD1 } from "./P4__fake-d1";

const DEVICE = "d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1";
const USER = "userA000";
const LIMIT = 10;

describe("P4 daily limit vs login/logout", () => {
  it("P4-03: a device that used today's checks is still at the limit after login + logout", async () => {
    const db = fakeD1();
    const now = Date.now();
    await db.prepare("INSERT INTO users (id, google_sub, created_at, last_login_at) VALUES (?, 'sub-a', ?, ?)").bind(USER, now, now).run();
    for (let i = 0; i < LIMIT; i++) {
      await db.prepare("INSERT INTO videos (id, canonical_key, platform, url, status, created_at, updated_at) VALUES (?, ?, 'tiktok', 'https://t/', 'ready', ?, ?)").bind(`v${i}`, `tiktok:${i}`, now, now).run();
      // Through the app's own write path (records which physical device made the check).
      await recordCheck(db, DEVICE, `v${i}`, true, DEVICE);
    }
    expect(await countBillableToday(db, DEVICE)).toBe(LIMIT); // guest is at the limit → 429

    await mergeDeviceIntoUser(db, DEVICE, USER); // GET /api/auth/google/callback → finishLogin
    expect(await countBillableToday(db, ownerForUser(USER))).toBe(LIMIT); // the account is at the limit, fine

    // POST /api/auth/logout: the device cookie stays, deviceId is the raw tz_device id again.
    // Expected: this device still counts as having used today's checks.
    expect(await countBillableToday(db, DEVICE)).toBeGreaterThanOrEqual(LIMIT);
  });
});
