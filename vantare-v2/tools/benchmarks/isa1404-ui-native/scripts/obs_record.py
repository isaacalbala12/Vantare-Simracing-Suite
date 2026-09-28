"""Control recording in the isolated OBS instance used by P03."""

import argparse
import asyncio
import json
from pathlib import Path

import websockets

from obs_capture import ObsClient


async def run(args):
    async with websockets.connect(f"ws://127.0.0.1:{args.port}") as socket:
        hello = json.loads(await socket.recv())
        await socket.send(json.dumps({"op": 1, "d": {"rpcVersion": hello["d"]["rpcVersion"]}}))
        identified = json.loads(await socket.recv())
        if identified.get("op") != 2:
            raise RuntimeError(f"OBS did not identify the client: {identified}")
        client = ObsClient(socket)
        stopped = None
        muted_inputs = 0
        if args.action == "start":
            directory = Path(args.directory).resolve()
            directory.mkdir(parents=True, exist_ok=True)
            inputs = await client.request("GetInputList")
            for item in inputs.get("responseData", {}).get("inputs", []):
                response = await client.request(
                    "SetInputMute",
                    {"inputName": item["inputName"], "inputMuted": True},
                    allow_error=True,
                )
                muted_inputs += bool(response["requestStatus"]["result"])
            await client.request("SetRecordDirectory", {"recordDirectory": str(directory)})
            await client.request("StartRecord")
        elif args.action == "stop":
            status = await client.request("GetRecordStatus")
            if status["responseData"]["outputActive"]:
                stopped = await client.request("StopRecord")
        for _ in range(50):
            status = await client.request("GetRecordStatus")
            active = status["responseData"]["outputActive"]
            if args.action == "status" or active == (args.action == "start"):
                break
            await asyncio.sleep(0.1)
        video = await client.request("GetVideoSettings")
        result = {
            "action": args.action,
            "recordStatus": status.get("responseData", {}),
            "videoSettings": video.get("responseData", {}),
            "mutedInputCount": muted_inputs,
        }
        if stopped is not None:
            result["recordingOutput"] = stopped.get("responseData", {})
        if args.action == "start" and not result["recordStatus"].get("outputActive"):
            raise RuntimeError("OBS recording did not become active")
        if args.action == "stop" and result["recordStatus"].get("outputActive"):
            raise RuntimeError("OBS recording remained active")
        print(json.dumps(result))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--action", choices=("start", "status", "stop"), required=True)
    parser.add_argument("--directory")
    args = parser.parse_args()
    if args.action == "start" and not args.directory:
        parser.error("--directory is required for start")
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
