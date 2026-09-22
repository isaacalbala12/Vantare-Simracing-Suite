#!/usr/bin/env python3
"""Check T0a documentary integrity against pinned Git objects, never product parity."""
import argparse
import copy
import hashlib
import json
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

COMMIT = "4c3865e09a347d4c806c0bc0cd66aae335fbc610"
RULES = set("REL SAMPLE STATE PRECISION CADENCE SELECT SILENCE END AUTO QUEUE LAPPING LAPMODE QUERY STATUS CORNERS".split())
SOURCE_PATHS = {
    "timings": "Events/Timings.cs", "abstract": "Events/AbstractEvent.cs",
    "mapper": "GameState/GameStateMapper.cs", "state": "GameState/GameStateData.cs",
    "rf2": "RF2/RF2GameStateMapper.cs", "track": "TrackData/TrackData.cs",
    "opponents": "Events/Opponents.cs", "opponent_messages": "Events/OpponentMessages.cs",
    "actions": "Events/CommonActions.cs", "queue": "QueuedMessage.cs",
    "audio": "Audio/AudioPlayer.cs", "moderator": "Audio/PlaybackModerator.cs",
    "sound_metadata": "Audio/SoundMetadata.cs", "global": "GameState/GlobalBehaviourSettings.cs",
    "time": "NumberProcessing/TimeSpanWrapper.cs", "numbers": "NumberProcessing/NumberReader.cs",
    "number_factory": "NumberProcessing/NumberReaderFactory.cs", "en": "NumberReaderEn.cs",
    "it": "NumberReaderIt.cs", "it2": "NumberReaderIt2.cs", "pt_br": "NumberReaderPtBr.cs",
    "settings": "Properties/Settings.settings", "chief": "CrewChief.cs",
}
REQUIRED_SETTINGS = set("""
revert_to_legacy_version_of_refactored_code frequency_of_gap_ahead_reports
frequency_of_gap_behind_reports frequency_of_gap_behind_on_track_reports
enable_gap_messages gap_message_randomness just_the_facts always_report_time_in_hundredths
realistic_mode speak_only_when_spoken_to force_single_class enable_driver_names
tts_setting_listprop opponents_number_after_name enable_delayed_messages_on_hardparts
allow_important_messages_even_when_silenced pause_between_messages update_interval
priortise_messages_depending_on_situation reject_message_when_talking
sre_respond_while_channel_still_open pace_notes_mute_all_messages interrupt_setting_listprop
insert_beep_out_between_spotter_and_chief insert_beep_in_between_spotter_and_chief
enable_radio_beeps use_alternate_beeps use_naudio naudio_output_interface_listprop
chief_name spotter_name cache_sounds enable_breath_in enable_lmu_pit_lane_approach_heuristics
enable_lmu_pit_state_during_fcy auto_is_oval
""".split())
STATES = {"inventariado", "bloqueado por señal", "pendiente de decisión"}
COMMON_COMMANDS = set("""
TELL_ME_THE_GAPS DONT_TELL_ME_THE_GAPS PLAY_CORNER_NAMES KEEP_QUIET
ENABLE_MANUAL_FORMATION_LAP DISABLE_MANUAL_FORMATION_LAP KEEP_ME_INFORMED
TALK_TO_ME_ANYWHERE DONT_TALK_IN_THE_CORNERS
""".split())


def require(condition, message):
    if not condition:
        raise ValueError(message)


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, f"Clave JSON duplicada: {key}")
        result[key] = value
    return result


def indexed(items, field):
    result = {}
    for item in items:
        key = item[field]
        require(key not in result, f"Identificador duplicado: {key}")
        result[key] = item
    return result


def git_sources(repository):
    """The working tree and its mutable files are never read."""
    return {
        key: subprocess.check_output(
            ["git", "-C", str(repository), "show", f"{COMMIT}:CrewChiefV4/{path}"],
            stderr=subprocess.PIPE,
        )
        for key, path in SOURCE_PATHS.items()
    }


