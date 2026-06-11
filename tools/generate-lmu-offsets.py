"""
LMU Shared Memory Offset Generator
Recursively walks ctypes.Structure hierarchy from lmu_data.py,
respects _pack_=4 alignment, and generates offset constants for TypeScript and Go.

Usage:
  python tools/generate-lmu-offsets.py
  python tools/generate-lmu-offsets.py --output packages/sim-core/src/lmu-offsets.ts \\
      --go-output vantare-v2/internal/telemetry/lmu/offsets.go
"""

import argparse
import ctypes
import sys
import os

from ingeniero_path import add_shared_telemetry_to_path

add_shared_telemetry_to_path()

from shared_telemetry.pyLMUSharedMemory import lmu_data

STRUCT_CLASSES = {
    'LMUVect3': lmu_data.LMUVect3,
    'LMUWheel': lmu_data.LMUWheel,
    'LMUVehicleTelemetry': lmu_data.LMUVehicleTelemetry,
    'LMUVehicleScoring': lmu_data.LMUVehicleScoring,
    'LMUScoringInfo': lmu_data.LMUScoringInfo,
    'LMUApplicationState': lmu_data.LMUApplicationState,
    'LMUEvent': lmu_data.LMUEvent,
    'LMUGeneric': lmu_data.LMUGeneric,
    'LMUPathData': lmu_data.LMUPathData,
    'LMUScoringData': lmu_data.LMUScoringData,
    'LMUTelemetryData': lmu_data.LMUTelemetryData,
    'LMUObjectOut': lmu_data.LMUObjectOut,
}

VT_MAP = {
    'mID': 'ID',
    'mDeltaTime': 'DELTA_TIME',
    'mElapsedTime': 'ELAPSED_TIME',
    'mLapNumber': 'LAP_NUMBER',
    'mVehicleName': 'VEHICLE_NAME',
    'mTrackName': 'TRACK_NAME',
    'mLocalVel': 'LOCAL_VEL',
    'mGear': 'GEAR',
    'mEngineRPM': 'ENGINE_RPM',
    'mEngineWaterTemp': 'ENGINE_WATER_TEMP',
    'mEngineOilTemp': 'ENGINE_OIL_TEMP',
    'mFilteredThrottle': 'FILTERED_THROTTLE',
    'mFilteredBrake': 'FILTERED_BRAKE',
    'mFilteredSteering': 'FILTERED_STEERING',
    'mFilteredClutch': 'FILTERED_CLUTCH',
    'mFuel': 'FUEL',
    'mEngineMaxRPM': 'ENGINE_MAX_RPM',
    'mFuelCapacity': 'FUEL_CAPACITY',
    'mDeltaBest': 'DELTA_BEST',
    'mCurrentSector': 'CURRENT_SECTOR',
    'mStateOfCharge': 'STATE_OF_CHARGE',
    'mTimeGapPlaceAhead': 'TIME_GAP_PLACE_AHEAD',
    'mTimeGapPlaceBehind': 'TIME_GAP_PLACE_BEHIND',
    'mVehicleModel': 'VEHICLE_MODEL',
    'mRearFlapActivated': 'REAR_FLAP_ACTIVATED',
    'mRearFlapLegalStatus': 'REAR_FLAP_LEGAL_STATUS',
    'mBatteryChargeFraction': 'BATTERY_CHARGE_FRACTION',
}

VS_MAP = {
    'mID': 'ID',
    'mDriverName': 'DRIVER_NAME',
    'mVehicleName': 'VEHICLE_NAME',
    'mTotalLaps': 'TOTAL_LAPS',
    'mSector': 'SECTOR',
    'mFinishStatus': 'FINISH_STATUS',
    'mLapDist': 'LAP_DIST',
    'mBestLapTime': 'BEST_LAP_TIME',
    'mLastLapTime': 'LAST_LAP_TIME',
    'mCurSector1': 'CUR_SECTOR1',
    'mCurSector2': 'CUR_SECTOR2',
    'mNumPitstops': 'NUM_PITSTOPS',
    'mNumPenalties': 'NUM_PENALTIES',
    'mIsPlayer': 'IS_PLAYER',
    'mInPits': 'IN_PITS',
    'mPlace': 'PLACE',
    'mVehicleClass': 'VEHICLE_CLASS',
    'mTimeBehindNext': 'TIME_BEHIND_NEXT',
    'mLapsBehindNext': 'LAPS_BEHIND_NEXT',
    'mTimeBehindLeader': 'TIME_BEHIND_LEADER',
    'mLapsBehindLeader': 'LAPS_BEHIND_LEADER',
    'mPitState': 'PIT_STATE',
    'mQualification': 'QUALIFICATION',
    'mEstimatedLapTime': 'ESTIMATED_LAP_TIME',
    'mPitGroup': 'PIT_GROUP',
    'mFlag': 'FLAG',
    'mFuelFraction': 'FUEL_FRACTION',
    'mDRSState': 'DRS_STATE',
    'mSteamID': 'STEAM_ID',
}

