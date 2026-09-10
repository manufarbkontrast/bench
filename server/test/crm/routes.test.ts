import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type express from "express";
import {
  DB,
  STAGE_PROBABILITY,
  openDb,
  createActivity,
  createContact,
  createDeal,
  createOrganization,
} from "../../src/crm/db.js";
import { appWithCrm } from "./app.js";

/**
 * The router is a thin layer over db.ts, whose functions have suites of their own, so this covers
 * only what happens here: status codes, list filters read off the query string, bodies handed
 * through - and what a change to a record that does not exist answers.
 */
let db: DB;
let app: express.Express;

beforeEach(() => {
  db = openDb(":memory:");
  app = appWithCrm(db);
});

type Row = Record<string, unknown>;
const bodyOf = (res: { body: unknown }) => res.body as Row;
const namesOf = (res: { body: unknown }) =>
  (res.body as { name: string }[])
    .map((row) => row.name)
    .sort((a, b) => a.localeCompare(b));

describe("creating, reading and deleting", () => {
  it("answers a create with 201 and the new record, for each kind", async () => {
    const org = await request(app)
      .post("/api/crm/organizations")
      .send({ name: "Hafenbetrieb" });
    const contact = await request(app)
      .post("/api/crm/contacts")
      .send({ name: "Ada", status: "lead", organization_id: bodyOf(org).id });
    const deal = await request(app)
      .post("/api/crm/deals")
      .send({
        name: "Kran",
        stage: "New",
        value: 1200,
        contact_id: bodyOf(contact).id,
      });
    const activity = await request(app)
      .post("/api/crm/activities")
      .send({
        type: "note",
        description: "Erstkontakt",
        deal_id: bodyOf(deal).id,
      });
    expect([org, contact, deal, activity].map((res) => res.status)).toEqual([
      201, 201, 201, 201,
    ]);
    expect([
      bodyOf(org).name,
      bodyOf(contact).organization_id,
      bodyOf(deal).value,
      bodyOf(activity).deal_id,
    ]).toEqual(["Hafenbetrieb", bodyOf(org).id, 1200, bodyOf(deal).id]);
  });

  it.each(["organizations", "contacts", "deals"])(
    "answers 404 for one of the %s that does not exist",
    async (kind) => {
      const res = await request(app).get(`/api/crm/${kind}/999`);
      expect([res.status, bodyOf(res)]).toEqual([404, { error: "Not found" }]);
    },
  );

  it("deletes each kind with 204, after which it is gone", async () => {
    const ids = {
      organizations: createOrganization(db, { name: "Nord" }).id,
      contacts: createContact(db, { name: "Ada", status: "lead" }).id,
      deals: createDeal(db, { name: "Kran", stage: "New", value: 1 }).id,
      activities: createActivity(db, { type: "note", description: "x" }).id,
    };
    for (const [kind, id] of Object.entries(ids)) {
      const res = await request(app).delete(`/api/crm/${kind}/${String(id)}`);
      expect([kind, res.status]).toEqual([kind, 204]);
    }
    const gone = await Promise.all(
      (["organizations", "contacts", "deals"] as const).map(
        async (kind) =>
          (await request(app).get(`/api/crm/${kind}/${ids[kind]}`)).status,
      ),
    );
    expect(gone).toEqual([404, 404, 404]);
    // Activities have no GET by id; the list is how the app reads them.
    expect((await request(app).get("/api/crm/activities")).body).toEqual([]);
  });
});

