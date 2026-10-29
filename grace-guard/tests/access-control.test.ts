import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createAuthUser, createTestDb } from "./helpers/db";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

let db: PGlite;
let campaignA: string;
let campaignB: string;

const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];

beforeAll(async () => {
  db = await createTestDb();
  await createAuthUser(db, A, "a@example.com");
  await createAuthUser(db, B, "b@example.com");
  campaignA = (await asUser(db, A, () => one<{ id: string }>("select id from campaigns where slug = 'aep-2026'"))).id;
  campaignB = (await asUser(db, B, () => one<{ id: string }>("select id from campaigns where slug = 'aep-2026'"))).id;
});

describe("workspace seeding", () => {
  it("creates the 2026 AEP campaign, MAPD goal, assumption and a single dated baseline per user", async () => {
    const r = await asUser(db, A, async () => ({
      campaigns: (await db.query("select slug from campaigns order by slug")).rows,
      goal: await one<{ target_count: string }>("select target_count from campaign_goals where campaign_id = $1", [campaignA]),
      assumption: await one<{ amount_cents: number; plan_year: number }>("select amount_cents, plan_year from commission_assumptions"),
      baselines: (await db.query("select as_of_date::text, outbound_dials, voice_connections, mapd_apps, hospital_indemnity_apps, qualified_conversations from aggregate_baselines")).rows,
      apps: await one<{ n: number }>("select count(*)::int as n from applications"),
      daily: await one<{ n: number }>("select count(*)::int as n from daily_activity"),
    }));
    expect(r.campaigns).toEqual([{ slug: "aep-2026" }, { slug: "growth-2027" }]);
    expect(Number(r.goal.target_count)).toBe(100);
    expect(r.assumption).toEqual({ amount_cents: 36300, plan_year: 2027 });
    expect(r.baselines).toEqual([
      { as_of_date: "2026-10-28", outbound_dials: 279, voice_connections: 22, mapd_apps: 14, hospital_indemnity_apps: 1, qualified_conversations: null },
    ]);
    // no fabricated application records or day-level allocations
    expect(r.apps.n).toBe(0);
    expect(r.daily.n).toBe(0);
  });

  it("initialize_workspace is idempotent", async () => {
    await asUser(db, A, () => db.query("select public.initialize_workspace()"));
    await asUser(db, A, () => db.query("select public.initialize_workspace()"));
    const n = await asUser(db, A, () => one<{ c: number; b: number; p: number }>(
      "select (select count(*)::int from campaigns) c, (select count(*)::int from aggregate_baselines) b, (select count(*)::int from products) p",
    ));
    expect(n).toEqual({ c: 2, b: 1, p: 6 });
  });

  it("adds the milestone report's goals and weekly dialing sessions once", async () => {
    await asUser(db, A, () => db.query("select public.initialize_workspace()"));
    const r = await asUser(db, A, async () => ({
      goals: (await db.query("select metric, target_count::int as n, target_cents from campaign_goals order by metric")).rows,
      sessions: (await one<{ n: number; dials: number }>("select count(*)::int n, sum(target_dials)::int dials from dialing_sessions")),
    }));
    expect(r.goals).toEqual([
      { metric: "applications", n: 100, target_cents: null },
      { metric: "expected_revenue", n: null, target_cents: 3630000 },
      { metric: "outbound_dials", n: 1993, target_cents: null },
      { metric: "voice_connections", n: 157, target_cents: null },
    ]);
    // Mon–Thu: do-not-dial + 60-dial session; Friday: job shift + 75-dial block
    expect(r.sessions).toEqual({ n: 10, dials: 4 * 60 + 75 });
  });
});