WH_MAP = {
    'mBrakeTemp': 'BRAKE_TEMP',
    'mBrakePressure': 'BRAKE_PRESSURE',
    'mPressure': 'PRESSURE',
    'mTemperature': 'TEMPERATURE',
    'mWear': 'WEAR',
    'mSurfaceType': 'SURFACE_TYPE',
    'mFlat': 'FLAT',
    'mDetached': 'DETACHED',
    'mCamber': 'CAMBER',
    'mRotation': 'ROTATION',
    'mTireLoad': 'TIRE_LOAD',
    'mGripFract': 'GRIP_FRACT',
    'mOptimalTemp': 'OPTIMAL_TEMP',
    'mCompoundIndex': 'COMPOUND_INDEX',
    'mCompoundType': 'COMPOUND_TYPE',
}

GO_VT_MAP = {
    'mID': 'vehicleTelemetryID',
    'mLapNumber': 'vehicleTelemetryLapNumber',
    'mLocalVel': 'vehicleTelemetryLocalVel',
    'mVehicleName': 'vehicleTelemetryVehicleName',
    'mTrackName': 'vehicleTelemetryTrackName',
    'mGear': 'vehicleTelemetryGear',
    'mEngineRPM': 'vehicleTelemetryEngineRPM',
    'mFuel': 'vehicleTelemetryFuel',
    'mFuelCapacity': 'vehicleTelemetryFuelCapacity',
    'mFilteredThrottle': 'vehicleTelemetryFilteredThrottle',
    'mFilteredBrake': 'vehicleTelemetryFilteredBrake',
    'mFilteredSteering': 'vehicleTelemetryFilteredSteering',
    'mDeltaBest': 'vehicleTelemetryDeltaBest',
}

GO_SCORING_MAP = {
    'mTrackName': 'scoringTrackName',
    'mSession': 'scoringSession',
    'mCurrentET': 'scoringCurrentET',
    'mNumVehicles': 'scoringNumVehicles',
    'mGamePhase': 'scoringGamePhase',
    'mPlayerName': 'scoringPlayerName',
    'mAmbientTemp': 'scoringAmbientTemp',
    'mTrackTemp': 'scoringTrackTemp',
}

GO_VS_MAP = {
    'mID': 'vehicleScoringID',
    'mDriverName': 'vehicleScoringDriverName',
    'mTotalLaps': 'vehicleScoringTotalLaps',
    'mIsPlayer': 'vehicleScoringIsPlayer',
    'mInPits': 'vehicleScoringInPits',
    'mPlace': 'vehicleScoringPlace',
    'mVehicleClass': 'vehicleScoringVehicleClass',
    'mTimeBehindLeader': 'vehicleScoringTimeBehindLeader',
}


def _alignment_of(t):
    """Natural alignment of a ctypes type (without pack)."""
    if issubclass(t, ctypes.Structure):
        max_align = 1
        if t._fields_:
            for fn, ft in t._fields_:
                max_align = max(max_align, _alignment_of(ft))
        return max_align
    if hasattr(t, '_type_') and hasattr(t, '_length_'):
        return _alignment_of(t._type_)
    if issubclass(t, ctypes.c_double):
        return 8
    if issubclass(t, (ctypes.c_int, ctypes.c_uint, ctypes.c_float, ctypes.c_uint32, ctypes.c_int32)):
        return 4
    if issubclass(t, (ctypes.c_short, ctypes.c_ushort)):
        return 2
    if issubclass(t, (ctypes.c_ulonglong, ctypes.c_longlong)):
        return 8
    if issubclass(t, (ctypes.c_ubyte, ctypes.c_byte, ctypes.c_bool, ctypes.c_char, ctypes.c_uint8, ctypes.c_int8, ctypes.c_char)):
        return 1
    return 4


