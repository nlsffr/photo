#!/usr/bin/env python3
"""Exercise notice transactions in a newly created, disposable MariaDB database.

Run on the VPS with the listener's existing environment. Production data is not
queried or changed. The temporary database name is generated internally.
"""
import json
from pathlib import Path
import sys
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "dmca"))
import dmca_listener as listener
from google_mail_policy import Decision


def main():
    original_db = listener.DB
    database = "notice_test_" + uuid.uuid4().hex
    assert database.startswith("notice_test_") and len(database) == 44
    created = False
    try:
        if listener.mysql(f"SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME='{database}';").strip():
            raise RuntimeError("Test database already exists")
        listener.mysql(f"CREATE DATABASE `{database}`;")
        created = True
        listener.DB = database
        listener.mysql("""
          CREATE TABLE creators (id VARCHAR(36) PRIMARY KEY, handle VARCHAR(100) UNIQUE,
            is_hidden TINYINT NOT NULL DEFAULT 0, removed_from_index_at DATETIME NULL,
            url_version INT NOT NULL DEFAULT 1) ENGINE=InnoDB;
          CREATE TABLE photos (id VARCHAR(36) PRIMARY KEY, creator_id VARCHAR(36), source_id VARCHAR(191),
            is_hidden TINYINT NOT NULL DEFAULT 0, removed_from_index_at DATETIME NULL,
            url_version INT NOT NULL DEFAULT 1) ENGINE=InnoDB;
          INSERT INTO creators (id,handle,url_version) VALUES ('creator-one','example',3),('creator-two','other',1);
          INSERT INTO photos (id,creator_id,source_id,url_version) VALUES ('photo-one','creator-one','123',2),('photo-two','creator-two','456',1);
        """)
        listener.ensure_schema()
        targets = listener.resolve_url("https://leakfanhub.com/fr/example-v3/123-v2")
        assert len(targets) == 1 and targets[0]["id"] == "photo-one", targets
        decision = Decision("removal", "integration_test", ("https://leakfanhub.com/fr/example-v3/123-v2",))
        assert listener.record_event("a" * 64, 1, decision, targets, []) == 1
        state = json.loads(listener.mysql("SELECT JSON_OBJECT('hidden',is_hidden,'removed',removed_from_index_at IS NOT NULL,'version',url_version) FROM photos WHERE id='photo-one';"))
        assert state == {"hidden": 1, "removed": 1, "version": 2}, state
        try:
            listener.record_event("a" * 64, 1, decision, [{"kind": "photo", "id": "photo-two"}], [])
        except RuntimeError:
            pass
        else:
            raise AssertionError("Duplicate event must fail without changing the second record")
        assert listener.mysql("SELECT is_hidden FROM photos WHERE id='photo-two';").strip() == "0"
        listener.record_event("b" * 64, 2, Decision("review", "unrecognized_decision_template"), [], [])
        assert listener.mysql("SELECT COUNT(*) FROM dmca_mail_events;").strip() == "2"
        assert listener.mysql("SELECT SUM(is_hidden) FROM creators;").strip() == "0"
        print("PASS: scoped media match, atomic hide+audit, unchanged URL versions, duplicate rollback, review-only decision")
    finally:
        listener.DB = original_db
        if created:
            listener.mysql(f"DROP DATABASE `{database}`;")
            print("Disposable notice test database removed; production rows unchanged")


if __name__ == "__main__":
    main()
