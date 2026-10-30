import { randomUUID } from "node:crypto";

interface OutboxConnection {
  beginTransaction(): Promise<void>;
  execute(sql: string, params?: unknown): Promise<unknown>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
}

export interface OutboxDb {
  getConnection(): Promise<OutboxConnection>;
}

interface IdDependencies {
  randomId: () => string;
}

const defaults: IdDependencies = { randomId: randomUUID };

async function transactional<T>(
  db: OutboxDb,
  operation: (connection: OutboxConnection) => Promise<T>,
): Promise<T> {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await operation(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function insertOutbox(
  connection: OutboxConnection,
  input: {
    id: string;
    eventType: "contact.created" | "report.created";
    aggregateId: string;
    notificationText: string;
  },
): Promise<void> {
  await connection.execute(
    `INSERT INTO notification_outbox
     (id, event_type, aggregate_id, destination, payload_json, status, available_at)
     VALUES (?, '${input.eventType}', ?, 'telegram_admin', ?, 'pending', CURRENT_TIMESTAMP(3))`,
    [input.id, input.aggregateId, JSON.stringify({ text: input.notificationText })],
  );
}

export async function storeContactWithOutbox(
  db: OutboxDb,
  input: {
    kind: string;
    email: string;
    message: string;
    extras: Record<string, string>;
    notificationText: string;
  },
  dependencies: Partial<IdDependencies> = {},
): Promise<{ messageId: string; outboxId: string }> {
  const deps = { ...defaults, ...dependencies };
  const messageId = deps.randomId();
  const outboxId = deps.randomId();
  return transactional(db, async (connection) => {
    await connection.execute(
      `INSERT INTO contact_messages (id, kind, email, message, meta_json)
       VALUES (?, ?, ?, ?, ?)`,
      [messageId, input.kind, input.email, input.message, JSON.stringify(input.extras)],
    );
    await insertOutbox(connection, {
      id: outboxId,
      eventType: "contact.created",
      aggregateId: messageId,
      notificationText: input.notificationText,
    });
    return { messageId, outboxId };
  });
}

export async function storeReportWithOutbox(
  db: OutboxDb,
  input: {
    reporterUserId: string | null;
    photoId: string | null;
    creatorId: string | null;
    reason: "dmca" | "illegal" | "spam" | "other";
    message: string | null;
    notificationText: string;
  },
  dependencies: Partial<IdDependencies> = {},
): Promise<{ reportId: string; outboxId: string }> {
  const deps = { ...defaults, ...dependencies };
  const reportId = deps.randomId();
  const outboxId = deps.randomId();
  return transactional(db, async (connection) => {
    await connection.execute(
      `INSERT INTO reports
       (id, reporter_user_id, photo_id, creator_id, reason, message, status)
       VALUES (?, ?, ?, ?, ?, ?, 'open')`,
      [
        reportId,
        input.reporterUserId,
        input.photoId,
        input.creatorId,
        input.reason,
        input.message,
      ],
    );
    await insertOutbox(connection, {
      id: outboxId,
      eventType: "report.created",
      aggregateId: reportId,
      notificationText: input.notificationText,
    });
    return { reportId, outboxId };
  });
}
