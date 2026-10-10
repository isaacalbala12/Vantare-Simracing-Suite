"""Commit one allowlisted public file; update only refs/heads/roadmap-data by CAS."""
import argparse
import base64
import json
import os
import urllib.error
import urllib.request

REF = "heads/roadmap-data"


def publish(api, publication):
    # No force, protected branch, checkout mutation, or source tree in the data branch.
    try:
        previous = api("GET", "git/ref/" + REF)["object"]["sha"]
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise
        previous = None
    if previous:
        tree = api("GET", "git/commits/" + previous)["tree"]["sha"]
        entries = api("GET", "git/trees/" + tree)["tree"]
        if any(entry["path"] != "roadmap.json" or entry["type"] != "blob" for entry in entries):
            raise ValueError("Data branch contains unexpected files")
        blob_sha = next((entry["sha"] for entry in entries if entry["path"] == "roadmap.json"), None)
        if blob_sha:
            blob = api("GET", "git/blobs/" + blob_sha)
            old = json.loads(base64.b64decode(blob["content"]))
            if old["document"] == publication["document"]:
                return # Preserve publication date and SHA when content is unchanged.
    blob = api("POST", "git/blobs", {"content": json.dumps(publication, ensure_ascii=False), "encoding": "utf-8"})
    tree = api("POST", "git/trees", {"tree": [{"path": "roadmap.json", "mode": "100644", "type": "blob", "sha": blob["sha"]}]})
    commit = api("POST", "git/commits", {"message": "Update public ClickUp roadmap", "tree": tree["sha"], "parents": [previous] if previous else []})
    if previous:
        api("PATCH", "git/refs/" + REF, {"sha": commit["sha"], "force": False})
    else:
        api("POST", "git/refs", {"ref": "refs/" + REF, "sha": commit["sha"]})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--publication", required=True)
    args = parser.parse_args()
    def api(method, path, body=None):
        request = urllib.request.Request("https://api.github.com/repos/" + os.environ["REPOSITORY"] + "/" + path,
            data=json.dumps(body).encode() if body is not None else None, method=method,
            headers={"Authorization": "Bearer " + os.environ["GH_TOKEN"], "Accept": "application/vnd.github+json"})
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    try:
        with open(args.publication, encoding="utf-8") as file:
            publish(api, json.load(file))
    except (OSError, ValueError, KeyError):
        parser.exit(1, "Data publication failed; inspect branch before retrying.\n")


if __name__ == "__main__":
    main()