def validate(doc, raw):
    require(doc["schema_version"] == 1, "Versión de schema")
    require(doc["reference"]["commit"] == COMMIT, "Commit de referencia distinto")
    evidence = doc["evidence"]
    for gate in ("crewchief_execution", "replay", "online_voice", "offline_fallback", "lmu"):
        require(evidence[gate] == "NOT_RUN", f"T0a no acredita {gate}")
    require(evidence["t0b_started"] is False, "T0b no pertenece a este inventario")
    require(evidence["human_review"] == "pendiente", "Este candidato no aprueba su propia review")
    require(evidence["fixture_hash"] is None, "No hay fixture T0b en T0a")

    sources, anchors = doc["sources"], doc["anchors"]
    require(set(sources) == set(SOURCE_PATHS), "Fuentes mínimas/completas distintas")
    for key, path in SOURCE_PATHS.items():
        source, data = sources[key], raw[key]
        require(source["path"] == "CrewChiefV4/" + path, f"Ruta incorrecta: {key}")
        blob = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
        require(source["blob"] == blob, f"Blob distinto: {key}")
        require(source["sha256"] == hashlib.sha256(data).hexdigest(), f"SHA-256 distinto: {key}")
        require(source["lines"] == len(data.splitlines()), f"Líneas distintas: {key}")
    for key, anchor in anchors.items():
        source = anchor["source"]
        require(source in raw, f"Fuente desconocida: {key}")
        lines = raw[source].splitlines(keepends=True)
        start, end = anchor["start"], anchor["end"]
        require(type(start) is int and type(end) is int and 1 <= start <= end <= len(lines), f"Rango inválido: {key}")
        digest = hashlib.sha256(b"".join(lines[start - 1:end])).hexdigest()
        require(anchor["sha256"] == digest, f"Hash de rango distinto: {key}")

    def refs(refs_to_check, context):
        require(bool(refs_to_check), f"Falta fuente: {context}")
        require(all(ref in anchors for ref in refs_to_check), f"Ancla desconocida: {context}")

    settings = indexed(doc["settings"], "key")
    require(set(settings) == REQUIRED_SETTINGS, "Opciones aplicables incompletas/distintas")
    defaults = {
        node.attrib["Name"]: node
        for node in ET.fromstring(raw["settings"].decode("utf-8-sig")).findall(".//{*}Setting")
    }
    for key, setting in settings.items():
        node = defaults[key]
        require(setting["type"] == node.attrib["Type"], f"Tipo de opción distinto: {key}")
        require(setting["default"] == (node.find("{*}Value").text or ""), f"Default distinto: {key}")
        require(bool(setting["effect"]) and bool(setting["category"]), f"Opción sin efecto: {key}")
        refs([setting["source"]], key)
        anchor = anchors[setting["source"]]
        require(anchor["source"] == "settings", f"Default sin fuente Settings: {key}")
        text = b"".join(raw["settings"].splitlines(keepends=True)[anchor["start"] - 1:anchor["end"]]).decode("utf-8-sig")
        require(f'Name="{key}"' in text, f"Rango no contiene opción: {key}")
        require(bool(setting["uses"]), f"Falta consumidor: {key}")
        for use in setting["uses"]:
            line = raw[use["source"]].decode("utf-8-sig").splitlines()[use["line"] - 1]
            require(re.search(r'get(?:Boolean|Int|Float|String)\("' + re.escape(key) + r'"\)', line), f"Consumidor incorrecto: {key}")
    direct = set(re.findall(r'get(?:Boolean|Int|Float|String)\("([^"]+)"\)', raw["timings"].decode("utf-8-sig")))
    require(direct <= set(settings), "Falta opción directa de Timings")

    rules = indexed(doc["rules"], "id")
    require(set(rules) == {"TIM-" + rule for rule in RULES}, "Las quince reglas son obligatorias")
    anomalies = indexed(doc["anomalies"], "id")
    require(set(anomalies) == {f"A{i}" for i in range(1, 10)}, "Registro de anomalías incompleto/distinto")
    for key, rule in rules.items():
        require(rule["status"] in STATES, f"Estado no documental: {key}")
        refs(rule["sources"], key)
        require(all(setting in settings for setting in rule["settings"]), f"Opción desconocida: {key}")
        for field in ("title", "signals", "behavior", "boundaries", "temporal", "evidence"):
            require(bool(rule[field]), f"Falta {field}: {key}")
        require(rule["queue"] in doc["delivery_profiles"], f"Perfil de cola desconocido: {key}")
        require(all(item in anomalies for item in rule["anomalies"]), f"Anomalía desconocida: {key}")
        if rule["anomalies"]:
            require(rule["status"] != "inventariado", f"Decisión pendiente ocultada: {key}")
    for key, anomaly in anomalies.items():
        refs(anomaly["sources"], key)
        require(anomaly["classification"] == "defecto candidato", f"Clasificación no demostrada: {key}")
        require(anomaly["approved"] is False and anomaly["decision"] == "pendiente de revisión humana", f"Desviación autoaprobada: {key}")
        for field in ("evidence_level", "reproduction", "impact", "proposed_decision"):
            require(bool(anomaly[field]), f"Falta {field}: {key}")
        require(bool(anomaly["rules"]), f"Anomalía sin reglas: {key}")
        for rule in anomaly["rules"]:
            require(rule in rules and key in rules[rule]["anomalies"], f"Anomalía sin enlace inverso: {key}/{rule}")
    commands_anchor = anchors["commands"]
    command_lines = raw["timings"].splitlines(keepends=True)[commands_anchor["start"] - 1:commands_anchor["end"]]
    commands = re.findall(r"SpeechCommands\.ID\.(\w+)", b"".join(command_lines).decode())
    require(doc["commands"]["timings"] == commands, "Comandos Timings incompletos o alterados")
    common = doc["commands"]["common"]
    require(len(common) == len(COMMON_COMMANDS) and set(common) == COMMON_COMMANDS, "Controles comunes incompletos")
    require(set(doc["commands"]["control_effects"]) == COMMON_COMMANDS, "Controles sin efecto documentado")
    action_cases = set(re.findall(r"case SpeechCommands\.ID\.(\w+)", raw["actions"].decode("utf-8-sig")))
    require(COMMON_COMMANDS <= action_cases, "Control sin ruta en CommonActions")
    refs(doc["commands"]["sources"], "commands")
    require(doc["delivery_profiles"]["query"]["cc_priority"] == 5, "Consulta usa DEFAULT_PRIORITY=5")
    require(doc["review_gate"]["required"] and doc["signal_policy"] and doc["voice_contract"], "Gates y límites obligatorios")


