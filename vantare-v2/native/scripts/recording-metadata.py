"""Read the first manifest from the raw replay archive without extracting it."""
import json
import sys
import tarfile

with tarfile.open(sys.argv[1], mode="r|gz") as archive:
    for member in archive:
        if member.name.endswith("/manifest.json"):
            with archive.extractfile(member) as stream:
                print(json.dumps(json.load(stream)))
            break
    else:
        raise SystemExit("recording manifest missing")
