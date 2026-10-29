import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
import { storeContactWithOutbox, storeReportWithOutbox } from "../src/lib/notification-outbox.ts";

function fakeDb(options: { failAt?: number } = {}) {
  const calls: Array<{ sql: string; params?: unknown }> = [];
  let executions = 0;
  const connection = {
    async beginTransaction() {
      calls.push({ sql: "BEGIN" });
    },
    async execute(sql: string, params?: unknown) {
      executions += 1;
      calls.push({ sql, params });
      if (executions === options.failAt) throw new Error("db_write_failed");
      return [{ affectedRows: 1 }, []];
    },
    async commit() {
      calls.push({ sql: "COMMIT" });
    },
    async rollback() {
      calls.push({ sql: "ROLLBACK" });
    },
    release() {
      calls.push({ sql: "RELEASE" });
    },
  };
  return {
    calls,
    db: {
      async getConnection() {
        return connection;
      },
    },
  };
}

test("stores a contact message and its Telegram event in one transaction", async () => {
  const db = fakeDb();
  const result = await storeContactWithOutbox(
    db.db,
    {
      kind: "support",
      email: "person@example.com",
      message: "Besoin d’aide",
      extras: { page: "/premium" },
      notificationText: "Support message",
    },
    { randomId: (() => {
      const ids = ["contact-id", "outbox-id"];
      return () => ids.shift()!;
    })() },
  );

  assert.deepEqual(result, { messageId: "contact-id", outboxId: "outbox-id" });
  assert.deepEqual(
    db.calls.map((call) =>
      ["BEGIN", "COMMIT", "ROLLBACK", "RELEASE"].includes(call.sql) ? call.sql : "SQL",
    ),
    ["BEGIN", "SQL", "SQL", "COMMIT", "RELEASE"],
  );
  assert.match(db.calls[1].sql, /INSERT INTO contact_messages/);
  assert.match(db.calls[2].sql, /INSERT INTO notification_outbox/);
  assert.match(JSON.stringify(db.calls[2].params), /Support message/);
});

test("rolls back the message when its outbox event cannot be stored", async () => {
  const db = fakeDb({ failAt: 2 });
  await assert.rejects(
    storeContactWithOutbox(db.db, {
      kind: "support",
      email: "person@example.com",
      message: "Besoin d’aide",
      extras: {},
      notificationText: "Support message",
    }),
    /db_write_failed/,
  );
  assert.equal(db.calls.some((call) => call.sql === "COMMIT"), false);
  assert.equal(db.calls.some((call) => call.sql === "ROLLBACK"), true);
  assert.equal(db.calls.at(-1)?.sql, "RELEASE");
});

test("stores a report and its notification without claiming it was delivered", async () => {
  const db = fakeDb();
  const result = await storeReportWithOutbox(
    db.db,
    {
      reporterUserId: null,
      photoId: "photo-id",
      creatorId: null,
      reason: "illegal",
      message: "Description",
      notificationText: "Report message",
    },
    { randomId: (() => {
      const ids = ["report-id", "outbox-id"];
      return () => ids.shift()!;
    })() },
  );
  assert.deepEqual(result, { reportId: "report-id", outboxId: "outbox-id" });
  assert.match(db.calls[1].sql, /INSERT INTO reports/);
  assert.match(db.calls[2].sql, /report\.created/);
});
