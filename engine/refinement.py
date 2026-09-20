"""Desktop adapter for pinned rietx 1.4.0; no GSAS-II dependency.

The sole private integration seam observes rietx's numpy residual to draw actual
in-stage evaluations (including Pawley's auxiliary intensity vector). It returns
the original residual unchanged. Stage snapshots use rietx's history schemas.
"""
import copy
import hashlib
import importlib
import json
import math
import os
from pathlib import Path
import sys
import threading
import time
import traceback

FORMAT = 'cif-rietx-checkpoint-1'
CELL_KEYS = ('a', 'b', 'c', 'alpha', 'beta', 'gamma')


def emit(message, **data):
    print('CIF_PROGRESS ' + json.dumps({'message': message, **data}, allow_nan=False), flush=True)


def json_safe(value):
    # Pydantic accepts string infinity on input, preserving unbounded parameters.
    if isinstance(value, float) and not math.isfinite(value):
        return 'Infinity' if value > 0 else '-Infinity' if value < 0 else None
    if isinstance(value, dict):
        return {k: json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(v) for v in value]
    return value


def atomic_json(path, value):
    temp = Path(str(path) + '.tmp')
    temp.write_text(json.dumps(json_safe(value), allow_nan=False), encoding='utf-8')
    os.replace(temp, path)


