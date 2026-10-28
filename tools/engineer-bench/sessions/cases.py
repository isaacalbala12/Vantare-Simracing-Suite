"""Cases read the real synthetic wire sequence; the model receives compact context."""
import copy
import hashlib
import json
from .generate import TRACKS, build_session, variants, current, player_car
from .project import project, fuel_intent
QUALITIES = ['reliable', 'estimated', 'stale', 'unavailable']

def _property(typ):
    return {'type': [typ, 'null']}

def output_schema(kind):
    if kind.startswith('radio'):
        return None
    props = {'text': {'type': 'string'}, 'source_epoch': {'type': 'integer'}, 'source_sequence': {'type': 'integer'}}
    if kind in ('pilot_fuel', 'temporal_stale', 'temporal_epoch', 'raw_current_dto'):
        props.update(fuel_l=_property('number'), quality={'type': 'string', 'enum': QUALITIES})
    elif kind == 'pilot_gap':
        props.update(gap_value=_property('number'),
            gap_unit={'type': ['string',
                    'null'],
                'enum': ['s',
                    'laps',
                    None]},
            quality={'type': 'string',
                'enum': QUALITIES})
    elif kind == 'pilot_pit':
        props.update(pit_in_laps=_property('integer'),
            plan_status={'type': 'string',
                'enum': ['unavailable',
                    'finish_without_planned_stop',
                    'conditional_fuel_window']},
            requires_confirmation={'type': 'boolean'})
    elif kind == 'summary':
        props.update(measured_laps={'type': 'integer'},
            mean_lap_s=_property('number'),
            mean_consumption_l=_property('number'),
            event_kinds={'type': 'array',
                'items': {'type': 'string'}})
    return {'type': 'object', 'properties': props, 'required': list(props), 'additionalProperties': False}

def expected(context, kind):
    c = context['current']
    r = context['recent']
    result = {'source_epoch': c['epoch'], 'source_sequence': c['sequence']}
    if kind in ('pilot_fuel', 'temporal_stale', 'temporal_epoch', 'raw_current_dto'):
        result.update(fuel_l=c.get('fuel_l',
                {'value': None})['value'],
            quality=c.get('fuel_l',
                {'quality': 'unavailable'})['quality'])
    elif kind == 'pilot_gap':
        g = c['gap_classification_ahead']
        result.update(gap_value=g['value'], gap_unit=g['unit'], quality=g['quality'])
    elif kind == 'pilot_pit':
        plan = context['code_policy']['proposed_pit_plan']
        result.update(pit_in_laps=plan['pit_in_laps'], plan_status=plan['status'], requires_confirmation=True)
    elif kind == 'summary':
        result.update(measured_laps=r['consumption_l_per_lap']['measured_laps'],
            mean_lap_s=r['pace_s']['mean'],
            mean_consumption_l=r['consumption_l_per_lap']['mean'],
            event_kinds=sorted(set((e['event'] for e in r['events']))))
    return result

def task_text(case):
    es = case['locale'] == 'es'
    kind = case['kind']
    if kind == 'radio_fuel':
        return 'El código ha seleccionado ' + case['code_intent'] + '. Redacta una frase corta de radio en español. Incluye el valor numérico actual de combustible en litros. No JSON, traducción, causas ni acciones.' if es else 'Code selected ' + case['code_intent'] + '. Write one short English radio sentence. Include the current numeric fuel value in litres. No JSON, translation, causes or actions.'
    if kind == 'radio_lap':
        return 'El código confirmó laps.completed en esta foto. Anuncia en una frase española el número de vueltas completadas, no el de la vuelta en curso. No añadas datos ni acciones.' if es else 'Code confirmed laps.completed in this photo. Announce the completed-lap number in one English sentence, not the ongoing lap. Add no other facts or actions.'
    questions = {'pilot_fuel': ('¿Cuánta gasolina me queda? Usa el combustible actual, no el primer dato del historial.',
            'How much fuel do I have left? Use current fuel, not the first historical reading.'),
        'pilot_gap': ('¿A cuánto está el de delante? El código eligió intervalo de clasificación, no ritmo de vuelta ni distancia espacial.',
            'How far ahead is the next car? Code selected the classification interval, not lap pace or spatial distance.'),
        'pilot_pit': ('¿Cuándo paro? Comunica solo el plan condicional calculado por código; no calcules otra estrategia ni confirmes una acción o permiso de boxes.',
            'When should I pit? Communicate only the conditional code-calculated plan; do not calculate another strategy or confirm an action or pit permission.'),
        'summary': ('Resume este tramo de sesión con los agregados de código y eventos relevantes. No recalcules estrategia ni añadas causas o previsiones.',
            'Summarize this session window using code aggregates and relevant events. Do not recalculate strategy or add causes or forecasts.'),
        'temporal_stale': ('¿Cuánta gasolina tengo ahora? La calidad y el estado actual mandan; un dato obsoleto no es combustible actual.',
            'How much fuel do I have now? Current quality and source state govern; stale fuel is not current fuel.'),
        'temporal_epoch': ('¿Cuánta gasolina tengo ahora? Usa la época y foto actuales; un sequence mayor de otra época no es más reciente.',
            'How much fuel do I have now? Use the current epoch and photo; a larger sequence in a different epoch is not newer.'),
        'raw_current_dto': ('Control de formato: ¿cuánta gasolina queda en esta única foto SnapshotDto v11 actual? Localiza state.player y su calidad.',
            'Format control: how much fuel remains in this single current SnapshotDto v11? Locate state.player and its quality.')}
    return questions[kind][0 if es else 1] + (' Devuelve el objeto del esquema, con text en español.' if es else ' Return the schema object, with text in English.')