describe("row-level security", () => {
  it("each user only sees their own rows", async () => {
    const seenByA = await asUser(db, A, () => db.query<{ id: string }>("select id from campaigns"));
    expect(seenByA.rows.map((r) => r.id)).not.toContain(campaignB);
    const cross = await asUser(db, A, () => one<{ n: number }>("select count(*)::int n from aggregate_baselines where campaign_id = $1", [campaignB]));
    expect(cross.n).toBe(0);
  });

  it("anonymous requests are denied", async () => {
    await expect(asUser(db, null, () => db.query("select * from campaigns"))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, null, () => db.query("select * from daily_activity"))).rejects.toThrow(/permission denied/);
  });

  it("cannot write rows owned by someone else", async () => {
    await expect(
      asUser(db, A, () => db.query("insert into daily_activity (owner_id, campaign_id, activity_date) values ($1, $2, '2026-10-29')", [B, campaignB])),
    ).rejects.toThrow(/row-level security/);
  });

  it("cannot attach own rows to another user's campaign (composite FK)", async () => {
    await expect(
      asUser(db, A, () => db.query("insert into daily_activity (campaign_id, activity_date) values ($1, '2026-10-29')", [campaignB])),
    ).rejects.toThrow(/foreign key/);
  });

  it("cannot update or delete another user's rows", async () => {
    await asUser(db, B, () => db.query("insert into daily_activity (campaign_id, activity_date, outbound_dials) values ($1, '2026-10-30', 50)", [campaignB]));
    const upd = await asUser(db, A, () => db.query("update daily_activity set outbound_dials = 0 where campaign_id = $1", [campaignB]));
    const del = await asUser(db, A, () => db.query("delete from aggregate_baselines where campaign_id = $1", [campaignB]));
    expect(upd.affectedRows).toBe(0);
    expect(del.affectedRows).toBe(0);
    const still = await asUser(db, B, () => one<{ outbound_dials: number }>("select outbound_dials from daily_activity where campaign_id = $1", [campaignB]));
    expect(still.outbound_dials).toBe(50);
  });

  it("cannot reassign a row to another owner", async () => {
    await expect(asUser(db, A, () => db.query("update campaigns set owner_id = $1 where id = $2", [B, campaignA]))).rejects.toThrow();
  });

  it("dialing sessions are private to their owner", async () => {
    const seen = await asUser(db, B, () => one<{ n: number }>("select count(*)::int n from dialing_sessions where owner_id = $1", [A]));
    expect(seen.n).toBe(0);
    await expect(asUser(db, null, () => db.query("select * from dialing_sessions"))).rejects.toThrow(/permission denied/);
  });

  it("users table only exposes your own profile", async () => {
    const rows = await asUser(db, A, () => db.query<{ id: string }>("select id from users"));
    expect(rows.rows).toEqual([{ id: A }]);
  });
});

describe("audit log", () => {
  it("records changes and only the owner can read them; nobody can write directly", async () => {
    await asUser(db, A, () => db.query("insert into daily_activity (campaign_id, activity_date, outbound_dials, voice_connections) values ($1, '2026-10-29', 60, 5)", [campaignA]));
    const mine = await asUser(db, A, () => one<{ n: number }>("select count(*)::int n from audit_logs where table_name = 'daily_activity' and action = 'INSERT'"));
    expect(mine.n).toBe(1);
    const theirs = await asUser(db, B, () => one<{ n: number }>("select count(*)::int n from audit_logs where owner_id = $1", [A]));
    expect(theirs.n).toBe(0);
    await expect(
      asUser(db, A, () => db.query("insert into audit_logs (owner_id, table_name, action) values ($1, 'x', 'INSERT')", [A])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("data integrity constraints", () => {
  const insertDaily = (date: string, cols: Record<string, number | string | null>) =>
    asUser(db, A, () => {
      const keys = Object.keys(cols);
      return db.query(
        `insert into daily_activity (campaign_id, activity_date${keys.map((k) => `, ${k}`).join("")}) values ($1, $2${keys.map((_, i) => `, $${i + 3}`).join("")})`,
        [campaignA, date, ...Object.values(cols)],
      );
    });

  it("rejects negative counts and money", async () => {
    await expect(insertDaily("2026-11-02", { outbound_dials: -1 })).rejects.toThrow(/check constraint/);
    await expect(insertDaily("2026-11-02", { lead_spend_cents: -100 })).rejects.toThrow(/check constraint/);
  });

  it("rejects qualified conversations exceeding voice connections (same population)", async () => {
    await expect(insertDaily("2026-11-02", { outbound_dials: 10, voice_connections: 2, qualified_conversations: 3 })).rejects.toThrow(/check constraint/);
  });

  it("allows one entry per date and lead source, including the 'all sources' (NULL) row", async () => {
    await insertDaily("2026-11-03", { outbound_dials: 10 });
    await expect(insertDaily("2026-11-03", { outbound_dials: 11 })).rejects.toThrow(/duplicate key/);
  });

  it("prevents overlapping baselines in a campaign", async () => {
    await expect(
      asUser(db, A, () => db.query("insert into aggregate_baselines (campaign_id, label, coverage_start, as_of_date) values ($1, 'dup', '2026-10-20', '2026-10-30')", [campaignA])),
    ).rejects.toThrow(/overlaps/);
  });

  it("revenue goals require cents, count goals require counts", async () => {
    await expect(
      asUser(db, A, () => db.query("insert into campaign_goals (campaign_id, period_type, period_start, period_end, metric, target_count) values ($1, 'weekly', '2026-11-02', '2026-11-06', 'expected_revenue', 10)", [campaignA])),
    ).rejects.toThrow(/check constraint/);
  });

  it("deleting the auth user removes the whole workspace", async () => {
    const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    await createAuthUser(db, C, "c@example.com");
    await db.query("delete from auth.users where id = $1", [C]);
    const left = await one<{ n: number }>("select count(*)::int n from campaigns where owner_id = $1", [C]);
    expect(left.n).toBe(0);
  });
});