describe("list filters", () => {
  it("reads the id filters and the limit off the query string", async () => {
    const north = createOrganization(db, { name: "Nord" });
    const south = createOrganization(db, { name: "Süd" });
    const ada = createContact(db, {
      name: "Ada",
      status: "lead",
      organization_id: north.id,
    });
    createContact(db, {
      name: "Ben",
      status: "lead",
      organization_id: south.id,
    });
    const kran = createDeal(db, {
      name: "Kran",
      stage: "New",
      value: 1,
      contact_id: ada.id,
    });
    createDeal(db, { name: "Lager", stage: "New", value: 1 });
    for (const description of ["eins", "zwei", "drei"])
      createActivity(db, { type: "note", description, deal_id: kran.id });
    createActivity(db, { type: "note", description: "anderswo" });

    const contacts = await request(app).get(
      `/api/crm/contacts?organization_id=${north.id}`,
    );
    const deals = await request(app).get(`/api/crm/deals?contact_id=${ada.id}`);
    const activities = await request(app).get(
      `/api/crm/activities?deal_id=${kran.id}&limit=2`,
    );
    expect([namesOf(contacts), namesOf(deals)]).toEqual([["Ada"], ["Kran"]]);
    expect(activities.body).toHaveLength(2);
  });

  it("hands the search, status and stage filters through", async () => {
    createOrganization(db, { name: "Hafenbetrieb" });
    createOrganization(db, { name: "Werft" });
    createContact(db, { name: "Ada", status: "customer" });
    createContact(db, { name: "Ben", status: "lead" });
    createDeal(db, { name: "Kran", stage: "Won", value: 1 });
    createDeal(db, { name: "Lager", stage: "New", value: 1 });

    const orgs = await request(app).get("/api/crm/organizations?q=Hafen");
    const contacts = await request(app).get(
      "/api/crm/contacts?status=customer",
    );
    const deals = await request(app).get("/api/crm/deals?stage=Won");
    expect([namesOf(orgs), namesOf(contacts), namesOf(deals)]).toEqual([
      ["Hafenbetrieb"],
      ["Ada"],
      ["Kran"],
    ]);
  });
});

describe("changing records", () => {
  it("updates with PUT and answers the updated record", async () => {
    const org = createOrganization(db, { name: "Nord" });
    const contact = createContact(db, { name: "Ada", status: "lead" });
    const deal = createDeal(db, { name: "Kran", stage: "New", value: 1 });

    const renamed = await request(app)
      .put(`/api/crm/organizations/${org.id}`)
      .send({ name: "Nordhafen" });
    const promoted = await request(app)
      .put(`/api/crm/contacts/${contact.id}`)
      .send({ name: "Ada", status: "customer" });
    const repriced = await request(app)
      .put(`/api/crm/deals/${deal.id}`)
      .send({ name: "Kran", stage: "New", value: 5000 });
    expect([
      bodyOf(renamed).name,
      bodyOf(promoted).status,
      bodyOf(repriced).value,
    ]).toEqual(["Nordhafen", "customer", 5000]);
  });

  it("moves a deal to another stage, re-basing its probability", async () => {
    const { id } = createDeal(db, { name: "Kran", stage: "New", value: 1 });
    const res = await request(app)
      .patch(`/api/crm/deals/${id}/stage`)
      .send({ stage: "Won" });
    expect([bodyOf(res).stage, bodyOf(res).probability]).toEqual([
      "Won",
      STAGE_PROBABILITY.Won,
    ]);
  });

  it("drops a moved deal at the index it was given, or at the end of the column", async () => {
    for (const name of ["a", "b", "c"])
      createDeal(db, { name, stage: "Qualified", value: 1 });
    const first = createDeal(db, { name: "vorn", stage: "New", value: 1 });
    const last = createDeal(db, { name: "hinten", stage: "New", value: 1 });

    const atTop = await request(app)
      .patch(`/api/crm/deals/${first.id}/stage`)
      .send({ stage: "Qualified", index: 0 });
    const atEnd = await request(app)
      .patch(`/api/crm/deals/${last.id}/stage`)
      .send({ stage: "Qualified" });
    expect([bodyOf(atTop).board_order, bodyOf(atEnd).board_order]).toEqual([
      0, 4,
    ]);
  });

  it("ticks an activity done without touching the rest of it", async () => {
    const { id } = createActivity(db, { type: "call", description: "Rückruf" });
    const res = await request(app)
      .patch(`/api/crm/activities/${id}`)
      .send({ done: true });
    const { done, type, description } = bodyOf(res);
    expect([done, type, description]).toEqual([1, "call", "Rückruf"]);
  });

  it.each([
    ["put", "/api/crm/organizations/999", { name: "x" }],
    ["put", "/api/crm/contacts/999", { name: "x", status: "lead" }],
    ["put", "/api/crm/deals/999", { name: "x", stage: "New", value: 1 }],
    ["patch", "/api/crm/deals/999/stage", { stage: "Won" }],
    ["patch", "/api/crm/activities/999", { done: true }],
  ] as const)(
    "answers 404 to a %s on %s, a record that does not exist",
    async (method, url, body) => {
      const res = await request(app)[method](url).send(body);
      expect([res.status, bodyOf(res)]).toEqual([404, { error: "Not found" }]);
    },
  );
});