def pack4_align(t):
    return min(4, _alignment_of(t))


def walk_struct(cls):
    """Walk a ctypes.Structure and return its layout info."""
    if not hasattr(cls, '_fields_') or not cls._fields_:
        return {'name': cls.__name__, 'size': 0, 'fields': []}

    info = {
        'name': cls.__name__,
        'size': ctypes.sizeof(cls),
        'pack': getattr(cls, '_pack_', None),
        'fields': [],
    }

    offset = 0
    for field_name, field_type in cls._fields_:
        field_info = {'name': field_name}

        if hasattr(field_type, '_length_') and hasattr(field_type, '_type_'):
            # Array type
            elem = field_type._type_
            length = field_type._length_
            elem_size = ctypes.sizeof(elem)
            align = pack4_align(elem)
            pad = (align - (offset % align)) % align
            offset += pad
            total_size = elem_size * length

            field_info['offset'] = offset
            field_info['size'] = total_size
            field_info['type'] = 'array'
            field_info['length'] = length
            field_info['element_size'] = elem_size

            if issubclass(elem, ctypes.Structure) and hasattr(elem, '_fields_') and elem._fields_:
                field_info['nested'] = walk_struct(elem)
                field_info['stride'] = ctypes.sizeof(elem)

            offset += total_size
        elif issubclass(field_type, ctypes.Structure):
            # Nested struct
            align = pack4_align(field_type)
            pad = (align - (offset % align)) % align
            offset += pad
            field_info['offset'] = offset
            field_info['size'] = ctypes.sizeof(field_type)
            field_info['type'] = 'struct'
            field_info['nested'] = walk_struct(field_type)
            offset += ctypes.sizeof(field_type)
        else:
            # Primitive type
            align = pack4_align(field_type)
            pad = (align - (offset % align)) % align
            offset += pad
            sz = ctypes.sizeof(field_type) if not (hasattr(field_type, '_length_') and hasattr(field_type, '_type_')) else ctypes.sizeof(field_type._type_) * field_type._length_
            if hasattr(field_type, '_length_') and hasattr(field_type, '_type_'):
                sz = ctypes.sizeof(field_type._type_) * field_type._length_
            else:
                sz = ctypes.sizeof(field_type)
            field_info['offset'] = offset
            field_info['size'] = sz
            field_info['type'] = field_type.__name__ if hasattr(field_type, '__name__') else str(field_type)
            offset += sz

        info['fields'].append(field_info)

    info['computed_size'] = offset
    return info


def _field_offset(struct_info, field_name):
    for field in struct_info['fields']:
        if field['name'] == field_name:
            return field['offset']
    raise KeyError(f"{struct_info['name']}.{field_name}")


def compute_context():
    walked = {name: walk_struct(cls) for name, cls in STRUCT_CLASSES.items()}

    obj = walked['LMUObjectOut']
    obj_out_size = ctypes.sizeof(lmu_data.LMUObjectOut)
    generic_offset = obj['fields'][0]['offset']
    paths_offset = obj['fields'][1]['offset']
    scoring_offset = obj['fields'][2]['offset']
    telemetry_offset = obj['fields'][3]['offset']

    sc_data = walked['LMUScoringData']
    sc_info = walked['LMUScoringInfo']
    sc_info_field = sc_data['fields'][0]
    veh_sc_field = sc_data['fields'][2]
    sc_stream_field = sc_data['fields'][3]
    telem_data = walked['LMUTelemetryData']
    telem_info_field = telem_data['fields'][3]

    scoring_info_abs = scoring_offset + sc_info_field['offset']
    vehicle_scoring_abs = scoring_offset + veh_sc_field['offset']
    telem_info_abs = telemetry_offset + telem_info_field['offset']

    telemetry_fields = {}
    for field in telem_data['fields']:
        telemetry_fields[field['name']] = telemetry_offset + field['offset']

    return {
        'walked': walked,
        'obj_out_size': obj_out_size,
        'generic_offset': generic_offset,
        'paths_offset': paths_offset,
        'scoring_offset': scoring_offset,
        'telemetry_offset': telemetry_offset,
        'scoring_info_abs': scoring_info_abs,
        'vehicle_scoring_abs': vehicle_scoring_abs,
        'telem_info_abs': telem_info_abs,
        'scoring_stream_abs': scoring_offset + sc_stream_field['offset'],
        'telemetry_fields': telemetry_fields,
        'vehicle_telemetry_stride': ctypes.sizeof(lmu_data.LMUVehicleTelemetry),
        'vehicle_scoring_stride': ctypes.sizeof(lmu_data.LMUVehicleScoring),
        'scoring_info_size': sc_info['size'],
    }


