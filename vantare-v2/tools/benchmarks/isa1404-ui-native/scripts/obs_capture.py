import argparse
import asyncio
import base64
import json
from pathlib import Path

import websockets


class ObsClient:
    def __init__(self, socket):
        self.socket = socket
        self.counter = 0

    async def request(self, request_type, request_data=None, allow_error=False):
        self.counter += 1
        request_id = str(self.counter)
        await self.socket.send(json.dumps({
            "op": 6,
            "d": {
                "requestType": request_type,
                "requestId": request_id,
                "requestData": request_data or {},
            },
        }))
        while True:
            message = json.loads(await self.socket.recv())
            if message.get("op") != 7 or message.get("d", {}).get("requestId") != request_id:
                continue
            status = message["d"]["requestStatus"]
            if not status["result"] and not allow_error:
                raise RuntimeError(f"{request_type}: {status}")
            return message["d"]


async def capture(args):
    async with websockets.connect(f"ws://127.0.0.1:{args.port}", max_size=20 * 1024 * 1024) as socket:
        hello = json.loads(await socket.recv())
        await socket.send(json.dumps({"op": 1, "d": {"rpcVersion": hello["d"]["rpcVersion"]}}))
        identified = json.loads(await socket.recv())
        if identified.get("op") != 2:
            raise RuntimeError(f"OBS did not identify the client: {identified}")
        client = ObsClient(socket)
        version = await client.request("GetVersion")
        await client.request("CreateScene", {"sceneName": args.scene}, allow_error=True)
        await client.request("CreateInput", {
            "sceneName": args.scene,
            "inputName": args.input,
            "inputKind": "window_capture",
            "inputSettings": {"cursor": False, "method": 2},
            "sceneItemEnabled": True,
        }, allow_error=True)
        items = await client.request("GetInputPropertiesListPropertyItems", {
            "inputName": args.input,
            "propertyName": "window",
        })
        candidates = items.get("responseData", {}).get("propertyItems", [])
        selected = next((item for item in candidates if args.title.lower() in item.get("itemName", "").lower()), None)
        if selected is None:
            names = [item.get("itemName", "") for item in candidates]
            raise RuntimeError(f"window containing {args.title!r} not found; available={names}")
        await client.request("SetInputSettings", {
            "inputName": args.input,
            "inputSettings": {"window": selected["itemValue"], "cursor": False, "method": 2},
            "overlay": True,
        })
        await client.request("SetCurrentProgramScene", {"sceneName": args.scene})
        await asyncio.sleep(2)
        screenshot = await client.request("GetSourceScreenshot", {
            "sourceName": args.input,
            "imageFormat": "png",
            "imageWidth": args.width,
            "imageHeight": args.height,
        })
        image_data = screenshot["responseData"]["imageData"].split(",", 1)[1]
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(base64.b64decode(image_data))
        metadata = {
            "obsVersion": version.get("responseData", {}),
            "selectedWindow": selected,
            "availableWindowCount": len(candidates),
            "output": str(output),
        }
        output.with_suffix(".json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--scene", default="ISA-1404")
    parser.add_argument("--input", default="Vantare overlay")
    parser.add_argument("--width", type=int, default=560)
    parser.add_argument("--height", type=int, default=430)
    asyncio.run(capture(parser.parse_args()))


if __name__ == "__main__":
    main()
