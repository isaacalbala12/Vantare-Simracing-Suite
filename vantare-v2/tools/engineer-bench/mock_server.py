"""Deterministic loopback SSE endpoint. No model and no performance claims."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import threading

from cases import build_cases


def make_server(port=0, fault=None):
    cases = {c["id"]: c for c in build_cases()}

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *_):
            pass

        def do_GET(self):
            raw = json.dumps({"object": "list", "data": [{"id": "engineer-mock"}]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def do_POST(self):
            if self.path != "/v1/chat/completions":
                self.send_error(404)
                return
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 1048576:
                self.send_error(413)
                return
            payload = json.loads(self.rfile.read(size))
            user = json.loads(payload["messages"][-1]["content"])
            case = cases[user["case_id"]]
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Connection", "close")
            self.end_headers()

            def event(value):
                self.wfile.write(("data: " + json.dumps(value, ensure_ascii=False) + "\r\n\r\n").encode())
                self.wfile.flush()

            def chunk(delta, finish=None):
                event({"choices": [{"index": 0, "delta": delta, "finish_reason": finish}]})

            self.wfile.write(b": mock keepalive\r\n\r\n")
            chunk({"role": "assistant", "content": ""})
            if case["kind"] == "tool":
                chunk({"tool_calls": [{"index": 0, "id": "call_mock", "type": "function",
                       "function": {"name": "get_race_fact", "arguments": ""}}]})
                for part in ('{"topic":', '"fuel"}'):
                    chunk({"tool_calls": [{"index": 0, "function": {"arguments": part}}]})
                finish = "tool_calls"
                count = 8
            else:
                text = case["gold"] if isinstance(case["gold"], str) else json.dumps(case["gold"], ensure_ascii=False)
                if fault == "wrong":
                    text = '{"invented_fuel_l": 42}'
                for i in range(0, len(text), 7):
                    chunk({"content": text[i:i + 7]})
                finish, count = "stop", len(text.split())
            if fault == "malformed":
                self.wfile.write(b"data: {invalid\n\n")
                self.wfile.flush()
                return
            if fault != "disconnect":
                chunk({}, "length" if fault == "length" else finish)
                event({"choices": [], "usage": {"prompt_tokens": 100, "completion_tokens": count}})
                self.wfile.write(b"data: [DONE]\n\n")
                self.wfile.flush()
            self.close_connection = True

    return ThreadingHTTPServer(("127.0.0.1", port), Handler)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=18080)
    parser.add_argument("--fault", choices=["wrong", "malformed", "disconnect", "length"])
    args = parser.parse_args()
    server = make_server(args.port, args.fault)
    print(f"Mock only: http://127.0.0.1:{server.server_port}/v1", flush=True)
    try:
        server.serve_forever(poll_interval=0.1)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