def generate_ts(ctx):
    lines = []
    lines.append("// Auto-generated by tools/generate-lmu-offsets.py")
    lines.append("// Do not edit manually")
    lines.append("")

    obj_out_size = ctx['obj_out_size']
    walked = ctx['walked']
    generic_offset = ctx['generic_offset']
    paths_offset = ctx['paths_offset']
    scoring_offset = ctx['scoring_offset']
    telemetry_offset = ctx['telemetry_offset']

    lines.append(f"export const LMU_OBJECT_OUT_SIZE = {obj_out_size};")
    lines.append("")

    gen = walked['LMUGeneric']
    evt = walked['LMUEvent']
    app = walked['LMUApplicationState']
    path = walked['LMUPathData']
    sc_data = walked['LMUScoringData']
    sc_info = walked['LMUScoringInfo']
    vs = walked['LMUVehicleScoring']
    vect3 = walked['LMUVect3']
    sc_info_field = sc_data['fields'][0]
    veh_sc_field = sc_data['fields'][2]
    sc_stream_field = sc_data['fields'][3]
    telem_data = walked['LMUTelemetryData']
    vt = walked['LMUVehicleTelemetry']
    wh = walked['LMUWheel']
    telem_info_field = telem_data['fields'][3]

    lines.append("export const LMU = {")
    lines.append(f"  OBJECT_OUT: {{ SIZE: {obj_out_size} }},")
    lines.append("")

    # GENERIC
    lines.append("  GENERIC: {")
    lines.append(f"    OFFSET: {generic_offset},")
    lines.append(f"    SIZE: {gen['size']},")
    for f in evt['fields']:
        lines.append(f"    EVENT_{f['name']}: {generic_offset + f['offset']},")
    for f in gen['fields']:
        if f['name'] == 'gameVersion':
            lines.append(f"    GAME_VERSION: {generic_offset + f['offset']},")
        elif f['name'] == 'FFBTorque':
            lines.append(f"    FFB_TORQUE: {generic_offset + f['offset']},")
        elif f['name'] == 'appInfo':
            lines.append(f"    APP_INFO: {{ OFFSET: {generic_offset + f['offset']}, SIZE: {f['size']} }},")
            for af in app['fields']:
                lines.append(f"    APP_{af['name'].upper()}: {generic_offset + f['offset'] + af['offset']},")
    lines.append("  },")
    lines.append("")

    # PATHS
    lines.append("  PATHS: {")
    lines.append(f"    OFFSET: {paths_offset},")
    lines.append(f"    SIZE: {path['size']},")
    for f in path['fields']:
        lines.append(f"    {f['name'].upper()}: {{ OFFSET: {paths_offset + f['offset']}, SIZE: {f['size']} }},")
    lines.append("  },")
    lines.append("")

    # SCORING
    lines.append("  SCORING: {")
    lines.append(f"    OFFSET: {scoring_offset},")
    lines.append(f"    SIZE: {sc_data['size']},")
    lines.append("")
    lines.append("    SCORING_INFO: {")
    lines.append(f"      OFFSET: {scoring_offset + sc_info_field['offset']},")
    lines.append(f"      SIZE: {sc_info['size']},")
    for f in sc_info['fields']:
        abs_off = scoring_offset + sc_info_field['offset'] + f['offset']
        if f['type'] == 'struct' and f['name'] == 'mWind':
            lines.append(f"      WIND: {{ OFFSET: {abs_off}, X: {abs_off + vect3['fields'][0]['offset']}, Y: {abs_off + vect3['fields'][1]['offset']}, Z: {abs_off + vect3['fields'][2]['offset']} }},")
        elif f['type'] == 'struct':
            lines.append(f"      {f['name'].upper()}: {{ OFFSET: {abs_off}, SIZE: {f['size']} }},")
        elif f['type'] == 'array':
            lines.append(f"      {f['name'].upper()}: {{ OFFSET: {abs_off}, SIZE: {f['size']} }},")
        else:
            lines.append(f"      {f['name'].upper()}: {abs_off},")
    lines.append("    },")
    lines.append("")
    lines.append("    VEH_SCORING_INFO: {")
    lines.append(f"      OFFSET: {scoring_offset + veh_sc_field['offset']},")
    lines.append(f"      STRIDE: {ctx['vehicle_scoring_stride']},")
    lines.append("      MAX: 104,")
    lines.append("    },")
    lines.append("")
    lines.append("    SCORING_STREAM: {")
    lines.append(f"      OFFSET: {scoring_offset + sc_stream_field['offset']},")
    lines.append(f"      SIZE: {sc_stream_field['size']},")
    lines.append("    },")
    lines.append("  },")
    lines.append("")

    # TELEMETRY
    lines.append("  TELEMETRY: {")
    lines.append(f"    OFFSET: {telemetry_offset},")
    lines.append(f"    SIZE: {telem_data['size']},")
    for f in telem_data['fields']:
        abs_off = telemetry_offset + f['offset']
        if f['name'] == 'telemInfo':
            lines.append(
                f"    TELEM_INFO: {{ OFFSET: {abs_off}, STRIDE: {ctx['vehicle_telemetry_stride']}, MAX: 104 }},"
            )
        elif f['name'] == 'activeVehicles':
            lines.append(f"    ACTIVE_VEHICLES: {abs_off},")
        elif f['name'] == 'playerVehicleIdx':
            lines.append(f"    PLAYER_VEHICLE_IDX: {abs_off},")
        elif f['name'] == 'playerHasVehicle':
            lines.append(f"    PLAYER_HAS_VEHICLE: {abs_off},")
    lines.append("  },")
    lines.append("")

    # VEHICLE_TELEMETRY per-slot offsets
    lines.append("  VEHICLE_TELEMETRY: {")
    lines.append(f"    SIZE: {vt['size']},")
    for f in vt['fields']:
        if f['name'] in VT_MAP:
            key = VT_MAP[f['name']]
            if f['type'] == 'struct':
                lines.append(f"    {key}: {{ OFFSET: {f['offset']}, SIZE: {f['size']} }},")
            elif f['type'] == 'array' and 'nested' in f:
                lines.append(f"    {key}: {{ OFFSET: {f['offset']}, STRIDE: {f['stride']}, LENGTH: {f['length']} }},")
            else:
                lines.append(f"    {key}: {f['offset']},")
    lines.append("  },")
    lines.append("")

    # VEHICLE_SCORING per-slot offsets
    lines.append("  VEHICLE_SCORING: {")
    lines.append(f"    SIZE: {vs['size']},")
    for f in vs['fields']:
        if f['name'] in VS_MAP:
            key = VS_MAP[f['name']]
            if f['type'] == 'struct':
                lines.append(f"    {key}: {{ OFFSET: {f['offset']}, SIZE: {f['size']} }},")
            else:
                lines.append(f"    {key}: {f['offset']},")
    lines.append("  },")
    lines.append("")

    # WHEEL per-slot offsets
    lines.append("  WHEEL: {")
    lines.append(f"    SIZE: {wh['size']},")
    for f in wh['fields']:
        if f['name'] in WH_MAP:
            key = WH_MAP[f['name']]
            if f['type'] == 'array':
                lines.append(f"    {key}: {{ OFFSET: {f['offset']}, SIZE: {f['size']} }},")
            else:
                lines.append(f"    {key}: {f['offset']},")
    lines.append("  },")
    lines.append("")

    # VECT3
    lines.append("  VECT3: {")
    for f in vect3['fields']:
        lines.append(f"    {f['name'].upper()}: {f['offset']},")
    lines.append(f"    SIZE: {vect3['size']},")
    lines.append("  },")
    lines.append("")

    lines.append("} as const;")
    lines.append("")

    # Assertions
    lines.append("// ── Size assertions ──")
    lines.append(f"// LMUObjectOut: {obj_out_size} bytes")
    lines.append(f"// LMUVehicleTelemetry: {vt['size']} bytes per slot")
    lines.append(f"// LMUVehicleScoring: {vs['size']} bytes per slot")
    lines.append(f"// LMUWheel: {wh['size']} bytes per wheel")
    lines.append(f"// LMUScoringInfo: {sc_info['size']} bytes")

    return '\n'.join(lines)


