#!/usr/bin/env python3

import json
import os
import subprocess
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parent.parent
HELPER = ROOT / "bin" / "localized-events"


class LocalizedEventsTest(unittest.TestCase):
    def test_uses_requested_viewer_timezone_and_builds_local_query(self):
        event = {
            "all_day": False,
            "start": "2026-08-26T12:00:00+01:00",
            "end": "2026-08-26T13:00:00+01:00",
            "title": "Get JLPT Eventbrite ticket",
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            args_file = temp / "args.json"
            fake_caldir = temp / "caldir"
            fake_caldir.write_text(
                "#!/usr/bin/env python3\n"
                "import json, os, sys\n"
                "json.dump(sys.argv[1:], open(os.environ['ARGS_FILE'], 'w'))\n"
                f"print({json.dumps(json.dumps([event]))})\n"
            )
            fake_caldir.chmod(0o755)

            result = subprocess.run(
                [str(HELPER), str(fake_caldir), "2", "America/Toronto"],
                capture_output=True,
                text=True,
                env={**os.environ, "ARGS_FILE": str(args_file)},
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            localized = json.loads(result.stdout)[0]["_viewer"]
            self.assertEqual(localized["timezone"], "America/Toronto")
            self.assertEqual(
                localized["start_wall_ms"],
                int(datetime(2026, 8, 26, 7, tzinfo=ZoneInfo("UTC")).timestamp() * 1000),
            )
            self.assertEqual(
                localized["end_wall_ms"],
                int(datetime(2026, 8, 26, 8, tzinfo=ZoneInfo("UTC")).timestamp() * 1000),
            )

            args = json.loads(args_file.read_text())
            self.assertEqual(args[:3], ["events", "--json", "--from"])
            self.assertEqual(args[4], "--to")
            start = datetime.fromisoformat(args[3]).date()
            end = datetime.fromisoformat(args[5]).date()
            self.assertEqual((end - start).days, 2)

    def test_propagates_caldir_errors(self):
        result = subprocess.run(
            [str(HELPER), "/bin/false", "2", "Europe/London"],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main()