def run(request):
    import numpy as np
    import rietx as rx
    from rietx.schemas.instrument import BackgroundChebyshev, Geometry
    from rietx.schemas.history import RefinementState, NodeAction
    from rietx.history.events import EventStream
    from rietx.strategy.staged import resolve_plan
    from rietx.viz.snapshot import stage_ticks as tick_rows
    from rietx.viz.compare import decimation_index
    lsq = importlib.import_module('rietx.optimize.least_squares')

    base = Path(request['outputBase'])
    settings = copy.deepcopy(request['settings'])
    mode = settings['method']
    if mode not in ('lebail', 'pawley', 'rietveld'):
        raise ValueError('Unknown refinement method')
    checkpoint_path = Path(str(base) + '.checkpoint.json')
    points = request['points']
    data = rx.PatternData(two_theta=[p[0] for p in points], intensity=[p[1] for p in points])
    fingerprint = hashlib.sha256(json.dumps(points, separators=(',', ':')).encode()).hexdigest()
    cif = request['cifText']
    source_warnings = request.get('sourceWarnings', [])
    warnings = list(source_warnings)
    state = None
    if request.get('resumePath'):
        saved = json.loads(Path(request['resumePath']).read_text(encoding='utf-8'))
        if saved.get('format') != FORMAT or saved.get('engineVersion') != rx.__version__:
            raise ValueError('Checkpoint format or rietx version does not match this app.')
        if saved['fingerprint'] != fingerprint or saved['settings']['method'] != mode:
            raise ValueError('Checkpoint method or experimental data differs from this run.')
        state = RefinementState.model_validate(saved['state'])
        structure, instrument = state.structure, state.instrument
        cif = saved['cifText']
        source_warnings = saved.get('sourceWarnings', [])
        warnings = list(source_warnings)
        emit('Restoring fitted parameters and reflection intensities from checkpoint')
    else:
        cif_path = Path(str(base) + '.input.cif')
        cif_path.write_text(cif, encoding='utf-8')
        diagnostics = []
        structure = rx.Structure.from_cif(str(cif_path), diagnostics=diagnostics)
        warnings.extend(d.message for d in diagnostics)
        instrument = rx.Instrument.debye_scherrer(settings['wavelength'], polarization=settings['polarization'])
    if len(structure.phases) != 1:
        raise ValueError('Select a CIF data block containing one phase.')
    phase = structure.phases[0]
    if mode == 'rietveld' and not phase.atoms:
        raise ValueError('Rietveld refinement requires atom positions and species in the selected CIF.')
    if state and phase.space_group != settings['spaceGroup']:
        state.reflections = []
        warnings.append('Space group changed: reflection intensities will be regenerated for the new symmetry.')
    phase.space_group = settings['spaceGroup']
    for key, value in zip(CELL_KEYS, settings['cell']):
        getattr(phase.cell, key).value = value
    # Measurement inputs are explicit. CIF atom sites, occupancies and displacement
    # parameters remain the Rietveld starting structure unless edited below.
    instrument.geometry = Geometry.model_validate({**instrument.geometry.model_dump(), 'kind': settings['geometry'], 'goniometer_radius_mm': settings.get('radius')})
    instrument.source.lines[0].wavelength.value = settings['wavelength']
    instrument.source.polarization.value = settings['polarization']
    instrument.zero_shift.value = settings['zero']
    for key in ('u', 'v', 'w', 'x', 'y'):
        getattr(instrument.profile, key).value = settings['profile'][key]
    instrument.profile.shape = settings['shape']
    terms = settings['backgroundTerms']
    if not state:
        instrument.background = BackgroundChebyshev.with_terms(terms, vary=False)
        instrument.background.coefficients[0].value = float(np.percentile(data.y(), 10))
    elif len(instrument.background.coefficients) != terms:
        old = instrument.background.coefficients
        instrument.background = BackgroundChebyshev.with_terms(terms, vary=False)
        for dst, src in zip(instrument.background.coefficients, old):
            dst.value = src.value
    tree = rx.RefinementTree.for_data(data, path=str(base) + '.history.jsonl', package_version=rx.__version__)
    if state:
        state.structure, state.instrument = structure, instrument
        node = tree.add(parents=[], action=NodeAction(kind='root', name='resumed checkpoint'), state=state)
        ref = rx.Refinement(structure, instrument, history=tree)
        ref.checkout(node.id)
    else:
        ref = rx.Refinement(structure, instrument, history=tree)
        if mode == 'rietveld':
            predicted = np.asarray(ref.predict(data.tt()))
            baseline = instrument.background.coefficients[0].value
            area = float(np.sum(predicted - baseline))
            if area > 0:
                ref.set_values({'phases.0.scale': max(1e-8, float(np.sum(data.y() - baseline)) / area)})
    if settings.get('parameterEdits'):
        ref.set_values(settings['parameterEdits'])
    ref.set_vary('*', False)

    plan_name = {'lebail': 'profile_only', 'pawley': 'pawley_default', 'rietveld': 'mccusker_default'}[mode]
    plan = copy.deepcopy(resolve_plan(plan_name, mode))
    for stage in plan.stages:
        stage.max_iter = settings['maxIterations']
        stage.lebail_cycles = settings['extractionCycles']
        stage.turn_on = [p for p in stage.turn_on
                        if (settings['refineCell'] or '.cell.' not in p)
                        and (settings['refineProfile'] or '.profile.' not in p)
                        and (settings['refineZero'] or p != 'instrument.zero_shift')]
    plan.stages = [stage for stage in plan.stages if stage.turn_on]
    if mode == 'rietveld':
        if settings['refineCoordinates']:
            plan.stages.append(rx.Stage('coordinates', ['phases.*.atoms.*.dof.*'], max_iter=settings['maxIterations']))
        if settings['refineBiso']:
            plan.stages.append(rx.Stage('displacement', ['phases.*.atoms.*.biso', 'phases.*.atoms.*.adp.*'], max_iter=settings['maxIterations']))
        if settings['refineOccupancy']:
            plan.stages.append(rx.Stage('occupancy', ['phases.*.atoms.*.occupancy'], max_iter=settings['maxIterations']))

    token = rx.CancelToken()
    def listen():
        # Avoid a daemon holding Python's buffered stdin lock during shutdown.
        while True:
            raw = os.read(sys.stdin.fileno(), 128)
            if not raw:
                return
            if b'cancel' in raw:
                token.cancel()
    threading.Thread(target=listen, daemon=True).start()
    latest_state = None
    latest_frame = None
    last_draw = 0.0
    stage_name = 'initializing'
    evaluation = 0
    iteration = 0
    metric_context = None

    def state_settings(current):
        s = copy.deepcopy(settings)
        p, i = current.structure.phases[0], current.instrument
        s.update(cell=[getattr(p.cell, k).value for k in CELL_KEYS], spaceGroup=p.space_group,
                 zero=i.zero_shift.value, profile={k: getattr(i.profile, k).value for k in ('u', 'v', 'w', 'x', 'y')},
                 parameterEdits={})
        return s

    def save_checkpoint(current, status):
        nonlocal latest_state
        latest_state = current
        current.mode = mode
        current.two_theta_limits = tuple(settings['range'])
        atomic_json(checkpoint_path, dict(format=FORMAT, engineVersion=rx.__version__, status=status,
                    settings=state_settings(current), state=current.model_dump(mode='json'),
                    points=points, fingerprint=fingerprint, cifText=cif, sourceWarnings=source_warnings, sourceName=request['sourceName']))

    def frame(model, values, calculated):
        nonlocal latest_frame
        background = model.background(values)
        idx = decimation_index(np.asarray(model.tt), [model.y_obs, calculated, background], max_points=1800)
        delta = model.y_obs - calculated
        denom = float(np.sum((model.y_obs / model.sigma) ** 2))
        rwp = 100 * math.sqrt(float(np.sum((delta / model.sigma) ** 2)) / denom) if denom else 0
        ticks = tick_rows(model, values)
        latest_frame = dict(profile=np.column_stack((model.tt[idx], model.y_obs[idx], calculated[idx], background[idx], delta[idx])).tolist(),
                            range=[float(model.tt[0]), float(model.tt[-1])], rwp=rwp,
                            ticks={key: value['two_theta'] for key, value in ticks.items()})
        emit(f'{stage_name} · evaluation {evaluation}', snapshot=latest_frame)

    original_solver = lsq.least_squares
    def observing_solver(fun, x0, **kwargs):
        model, table = metric_context
        original_callback = kwargs.get('callback')
        def callback(intermediate_result):
            nonlocal iteration
            iteration += 1
            residual = np.asarray(intermediate_result.fun)[:len(model.tt)]
            delta = residual * model.sigma
            weighted = float(residual @ residual)
            denominator = float(np.sum((model.y_obs / model.sigma) ** 2))
            absolute = float(np.abs(model.y_obs).sum())
            metric = dict(iteration=iteration,
                          rp=100*float(np.abs(delta).sum())/absolute if absolute else None,
                          rwp=100*math.sqrt(weighted/denominator) if denominator else None,
                          gof=math.sqrt(weighted/max(len(model.tt)-len(intermediate_result.x), 1)))
            emit(f'{stage_name} · iteration {iteration}', metric=metric)
            if original_callback is not None:
                return original_callback(intermediate_result)
        kwargs['callback'] = callback
        return original_solver(fun, x0, **kwargs)

    original_residual = lsq._make_residual
    def observing_residual(model, table):
        nonlocal metric_context
        metric_context = (model, table)
        inner = original_residual(model, table)
        def evaluate(theta):
            nonlocal last_draw, evaluation
            residual = inner(theta)
            evaluation += 1
            now = time.monotonic()
            if now - last_draw >= .15:
                last_draw = now
                values = table.decode(theta[:len(table.free_paths)])
                # rietx's data rows are (observed - calculated) / sigma.
                calculated = model.y_obs - residual[:len(model.tt)] * model.sigma
                frame(model, values, calculated)
            return residual
        return evaluate

    class Stream(EventStream):
        def emit(self, kind, **event):
            nonlocal stage_name
            super().emit(kind, **event)
            if kind == 'stage_start':
                stage_name = event['stage']
                emit(f'{stage_name} · starting')
        def write_snapshot(self, model, table, outcome, name):
            current = ref.snapshot(model=model)
            table.apply_to_models(current.structure, current.instrument)
            current.free_paths = list(table.free_paths)
            save_checkpoint(current, 'running')
            values = table.decode(outcome.theta[:len(table.free_paths)])
            frame(model, values, model.evaluate(values))

    initial_state = ref.snapshot()
    if state:
        initial_state.reflections = state.reflections
    save_checkpoint(initial_state, 'ready')
    lsq._make_residual = observing_residual
    lsq.least_squares = observing_solver
    result = None
    status = 'failed'
    try:
        with Stream(path=str(base) + '.events.jsonl') as stream:
            best_result, best_state, best_node = None, None, None
            for pass_index in range(settings.get('maxPasses', 8) if mode == 'lebail' else 1):
                # fit() recompiles from scratch; checkout queues the saved per-hkl
                # intensities for the next model, in addition to scalar parameters.
                if best_node is not None:
                    ref.checkout(best_node)
                emit(f'Refinement pass {pass_index + 1}')
                candidate = ref.fit(data, mode=mode, plan=plan, two_theta_limits=tuple(settings['range']),
                                   events=stream, cancel=token, telemetry=str(base) + '.runs', label=request['sourceName'])
                previous = best_result.statistics.rwp if best_result else math.inf
                if candidate.statistics.rwp < previous:
                    best_result, best_state, best_node = candidate, ref.snapshot(), candidate.node_id
                if mode != 'lebail' or abs(previous-candidate.statistics.rwp) < max(1e-8, previous*1e-5) and math.isfinite(previous):
                    break
            result = best_result
            if best_node is not None:
                ref.checkout(best_node)
        status = result.status
        if mode == 'lebail' and pass_index + 1 == settings.get('maxPasses', 8) and abs(previous-candidate.statistics.rwp) >= max(1e-8, previous*1e-5):
            status = 'max_iter'
        if any(d.level == 'error' for d in result.diagnostics):
            status = 'diverged'
        save_checkpoint(best_state, status)
    except rx.RefinementCancelled:
        status = 'cancelled'
        save_checkpoint(latest_state, status)
        warnings.append('Cancelled. Checkpoint contains the last completed stage (or initial state if no stage finished).')
    except Exception:
        save_checkpoint(latest_state, 'failed')
        raise
    finally:
        lsq._make_residual = original_residual
        lsq.least_squares = original_solver

    if result:
        atomic_json(Path(str(base) + '.rietx.json'), result.model_dump(mode='json'))
        curve = np.column_stack((result.two_theta, result.y_obs, result.y_calc, result.y_background,
                                np.asarray(result.y_obs) - np.asarray(result.y_calc)))
        np.savetxt(str(base) + '.fit.csv', curve, delimiter=',', header='two_theta,observed,calculated,background,difference', comments='')
        rx.write_refinement_cif(result, ref.fitted_structure, ref.fitted_instrument, str(base) + '.refined.cif')
        Path(str(base) + '.report.txt').write_text(str(result), encoding='utf-8')
        warnings += [f'{d.code}: {d.message}' for d in result.diagnostics]
        # Preserve every sample for zooming and scientific exports. The renderer
        # reduces only the preview and restores detail as the user zooms in.
        latest_frame = dict(profile=curve.tolist(), range=[result.two_theta[0], result.two_theta[-1]],
                            rwp=result.statistics.rwp * 100, ticks=result.ticks)
    current = latest_state
    p = current.structure.phases[0]
    output = dict(status=status, converged=status == 'converged', method=mode, engine='rietx',
                  engineVersion=rx.__version__, settings=state_settings(current), warnings=warnings,
                  cell={k: getattr(p.cell, k).value for k in CELL_KEYS},
                  cellEsd={k: getattr(p.cell, k).stderr for k in CELL_KEYS},
                  parameters=[dict(path=row.path, value=row.value, vary=row.vary,
                                   min=row.lo if math.isfinite(row.lo) else None,
                                   max=row.hi if math.isfinite(row.hi) else None,
                                   editable=not row.locked and row.tie is None and not row.mode_fixed)
                              for row in ref.parameters(mode=mode)],
                  gof=result.statistics.gof if result else None, checkpoint=str(checkpoint_path),
                  outputBase=str(base), **(latest_frame or dict(profile=[], range=settings['range'], rwp=None, ticks={})))
    atomic_json(Path(str(base) + '.result.json'), output)
    emit(f'{status}; checkpoint saved beside the experimental pattern', checkpoint=str(checkpoint_path))


if __name__ == '__main__':
    try:
        if sys.argv[1] == '--check':
            import rietx
            print('RIETX_READY ' + rietx.__version__)
        else:
            request_file = Path(sys.argv[1]).resolve()
            request = json.loads(request_file.read_text(encoding='utf-8-sig'))
            os.chdir(request_file.parent)
            run(request)
    except Exception:
        traceback.print_exc()
        sys.exit(1)
