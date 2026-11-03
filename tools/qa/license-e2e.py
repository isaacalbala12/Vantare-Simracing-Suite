"""VANTA-126: real Windows binaries + disposable WSL PostgreSQL/Deno/IdP.

Never stores raw IPC replies, OAuth URLs/tokens, credentials or DPAPI plaintext.
Only synthetic QA files are read; the real native directory is inventoried by metadata.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import ctypes
import hashlib
import json
import os
from pathlib import Path
import queue
import shutil
import socket
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

QA = Path("D:/VantareServer/qa/licencias-e2e").resolve()
OWNER = b"VANTA-126 qa-e2e fixture"
REAL = Path("C:/Users/Administrator/AppData/Local/Vantare/native")


def metadata():
    return sorted((str(p.relative_to(REAL)), p.stat().st_size, p.stat().st_mtime_ns)
                  for p in REAL.rglob("*") if p.is_file()) if REAL.exists() else []


def wsl(path):
    path = Path(path).resolve()
    if not path.is_relative_to(QA):
        raise ValueError("path outside QA")
    return "/mnt/d/" + path.as_posix()[3:]


def write_json(path, data):
    temporary = path.with_suffix(".new")
    temporary.write_text(json.dumps(data), encoding="utf-8")
    temporary.replace(path)


def owned(root, checkout):
    root.mkdir(parents=True, exist_ok=False)
    (root / "qa-e2e-owned").write_bytes(OWNER)
    for name in ["native", "local", "roaming", "tmp"]:
        (root / name).mkdir()
    shutil.copyfile(checkout / "vantare-v2/testdata/lmu-fixture.bin", root / "replay.bin")
    real = int(time.time() * 1000)
    write_json(root / "clock.json", dict(wall_ms=real, real_anchor_ms=real,
               monotonic_ms=0, phase="Waiting", session=47, feed=True))
    return root


def advance(root, seconds=0, **changes):
    path = root / "clock.json"
    clock = json.loads(path.read_text())
    real = int(time.time() * 1000)
    clock["wall_ms"] += real - clock["real_anchor_ms"] + int(seconds * 1000)
    clock["real_anchor_ms"] = real
    clock["monotonic_ms"] += int(seconds * 1000)
    clock.update(changes)
    write_json(path, clock)


def wait_for(predicate, timeout=20):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        result = predicate()
        if result:
            return result
        time.sleep(.05)  # Observable process/IPC readiness, never a license-duration wait.
    raise TimeoutError("observable QA barrier")


class LocalRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        parsed = urllib.parse.urlsplit(newurl)
        if parsed.scheme != "http" or parsed.hostname != "127.0.0.1":
            raise ValueError("external redirect blocked")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class Backend:
    def __init__(self, url):
        self.url = url
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), LocalRedirect())

    def request(self, route, data=None, headers=None):
        body = None if data is None else json.dumps(data, separators=(",", ":")).encode()
        req = urllib.request.Request(self.url + route, body,
              {"Content-Type": "application/json", **(headers or {})})
        with self.opener.open(req, timeout=20) as response:
            return json.load(response)

    def control(self, **data):
        return self.request("/qa/control", data)

    def stats(self):
        return self.request("/qa/stats")


class App:
    def __init__(self, root, bins, backend):
        self.root, self.backend = root, backend
        self.events = []
        env = {key: value for key, value in os.environ.items() if not key.startswith("VANTARE_")}
        env.update(VANTARE_QA_ROOT=str(root), VANTARE_QA_CLOCK=str(root / "clock.json"),
                   VANTARE_NATIVE_DATA_ROOT=str(root / "native"), LOCALAPPDATA=str(root / "local"),
                   APPDATA=str(root / "roaming"), TEMP=str(root / "tmp"), TMP=str(root / "tmp"),
                   VANTARE_QA_LICENSE_URL=backend.url, VANTARE_QA_IDP_URL=backend.url,
                   VANTARE_QA_REDIRECT_URL="http://127.0.0.1:0/callback")
        self.log = (root / ("process-" + uuid.uuid4().hex + ".stderr.log")).open("wb")
        self.child = subprocess.Popen([str(bins / "vantare.exe"), "--qa-e2e"], env=env,
              stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.log,
              creationflags=subprocess.CREATE_NO_WINDOW)
        self.messages = queue.Queue()
        self.reader = threading.Thread(target=self.read_stdout)
        self.reader.start()
        ready = self.receive()
        assert ready.get("ready"), "real supervisor did not start"
        self.core_pid = ready["core_pid"]

    def read_stdout(self):
        try:
            for line in self.child.stdout:
                self.messages.put(json.loads(line))
        finally:
            self.messages.put(None)

    def receive(self):
        reply = self.messages.get(timeout=25)
        if reply is None:
            raise RuntimeError("real supervisor disconnected")
        return reply

    def call(self, action, **args):
        self.child.stdin.write((json.dumps(dict(action=action, **args)) + "\n").encode())
        self.child.stdin.flush()
        return self.receive()

    def service(self, command, **args):
        reply = self.call("service", command=dict(command=command, **args))
        self.events.append({"command": command, "result": reply.get("result"), "session": reply.get("session")})
        return reply

    def policy(self):
        policy = self.call("feed")["policy"]
        self.events.append({"feed": policy})  # Policy contains neither credentials nor tokens.
        return policy

    def until(self, predicate):
        return wait_for(lambda: (p if predicate(p := self.policy()) else None))

    def login(self, identity="a"):
        self.backend.control(identity=identity)
        self.service("AccountBegin")
        reply = self.service("AccountCopyLink")
        link = reply.get("url") or reply.get("link")
        assert isinstance(link, str) and link.startswith(self.backend.url + "/"), "local PKCE link missing"
        # The real callback waits for AccountPoll; the reader is owned/joined here.
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(lambda: self.backend.opener.open(link, timeout=15).close())
            wait_for(lambda: self.service("AccountPoll").get("session") == "SignedIn")
            future.result(timeout=15)

    def binding(self):
        paths = list((self.root / "native").rglob("binding.dpapi"))
        assert len(paths) == 1, "one real core binding required"
        return hashlib.sha256(paths[0].read_bytes()).hexdigest()

    def close(self, crash=False):
        if self.child.poll() is None:
            if crash:
                self.child.kill()  # Existing supervisor Job also terminates its actual children.
            else:
                self.child.stdin.write(b'{"action":"exit"}\n')
                self.child.stdin.flush()
            self.child.wait(timeout=15)
        self.reader.join(timeout=5)
        assert not self.reader.is_alive(), "stdout reader did not stop"
        self.log.close()
        if not crash:
            assert self.child.returncode == 0, "real process shutdown failed"
        write_json(self.root / "observations.json", self.events)


def run_cases(checkout, bins, job, backend):
    results = []
    app = None

    def fresh(number, grant="pro", seconds=600):
        nonlocal app
        root = owned(job / f"case-{number}-{uuid.uuid4().hex}", checkout)
        backend.control(clock=wsl(root / "clock.json"), identity="a", mode="normal")
        backend.control(grant=grant, seconds=seconds)
        app = App(root, bins, backend)
        app.login()
        app.service("LicenseRenew")
        app.until(lambda p: p["state"]["kind"] == "active" and (grant == "free" or p["catalog"] != "free"))
        return app

    def case1():
        a = fresh(1)
        assert a.binding()
        advance(a.root, phase="Live")
        a.until(lambda p: p["live"] and p["catalog"] == "pro")

    def case2():
        a = fresh(2)
        backend.control(grant="pro", seconds=180)
        assert a.service("LicenseRenew")["result"] == "License"
        a.until(lambda p: p["catalog"] == "pro")
        binding = a.binding()
        backend.control(mode="offline")
        advance(a.root, phase="Live")
        a.until(lambda p: p["live"])
        advance(a.root, 181)
        a.until(lambda p: p["state"]["kind"] == "grace")
        assert a.binding() == binding, "network failure revoked or replaced binding"

    def case3():
        a = fresh(3, seconds=60)
        backend.control(mode="offline")
        advance(a.root, phase="Live")
        a.until(lambda p: p["live"])
        advance(a.root, 61)
        before = a.until(lambda p: p["state"]["kind"] == "grace")
        advance(a.root, 1800, phase="Paused")
        paused = a.until(lambda p: not p["live"] and p["state"]["kind"] == "grace")
        assert paused["grace_until_ms"] == before["grace_until_ms"], "pause extended grace"
        advance(a.root, 1801)
        a.until(lambda p: p["catalog"] == "free")

    def case4():
        a = fresh(4, seconds=60)
        binding = a.binding()
        backend.control(mode="offline")
        advance(a.root, 61)
        a.until(lambda p: p["catalog"] == "free" and p["signed_until_ms"] is None)
        assert a.binding() == binding, "commercial expiry became revocation"

    def case5():
        nonlocal app
        a = fresh("5-logout", grant="founders")
        a.service("Logout")
        a.until(lambda p: p["state"]["kind"] == "revoked")
        assert not list((a.root / "native").rglob("binding.dpapi"))
        assert a.service("AccountPoll")["session"] == "SignedOut"
        a.close(); app = None
        a = fresh("5-identity", grant="founders")
        backend.control(identity="b", grant="pro", mode="hold")
        a.login("b")
        a.until(lambda p: p["state"]["kind"] == "revoked")
        assert not list((a.root / "native").rglob("binding.dpapi"))
        backend.control(mode="normal")
        a.close(); app = None
        a = fresh("5-reset", grant="founders")
        a.service("DeviceReset")
        a.until(lambda p: p["state"]["kind"] == "revoked")
        assert not list((a.root / "native").rglob("binding.dpapi"))

    def case6():
        a = fresh(6)
        binding = a.binding()
        backend.control(mode="unauthorized")
        advance(a.root, 61)
        wait_for(lambda: a.service("AccountPoll").get("session") == "NeedsSignIn")
        assert a.binding() == binding
        a.until(lambda p: p["state"]["kind"] == "active")
        a.close()
        # Persisted session is observed by a new actual helper/core/supervisor set.
        nonlocal app
        app = App(a.root, bins, backend)
        assert app.service("AccountPoll")["session"] == "NeedsSignIn"
        assert app.binding() == binding

    def case7():
        import base64, hmac
        a = fresh(7, grant="free")
        backend.control(grant="free", customer=True)
        assert a.service("Purchase", product="pro_monthly")["result"] == "Checkout"
        assert a.policy()["catalog"] == "free"
        advance(a.root, feed=False)
        wall = json.loads((a.root / "clock.json").read_text())["wall_ms"]
        stamp = str(wall // 1000)
        iso = __import__('datetime').datetime.fromtimestamp(wall / 1000, __import__('datetime').timezone.utc).isoformat()
        end = __import__('datetime').datetime.fromtimestamp(wall / 1000 + 3600, __import__('datetime').timezone.utc).isoformat()
        event = {"type":"subscription.active","data":{"id":"qa-sub-"+uuid.uuid4().hex,"customer_id":"qa-customer",
                 "product_id":"00000000-0000-0000-0000-000000000003","status":"active","modified_at":iso,"current_period_end":end}}
        body = json.dumps(event, separators=(",", ":")).encode()
        event_id = "qa-event-" + uuid.uuid4().hex
        signature = base64.b64encode(hmac.new(b"qa-e2e-webhook-local-only", event_id.encode()+b"."+stamp.encode()+b"."+body, hashlib.sha256).digest()).decode()
        backend.request("/functions/v1/billing-webhook", event, {"webhook-id":event_id,"webhook-timestamp":stamp,"webhook-signature":"v1,"+signature})
        before = backend.stats()["licenseRequests"]
        advance(a.root, 61)
        wait_for(lambda: backend.stats()["licenseRequests"] > before)
        assert a.policy()["catalog"] != "pro", "reply/HTTP bypassed the actual Feed"
        advance(a.root, feed=True)
        a.until(lambda p: p["catalog"] == "pro")

    def case8():
        nonlocal app
        a = fresh(8)
        a.close(); app = None
        authority = next((a.root / "native").rglob("authority.dpapi"))
        authority.write_bytes(b"VANTA-126 deliberate synthetic damage")
        backend.control(mode="offline")
        app = App(a.root, bins, backend)
        app.until(lambda p: p["state"]["kind"] == "recovery_required")
        assert len(list(authority.parent.glob("authority-*.corrupto"))) == 1
        backend.control(mode="normal")
        app.service("AccountPoll")
        app.service("LicenseRenew")
        app.until(lambda p: p["catalog"] == "pro")

    def case9():
        a = fresh(9, grant="founders")
        assert a.policy()["signed_until_ms"] is None
        before = backend.stats()["licenseRequests"]
        advance(a.root, 86390)
        a.service("LicenseRenewAutomatic")
        assert backend.stats()["licenseRequests"] == before, "perpetual renewed before 24h"
        advance(a.root, 11)
        wait_for(lambda: backend.stats()["licenseRequests"] > before)
        a.until(lambda p: p["state"]["kind"] == "active" and p["signed_until_ms"] is None)

    def case10():
        nonlocal app
        a = fresh(10)
        binding = a.binding()
        backend.control(mode="hold")
        advance(a.root, 61)
        wait_for(lambda: backend.stats()["held"])
        a.close(crash=True); app = None
        backend.control(mode="normal")
        before = backend.stats()["licenseRequests"]
        app = App(a.root, bins, backend)
        app.service("AccountPoll")
        app.until(lambda p: p["catalog"] == "pro")
        wait_for(lambda: backend.stats()["licenseRequests"] > before)
        assert not list((a.root / "native").rglob("license-candidate*"))
        assert not list((a.root / "native").rglob("license-transfer-pending*"))
        assert binding, "pre-crash binding missing"

    for number, test in enumerate([case1,case2,case3,case4,case5,case6,case7,case8,case9,case10],1):
        try:
            test()
            results.append({"scenario":number,"result":"PASA","root":str(app.root)})
        except Exception as exc:
            # HTTP/IPC exceptions may contain transient OAuth URLs; never stringify them.
            results.append({"scenario":number,"result":"FALLA","error_type":type(exc).__name__,"root":str(app.root) if app else None})
        finally:
            backend.control(mode="normal")
            if app:
                try: app.close()
                except Exception: results[-1]["shutdown"]="FALLA"
                app = None
            write_json(job / "results.json", results)
        print(f"scenario {number}: {results[-1]['result']}",flush=True)
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkout", required=True)
    parser.add_argument("--bins", required=True)
    args = parser.parse_args()
    checkout, bins = Path(args.checkout).resolve(), Path(args.bins).resolve()
    if os.name != "nt" or not all(p.is_relative_to(QA) for p in [checkout,bins]):
        parser.error("requires Windows and the dedicated QA root")
    for name in ["vantare","vantare-core","vantare-services"]:
        marker = subprocess.check_output([str(bins/(name+".exe")),"--qa-e2e-probe"],timeout=10)
        if marker.strip()!=b"VANTARE_QA_E2E_NOT_FOR_DISTRIBUTION_1916":
            raise RuntimeError("not a qa-e2e binary")
    before = metadata()
    job = owned(QA / ("e2e-1916-" + uuid.uuid4().hex), checkout)
    with socket.socket() as probe:
        probe.bind(("127.0.0.1",0)); port = probe.getsockname()[1]
    backend = Backend(f"http://127.0.0.1:{port}")
    with (job/"backend.log").open("wb") as log:
        process = subprocess.Popen(["wsl","-d","vantare-inferencia","--","bash",wsl(checkout/"tools/qa/license-e2e-backend.sh"),
                  wsl(checkout),wsl(job),str(port)],stdout=log,stderr=log,stdin=subprocess.DEVNULL)
        try:
            def ready():
                if process.poll() is not None: raise RuntimeError("local backend startup failed")
                try: return backend.stats()
                except (urllib.error.URLError,ConnectionError): return None
            wait_for(ready, timeout=600)
            results=run_cases(checkout,bins,job,backend)
        finally:
            try: backend.request("/qa/stop",{})
            except Exception: pass
            try: process.wait(timeout=30)
            except subprocess.TimeoutExpired:
                process.kill(); process.wait()
            after=metadata()
            write_json(job/"real-native-metadata.json",dict(before=before,after=after,unchanged=before==after))
            print(job,flush=True)
    lines=["# VANTA-126 · E2E real de licencias", "", "| Escenario | Resultado | Evidencia |", "|---|---|---|"]
    lines += [f"| {r['scenario']} | {r['result']} | {r.get('root')} / observations.json |" for r in results]
    (job/"INFORME.md").write_text("\n".join(lines)+"\n",encoding="utf-8")
    if before!=after or any(r["result"]!="PASA" or r.get("shutdown") for r in results): raise SystemExit(1)


if __name__=="__main__":
    main()
