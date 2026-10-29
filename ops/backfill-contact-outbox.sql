-- Queue contact messages that predate the durable Telegram outbox.
-- Idempotent through uq_outbox_event(event_type, aggregate_id, destination).

INSERT IGNORE INTO notification_outbox (
  id,
  event_type,
  aggregate_id,
  destination,
  payload_json,
  status,
  available_at
)
SELECT
  UUID(),
  'contact.created',
  message.id,
  'telegram_admin',
  JSON_OBJECT(
    'text',
    LEFT(
      CONCAT(
        'LeakFanHub - message historique (', message.kind, ')', CHAR(10),
        'Recu le : ', DATE_FORMAT(message.created_at, '%Y-%m-%d %H:%i:%s UTC'), CHAR(10),
        'De : ', message.email, CHAR(10),
        IF(
          message.meta_json IS NULL OR JSON_LENGTH(message.meta_json) = 0,
          '',
          CONCAT('Details : ', message.meta_json, CHAR(10))
        ),
        CHAR(10), 'Message :', CHAR(10), message.message
      ),
      4000
    )
  ),
  'pending',
  CURRENT_TIMESTAMP(3)
FROM contact_messages message
LEFT JOIN notification_outbox existing
  ON existing.event_type = 'contact.created'
 AND BINARY existing.aggregate_id = BINARY message.id
 AND existing.destination = 'telegram_admin'
WHERE existing.id IS NULL;
