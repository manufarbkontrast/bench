import { beforeEach, describe, expect, it } from "vitest";
import {
  DB,
  DEAL_STAGES,
  STAGE_PROBABILITY,
  openDb,
  listActivities,
  listContacts,
  listDeals,
  listOrganizations,
} from "../../src/crm/db.js";
import { isSeeded, seed } from "../../src/crm/seed.js";

/**
 * The seed is the first thing anyone sees of the CRM, so it is checked the way the rolodex seed is:
 * is every screen alive, and is any of it obviously wrong? Its dates are relative to today, so
 * every comparison here uses the same UTC calendar the seed writes them in.
 */
let db: DB;

beforeEach(() => {
  db = openDb(":memory:");
});

const utcToday = () => new Date().toISOString().slice(0, 10);

describe("the seeded CRM", () => {
  it("reports itself empty until seeded, and seeded after", () => {
    expect(isSeeded(db)).toBe(false);
    seed(db);
    expect(isSeeded(db)).toBe(true);
  });

  it("puts at least one deal in every pipeline column", () => {
    seed(db);
    for (const stage of DEAL_STAGES)
      expect(listDeals(db, { stage }).length).toBeGreaterThan(0);
  });

  it("gives every deal the probability its stage implies", () => {
    seed(db);
    for (const deal of listDeals(db))
      expect(deal.probability).toBe(STAGE_PROBABILITY[deal.stage]);
  });

  it("has leads, qualified contacts and customers, each at a seeded organization", () => {
    seed(db);
    const orgIds = new Set(listOrganizations(db).map((o) => o.id));
    const contacts = listContacts(db);
    for (const status of ["lead", "qualified", "customer"])
      expect(
        contacts.filter((c) => c.status === status).length,
      ).toBeGreaterThan(0);
    for (const contact of contacts)
      expect(orgIds.has(contact.organization_id ?? -1)).toBe(true);
  });

  it("gives the task list something overdue, something upcoming and something done", () => {
    seed(db);
    const today = utcToday();
    const activities = listActivities(db);
    const open = activities.filter((a) => !a.done && a.due_date !== null);
    expect(open.some((a) => a.due_date! < today)).toBe(true);
    expect(open.some((a) => a.due_date! > today)).toBe(true);
    expect(activities.some((a) => a.done)).toBe(true);
  });

  it("dates every activity in the past", () => {
    seed(db);
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    for (const activity of listActivities(db))
      expect(activity.occurred_at < now).toBe(true);
  });
});