def negative_checks(doc, raw):
    """Corrupt the evidence, not the product; every specimen must be rejected."""
    mutations = [
        ("regla ausente", lambda d: d["rules"].pop()),
        ("regla duplicada", lambda d: d["rules"].append(copy.deepcopy(d["rules"][0]))),
        ("fuente ausente", lambda d: d["sources"].pop("mapper")),
        ("blob alterado", lambda d: d["sources"]["timings"].update(blob="0" * 40)),
        ("rango desplazado", lambda d: d["anchors"]["selection"].update(start=645)),
        ("default falso", lambda d: d["settings"][0].update(default="True")),
        ("opción ausente", lambda d: d["settings"].pop()),
        ("anomalía autoaprobada", lambda d: d["anomalies"][0].update(approved=True)),
        ("PASS LMU sin evidencia", lambda d: d["evidence"].update(lmu="PASS")),
        ("comando ausente", lambda d: d["commands"]["timings"].pop()),
        ("control común ausente", lambda d: d["commands"]["common"].pop()),
    ]
    for name, mutate in mutations:
        specimen = copy.deepcopy(doc)
        mutate(specimen)
        try:
            validate(specimen, raw)
        except ValueError:
            continue
        raise ValueError(f"El control negativo fue aceptado: {name}")
    return len(mutations)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--crewchief-repo", type=Path, required=True)
    parser.add_argument("--ledger", type=Path, default=Path(__file__).with_name("ledger.json"))
    parser.add_argument("--self-test", action="store_true", help="Probar rechazos documentales después de validar el ledger")
    args = parser.parse_args()
    try:
        doc = json.loads(args.ledger.read_text(), object_pairs_hook=unique_object)
        raw = git_sources(args.crewchief_repo)
        validate(doc, raw)
        negatives = negative_checks(doc, raw) if args.self_test else 0
    except (ValueError, KeyError, TypeError, IndexError, OSError, ET.ParseError, subprocess.CalledProcessError) as error:
        print(f"FAIL documental: {error}", file=sys.stderr)
        return 1
    print(f"PASS documental: {len(doc['rules'])} reglas, {len(raw)} fuentes, "
          f"{len(doc['settings'])} opciones, {len(doc['anomalies'])} anomalías; "
          f"{negatives} controles negativos. Paridad/replay/voz/LMU: NOT_RUN.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
