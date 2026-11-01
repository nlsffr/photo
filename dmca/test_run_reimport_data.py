import importlib.util
import io
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch


def load_launcher():
    path = Path(__file__).with_name("run_reimport_data.py")
    if not path.is_file():
        raise AssertionError("operator launcher is not implemented")
    spec = importlib.util.spec_from_file_location("run_reimport_data", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def app():
    return {
        "Name": "/photo-app-1",
        "State": {"Running": True, "Pid": 4123},
        "Config": {"Env": [
            "DATABASE_URL=mysql://fixture:fixture-secret@mariadb:3306/fixture_db",
            "NEXT_PUBLIC_SITE_URL=https://example.invalid",
            "UNRELATED_SECRET=must-not-be-inherited",
        ]},
        "NetworkSettings": {"Networks": {"photo_lumen-internal": {"IPAddress": "172.25.0.2"}}},
    }


def database():
    return {
        "Name": "/photo-mariadb-1",
        "State": {"Running": True, "Pid": 4100},
        "NetworkSettings": {"Networks": {"photo_lumen-internal": {"IPAddress": "172.25.0.3"}}},
    }


class LauncherTests(unittest.TestCase):
    def setUp(self):
        self.launcher = load_launcher()

    def build(self, target=None, db=None, argv=None):
        return self.launcher.build_invocation(
            app() if target is None else target,
            database() if db is None else db,
            ["https://example.invalid/creator/42"] if argv is None else argv,
            "/usr/bin/python3", "/opt/operator/reimport_data.py", "/usr/bin/nsenter",
        )

    def test_enters_only_network_namespace_and_preserves_default_dry_run(self):
        command, environment = self.build()
        self.assertEqual(command, [
            "/usr/bin/nsenter", "--target", "4123", "--net", "--",
            "/usr/bin/python3", "/opt/operator/reimport_data.py",
            "https://example.invalid/creator/42", "--db-host", "172.25.0.3",
        ])
        self.assertNotIn("--apply", command)
        self.assertEqual(set(environment), {"DATABASE_URL", "NEXT_PUBLIC_SITE_URL"})
        self.assertEqual(environment["DATABASE_URL"], app()["Config"]["Env"][0].split("=", 1)[1])
        self.assertNotIn("fixture-secret", " ".join(command))

    def test_forwards_only_the_requested_mode(self):
        for flag in ["--apply", "--dry-run"]:
            command, _ = self.build(argv=[flag, "https://example.invalid/creator/42"])
            self.assertIn(flag, command)
        for argv in [[], ["/creator", "--apply", "--dry-run"], ["/creator", "extra"]]:
            with self.subTest(argv=argv), self.assertRaises(ValueError):
                self.build(argv=argv)

    def test_rejects_database_overrides_and_unknown_flag_forms(self):
        for flag in ["--db-host", "--db-host=elsewhere", "--db-port", "--db-port=3307", "--db-h", "--db-p", "--unknown", "--apply=yes"]:
            with self.subTest(flag=flag), self.assertRaises(ValueError):
                self.build(argv=["/creator", flag])

    def test_rejects_stopped_wrong_or_invalid_containers(self):
        for state in [{"Running": False, "Pid": 4123}, {"Running": True, "Pid": 0}, {"Running": True, "Pid": True}, {"Running": True, "Pid": "4123"}]:
            target = app()
            target["State"] = state
            with self.subTest(state=state), self.assertRaises(ValueError):
                self.build(target=target)
        for which, name in [("app", "/other-app"), ("db", "/other-db")]:
            target, db = app(), database()
            (target if which == "app" else db)["Name"] = name
            with self.assertRaises(ValueError):
                self.build(target=target, db=db)
        db = database()
        db["State"]["Running"] = False
        with self.assertRaises(ValueError):
            self.build(db=db)

    def test_requires_the_one_expected_shared_network_and_valid_database_ip(self):
        for ip in ["", "not-an-ip", "127.0.0.1", "0.0.0.0", "224.0.0.1"]:
            db = database()
            db["NetworkSettings"]["Networks"]["photo_lumen-internal"]["IPAddress"] = ip
            with self.subTest(ip=ip), self.assertRaises(ValueError):
                self.build(db=db)
        target, db = app(), database()
        target["NetworkSettings"]["Networks"]["another"] = {}
        db["NetworkSettings"]["Networks"]["another"] = {}
        with self.assertRaises(ValueError):
            self.build(target=target, db=db)
        target = app()
        target["NetworkSettings"]["Networks"] = {"wrong-network": {}}
        with self.assertRaises(ValueError):
            self.build(target=target)

    def test_requires_existing_unique_nonempty_environment_settings(self):
        for env in [[], ["DATABASE_URL="], app()["Config"]["Env"][:1], [*app()["Config"]["Env"], "DATABASE_URL=duplicate"]]:
            target = app()
            target["Config"]["Env"] = env
            with self.subTest(env_count=len(env)), self.assertRaises(ValueError):
                self.build(target=target)

    def test_main_inspect_failure_never_echoes_raw_error_or_secrets(self):
        failed = SimpleNamespace(returncode=1, stdout="", stderr="fixture-secret inspect failure")
        error = io.StringIO()
        with patch.object(self.launcher.subprocess, "run", return_value=failed), patch.object(self.launcher.shutil, "which", side_effect=lambda name: f"/usr/bin/{name}"), patch.object(self.launcher.os, "execve") as execute, patch("sys.stderr", error):
            status = self.launcher.main(["/creator"])
        self.assertEqual(status, 1)
        execute.assert_not_called()
        self.assertNotIn("fixture-secret", error.getvalue())

    def test_main_requires_sibling_script_and_uses_execve_with_minimal_environment(self):
        result = SimpleNamespace(returncode=0, stdout=json.dumps([app(), database()]), stderr="")
        with patch.object(self.launcher.subprocess, "run", return_value=result) as inspect, patch.object(self.launcher.shutil, "which", side_effect=lambda name: f"/usr/bin/{name}"), patch.object(self.launcher.os, "execve") as execute:
            self.assertEqual(self.launcher.main(["/creator", "--dry-run"]), 0)
        inspect.assert_called_once()
        self.assertEqual(inspect.call_args.args[0][-2:], ["photo-app-1", "photo-mariadb-1"])
        command = execute.call_args.args[1]
        self.assertIn("--dry-run", command)
        self.assertEqual(set(execute.call_args.args[2]), {"DATABASE_URL", "NEXT_PUBLIC_SITE_URL"})
        with patch.object(self.launcher.Path, "is_file", return_value=False), patch.object(self.launcher.os, "execve") as execute, patch("sys.stderr", io.StringIO()):
            self.assertEqual(self.launcher.main(["/creator"]), 1)
        execute.assert_not_called()


if __name__ == "__main__":
    unittest.main()
