// P4-01 / P4-02: mergeDeviceIntoUser (worker/lib/auth.ts:82-97) uses UPDATE OR IGNORE, so rows that collide
// with the account's own stay keyed to the raw device id. They are not "harmless": they are still counted in
// share tallies (double vote) and still shown to the device after logout (phantom saves).
import { describe, expect, it } from "vitest";
import { mergeDeviceIntoUser, ownerForUser } from "../../worker/lib/auth";
import { fakeD1 } from "./P4__fake-d1";

const DEVICE = "d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1";
const USER = "userA000";
const OWNER = ownerForUser(USER);
const now = Date.now();

async function seed(db: D1Database) {
  await db.prepare("INSERT INTO users (id, google_sub, created_at, last_login_at) VALUES (?, ?, ?, ?)").bind(USER, "sub-a", now, now).run();
  await db.prepare("INSERT INTO videos (id, canonical_key, platform, url, status, created_at, updated_at) VALUES ('vid1','tiktok:1','tiktok','https://t/1','ready',?,?)").bind(now, now).run();
  // Someone else's share link that this person voted on twice: once logged in, once logged out (e.g. after the
  // 90-day session expired; the UI then shows mine=null and invites a vote).
  await db.prepare("INSERT INTO shares (token, kind, ref_id, device_id, created_at) VALUES ('tok1','check','vid1','friend',?)").bind(now).run();
  await db.prepare("INSERT INTO votes (share_token, device_id, vote, name, created_at) VALUES ('tok1', ?, 'in', 'Sam', ?)").bind(OWNER, now - 1000).run();
  await db.prepare("INSERT INTO votes (share_token, device_id, vote, name, created_at) VALUES ('tok1', ?, 'out', 'Sam', ?)").bind(DEVICE, now).run();
  // The same place hearted by the account and (later, logged out) by the device.
  await db.prepare("INSERT INTO saves (id, device_id, place_key, name, created_at) VALUES ('s1', ?, 'positano', 'Positano', ?)").bind(OWNER, now).run();
  await db.prepare("INSERT INTO saves (id, device_id, place_key, name, created_at) VALUES ('s2', ?, 'positano', 'Positano', ?)").bind(DEVICE, now).run();
}

describe("P4 mergeDeviceIntoUser leftovers", () => {
  it("P4-01: one person's two votes collapse to one after login (share tally)", async () => {
    const db = fakeD1();
    await seed(db);
    await mergeDeviceIntoUser(db, DEVICE, USER);
    // What votesFor() in worker/share-api.ts:13-22 counts for this share:
    const rows = (await db.prepare("SELECT device_id, vote FROM votes WHERE share_token = 'tok1'").all<{ device_id: string; vote: string }>()).results;
    const tally = { in: rows.filter((r) => r.vote === "in").length, out: rows.filter((r) => r.vote === "out").length };
    // Expected: the person now has a single identity (u:userA), so a single vote is tallied.
    expect(rows.map((r) => r.device_id)).toEqual([OWNER]);
    expect(tally.in + tally.out).toBe(1);
  });

  it("P4-02: nothing of the device's stays behind after login (logout shows an empty guest)", async () => {
    const db = fakeD1();
    await seed(db);
    await mergeDeviceIntoUser(db, DEVICE, USER);
    // After logout the identity middleware (worker/index.ts:64-81) keys the guest by the raw tz_device id again.
    const guestSaves = (await db.prepare("SELECT name FROM saves WHERE device_id = ?").bind(DEVICE).all<{ name: string }>()).results;
    const guestVotes = (await db.prepare("SELECT vote FROM votes WHERE device_id = ?").bind(DEVICE).all<{ vote: string }>()).results;
    expect(guestSaves).toEqual([]);
    expect(guestVotes).toEqual([]);
  });
});