def messages(case):
    system = 'Eres el Ingeniero de carrera. Estos datos son sintéticos. El código fija intención, cifras, prioridad, estrategia y acción. No inventes datos, causas, pronósticos o confirmaciones. Conserva incertidumbre y unidades. La radio crítica es local, ajena al LLM.' if case['locale'] == 'es' else 'You are the race engineer. These data are synthetic. Code owns intent, figures, priority, strategy and action. Invent no data, causes, forecasts or confirmations. Preserve uncertainty and units. Critical radio stays local outside the LLM.'
    source = case['raw_snapshot'] if case['kind'] == 'raw_current_dto' else case['context']
    heading = ('Foto cruda sintética SnapshotDto v11:\n' if case['locale'] == 'es' else 'Synthetic current raw SnapshotDto v11:\n') if case['kind'] == 'raw_current_dto' else 'Propuesta de contexto compacto del Ingeniero, derivado por código:\n' if case['locale'] == 'es' else 'Proposed compact Engineer context, derived by code:\n'
    return [{'role': 'system',
            'content': system},
        {'role': 'user',
            'content': heading + json.dumps(source,
                ensure_ascii=False,
                separators=(',',
                    ':'))},
        {'role': 'user',
            'content': task_text(case)}]

def build_cases(seed=124):
    cases = []
    for track in TRACKS:
        for cls in ('LMGT3', 'Hypercar'):
            for session_kind in ('practice', 'qualifying', 'race'):
                session = build_session(seed, track, cls, session_kind)
                anchor = 62 if session_kind == 'qualifying' else 70
                history = session['snapshots'][:anchor + 1]
                source_slug = f"{track.lower().replace(' ', '-')}-{cls.lower()}-{session_kind}"
                for n in (5, 20, 60):
                    base = project(history, n)
                    altered = variants(session | {'snapshots': history})
                    contexts = {'temporal_stale': project(altered[0]['snapshots'],
                            n),
                        'temporal_epoch': project(altered[1]['snapshots'],
                            n)}
                    for locale in ('es', 'en'):
                        for kind in ('radio_fuel',
                            'radio_lap',
                            'pilot_fuel',
                            'pilot_gap',
                            'pilot_pit',
                            'summary',
                            'temporal_stale',
                            'temporal_epoch'):
                            context = contexts.get(kind, base)
                            intent = fuel_intent(history[-1]) if kind == 'radio_fuel' else 'laps.completed' if kind == 'radio_lap' else None
                            case = {'id': f'{source_slug}-{kind}-{locale}-h{n}',
                                'synthetic': True,
                                'kind': kind,
                                'locale': locale,
                                'source_session': source_slug,
                                'source_history_count': n,
                                'source_anchor_index': anchor,
                                'source_variant': kind if kind.startswith('temporal') else 'base',
                                'source_cursor': [context['current']['epoch'],
                                    context['current']['sequence']],
                                'context': context,
                                'code_intent': intent,
                                'priority': 1 if kind == 'radio_fuel' else 0,
                                'max_tokens': 128 if kind.startswith('radio') else 512,
                                'max_words': 32 if kind.startswith('radio') else 90,
                                'schema': output_schema(kind)}
                            if kind.startswith('radio'):
                                case['code_decision_origin'] = 'synthetic baseline attachment plus matching lap-completed fact; P0 stays local'
                            if kind == 'radio_fuel':
                                case['gold'] = {'required_number': context['current']['fuel_l']['value'],
                                    'semantic_family': 'fuel'}
                            elif kind == 'radio_lap':
                                case['gold'] = {'required_number': context['current']['completed_laps']['value'],
                                    'semantic_family': 'lap_completed'}
                            else:
                                case['gold'] = expected(context, kind)
                            case['projection_sha256'] = hashlib.sha256(json.dumps(context,
                                    sort_keys=True,
                                    separators=(',',
                                        ':')).encode()).hexdigest()
                            cases.append(case)
                for locale in ('es', 'en'):
                    context = project(history, 5)
                    kind = 'raw_current_dto'
                    cases.append({'id': f'{source_slug}-raw-current-{locale}',
                            'synthetic': True,
                            'kind': kind,
                            'locale': locale,
                            'source_session': source_slug,
                            'source_history_count': 1,
                            'source_anchor_index': anchor,
                            'source_cursor': [history[-1]['epoch'],
                                history[-1]['sequence']],
                            'raw_snapshot': copy.deepcopy(history[-1]),
                            'gold': expected(context,
                                kind),
                            'schema': output_schema(kind),
                            'max_tokens': 512,
                            'max_words': 90})
    return cases
