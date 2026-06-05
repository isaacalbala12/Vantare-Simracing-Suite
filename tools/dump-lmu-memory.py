"""
LMU Shared Memory Dump Tool
Usage: python tools/dump-lmu-memory.py [--output-dir test-data]
Requires Windows with Le Mans Ultimate running.
"""

import argparse
import ctypes
import json
import mmap
import os
import sys

sys.path.insert(0, os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    '..', 'Vantare-Ingeniero', 'shared-telemetry'
))

try:
    from shared_telemetry.pyLMUSharedMemory import lmu_data
except ImportError:
    print("Error: Cannot import lmu_data module.")
    print("Ensure Vantare-Ingeniero/shared-telemetry exists and has the pyLMUSharedMemory package.")
    sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Dump LMU shared memory to .bin + .json")
    parser.add_argument("--output-dir", default="test-data", help="Output directory")
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    # Size of the full structure
    buf_size = ctypes.sizeof(lmu_data.LMUObjectOut)
    print(f"LMUObjectOut size: {buf_size} bytes")

    try:
        mm = mmap.mmap(fileno=-1, length=buf_size, tagname=lmu_data.LMUConstants.LMU_SHARED_MEMORY_FILE)
    except Exception as e:
        print(f"Error: Cannot access LMU shared memory ({lmu_data.LMUConstants.LMU_SHARED_MEMORY_FILE})")
        print(f"Details: {e}")
        print("Is Le Mans Ultimate running on track?")
        sys.exit(1)

    # Read buffer
    raw = bytes(mm)

    # Write .bin
    bin_path = os.path.join(args.output_dir, "lmu-fixture.bin")
    with open(bin_path, "wb") as f:
        f.write(raw)
    print(f"Written: {bin_path} ({len(raw)} bytes)")

    # Parse via ctypes
    data = lmu_data.LMUObjectOut.from_buffer_copy(raw)

    # Extract key values
    result = {
        "generic": {
            "gameVersion": data.generic.gameVersion,
            "ffbTorque": data.generic.FFBTorque,
        },
        "session": {
            "trackName": data.scoring.scoringInfo.mTrackName.decode("utf-8", errors="replace").strip("\x00").strip(),
            "sessionType": data.scoring.scoringInfo.mSession,
            "currentET": data.scoring.scoringInfo.mCurrentET,
            "maxLaps": data.scoring.scoringInfo.mMaxLaps,
            "lapDist": data.scoring.scoringInfo.mLapDist,
            "numVehicles": data.scoring.scoringInfo.mNumVehicles,
            "gamePhase": data.scoring.scoringInfo.mGamePhase,
            "playerName": data.scoring.scoringInfo.mPlayerName.decode("utf-8", errors="replace").strip("\x00").strip(),
            "ambientTemp": data.scoring.scoringInfo.mAmbientTemp,
            "trackTemp": data.scoring.scoringInfo.mTrackTemp,
            "raining": data.scoring.scoringInfo.mRaining,
            "avgPathWetness": data.scoring.scoringInfo.mAvgPathWetness,
            "sessionTimeRemaining": data.scoring.scoringInfo.mSessionTimeRemaining,
        },
        "telemetry": {
            "activeVehicles": data.telemetry.activeVehicles,
            "playerVehicleIdx": data.telemetry.playerVehicleIdx,
            "playerHasVehicle": bool(data.telemetry.playerHasVehicle),
        },
        "vehicles": [],
        "playerTelemetry": None,
    }

    # Extract player telemetry
    if data.telemetry.playerHasVehicle:
        pidx = data.telemetry.playerVehicleIdx
        if pidx < 104:
            pt = data.telemetry.telemInfo[pidx]
            vx, vy, vz = pt.mLocalVel.x, pt.mLocalVel.y, pt.mLocalVel.z
            result["playerTelemetry"] = {
                "id": pt.mID,
                "lapNumber": pt.mLapNumber,
                "gear": pt.mGear,
                "engineRPM": pt.mEngineRPM,
                "speed": (vx*vx + vy*vy + vz*vz) ** 0.5,
                "throttle": pt.mFilteredThrottle,
                "brake": pt.mFilteredBrake,
                "fuel": pt.mFuel,
            }
            # Extract wheels
            result["wheels"] = []
            for w in range(4):
                wh = pt.mWheels[w]
                result["wheels"].append({
                    "brakeTemp": wh.mBrakeTemp,
                    "pressure": wh.mPressure,
                    "wear": wh.mWear,
                    "compoundType": int(wh.mCompoundType),
                })

    # Extract vehicle scoring
    num = min(data.scoring.scoringInfo.mNumVehicles, 104)
    for i in range(num):
        vs = data.scoring.vehScoringInfo[i]
        result["vehicles"].append({
            "id": vs.mID,
            "driverName": vs.mDriverName.decode("utf-8", errors="replace").strip("\x00").strip(),
            "totalLaps": vs.mTotalLaps,
            "place": vs.mPlace,
            "vehicleClass": vs.mVehicleClass.decode("utf-8", errors="replace").strip("\x00").strip(),
            "isPlayer": bool(vs.mIsPlayer),
            "pitState": vs.mPitState,
            "bestLapTime": vs.mBestLapTime,
            "lastLapTime": vs.mLastLapTime,
        })

    # Write .json
    json_path = os.path.join(args.output_dir, "lmu-fixture.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    print(f"Written: {json_path}")
    print(f"Vehicles: {len(result['vehicles'])}")
    print("Done!")

    mm.close()


if __name__ == "__main__":
    main()