def _go_const_block(lines, const_name, pairs):
    lines.append("const (")
    width = max(len(name) for name, _ in pairs) if pairs else 0
    for name, value in pairs:
        lines.append(f"\t{name:<{width}} = {value}")
    lines.append(")")
    lines.append("")


def generate_go(ctx):
    walked = ctx['walked']
    sc_info = walked['LMUScoringInfo']
    vt = walked['LMUVehicleTelemetry']
    vs = walked['LMUVehicleScoring']
    wh = walked['LMUWheel']
    telem = ctx['telemetry_fields']

    lines = [
        "// Code generated by tools/generate-lmu-offsets.py; DO NOT EDIT.",
        "// Regenerate: python tools/generate-lmu-offsets.py",
        "",
        "package lmu",
        "",
        f"const ObjectOutSize = {ctx['obj_out_size']}",
        "",
    ]

    _go_const_block(lines, "telemetry", [
        ("telemetryTelemStride", ctx['vehicle_telemetry_stride']),
        ("telemetryTelemOffset", ctx['telem_info_abs']),
        ("vehicleScoringOffset", ctx['vehicle_scoring_abs']),
        ("vehicleScoringStride", ctx['vehicle_scoring_stride']),
        ("scoringInfoOffset", ctx['scoring_info_abs']),
        ("scoringInfoSize", ctx['scoring_info_size']),
    ])

    _go_const_block(lines, "telemetryPlayer", [
        ("telemetryPlayerVehicleIdx", telem['playerVehicleIdx']),
        ("telemetryPlayerHasVehicle", telem['playerHasVehicle']),
    ])

    vt_pairs = []
    for field_name, go_name in GO_VT_MAP.items():
        vt_pairs.append((go_name, _field_offset(vt, field_name)))
    _go_const_block(lines, "vehicleTelemetry", vt_pairs)

    scoring_pairs = []
    for field_name, go_name in GO_SCORING_MAP.items():
        scoring_pairs.append((go_name, ctx['scoring_info_abs'] + _field_offset(sc_info, field_name)))
    _go_const_block(lines, "scoring", scoring_pairs)

    vs_pairs = []
    for field_name, go_name in GO_VS_MAP.items():
        vs_pairs.append((go_name, _field_offset(vs, field_name)))
    _go_const_block(lines, "vehicleScoring", vs_pairs)

    lines.extend([
        "// Size assertions (from pyLMUSharedMemory ctypes layout):",
        f"// LMUObjectOut: {ctx['obj_out_size']} bytes",
        f"// LMUVehicleTelemetry: {vt['size']} bytes per slot",
        f"// LMUVehicleScoring: {vs['size']} bytes per slot",
        f"// LMUWheel: {wh['size']} bytes per wheel",
        f"// LMUScoringInfo: {sc_info['size']} bytes",
        "",
    ])

    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(description='Generate LMU offset constants')
    parser.add_argument('--output', default='packages/sim-core/src/lmu-offsets.ts')
    parser.add_argument(
        '--go-output',
        default='vantare-v2/internal/telemetry/lmu/offsets.go',
        help='Go offsets output path (pass empty string to skip)',
    )
    args = parser.parse_args()

    ctx = compute_context()
    ts_content = generate_ts(ctx)

    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ts_path = args.output if os.path.isabs(args.output) else os.path.join(repo_root, args.output)
    with open(ts_path, 'w', encoding='utf-8') as f:
        f.write(ts_content)

    print(f"Generated {ts_path}")

    if args.go_output:
        go_path = args.go_output if os.path.isabs(args.go_output) else os.path.join(repo_root, args.go_output)
        go_content = generate_go(ctx)
        os.makedirs(os.path.dirname(go_path), exist_ok=True)
        with open(go_path, 'w', encoding='utf-8') as f:
            f.write(go_content)
        print(f"Generated {go_path}")

    print(f"LMU_OBJECT_OUT_SIZE = {ctx['obj_out_size']} bytes")
    print("Done!")


if __name__ == '__main__':
    main()
