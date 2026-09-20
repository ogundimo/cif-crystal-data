import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest

import numpy as np
import rietx as rx

ROOT = Path(__file__).resolve().parents[1]
ENGINE = ROOT / 'engine' / 'refinement.py'
cif='''data_nacl
_chemical_formula_sum 'Na Cl'
_cell_length_a 5.64
_cell_length_b 5.64
_cell_length_c 5.64
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 90
_space_group_name_H-M_alt 'F m -3 m'
_space_group_IT_number 225
loop_
_atom_site_label
_atom_site_type_symbol
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
_atom_site_occupancy
_atom_site_U_iso_or_equiv
Na1 Na 0 0 0 1 0.01
Cl1 Cl 0.5 0.5 0.5 1 0.01
'''

class EngineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='cif-rietx-test-')
        cls.folder = Path(cls.temp.name)
        path = cls.folder / 'source.cif'
        path.write_text(cif)
        structure = rx.Structure.from_cif(str(path))
        structure.phases[0].scale.value = .01
        instrument = rx.Instrument.debye_scherrer(1.5406, polarization=.5)
        instrument.profile.w.value = .01
        instrument.profile.x.value = .01
        instrument.background.coefficients[0].value = 20
        x = np.arange(10, 80, .01)
        y = rx.Refinement(structure, instrument).predict(x)
        cls.points = np.column_stack((x, y)).tolist()
        cls.settings = dict(method='lebail', spaceGroup='F m -3 m',
            cell=[5.645]*3+[90]*3, wavelength=1.5406, geometry='debye_scherrer',
            polarization=.5, radius=None, zero=0, profile=dict(u=0,v=0,w=.01,x=.01,y=0),
            shape='tchz_pv', backgroundTerms=3, maxIterations=100, maxPasses=8,
            extractionCycles=10, refineCell=True, refineProfile=True, refineZero=False,
            refineCoordinates=False, refineBiso=False, refineOccupancy=False,
            range=[10,79.96], parameterEdits={})

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def worker(self, name, settings=None, resume=None, cancel=False, points=None):
        base = self.folder / name
        request = dict(outputBase=str(base), sourceName='experimental.xy',
                       settings=settings or self.settings, cifText=cif,
                       points=points or self.points, resumePath=resume)
        path = self.folder / (name+'.request.json')
        path.write_text(json.dumps(request))
        env = {**os.environ, 'PYTHONIOENCODING':'utf-8', 'OPENBLAS_NUM_THREADS':'1',
               'OMP_NUM_THREADS':'1', 'NUMBA_CACHE_DIR':str(ROOT/'.tools'/'rietx-test-cache')}
        p = subprocess.Popen([sys.executable, '-s', '-u', str(ENGINE), str(path)],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, encoding='utf-8', env=env)
        frames = []
        sent = False
        for line in p.stdout:
            if line.startswith('CIF_PROGRESS '):
                event=json.loads(line[13:])
                if 'snapshot' in event:
                    frames.append(event['snapshot'])
                    if cancel and not sent:
                        p.stdin.write('cancel\n');p.stdin.flush();sent=True
        err=p.stderr.read()
        p.wait(timeout=120)
        p.stdin.close(); p.stdout.close(); p.stderr.close()
        self.assertEqual(p.returncode,0,err)
        result=json.loads(Path(str(base)+'.result.json').read_text())
        checkpoint=json.loads(Path(str(base)+'.checkpoint.json').read_text())
        rx.RefinementState.model_validate(checkpoint['state']) if hasattr(rx,'RefinementState') else None
        self.assertEqual(checkpoint['points'],self.points)
        self.assertTrue(frames, 'No actual intermediate curves')
        self.assertTrue(all(np.isfinite(f['rwp']) for f in frames))
        return result,checkpoint,frames

    def test_all_methods_and_resume(self):
        for method in ('lebail','pawley','rietveld'):
            with self.subTest(method=method):
                settings={**copy.deepcopy(self.settings),'method':method}
                start=time.monotonic()
                result,checkpoint,frames=self.worker(method,settings)
                print(method, 'Rwp',result['rwp'],'seconds',round(time.monotonic()-start,2),flush=True)
                self.assertLess(result['rwp'],.1)
                self.assertAlmostEqual(result['cell']['a'],5.64,places=4)
                self.assertGreater(len(frames),1)
                self.assertTrue(any(f['profile']!=frames[0]['profile'] for f in frames[1:]))
                if method!='rietveld':self.assertTrue(checkpoint['state']['reflections'])
                modified=checkpoint['settings'];modified['refineCell']=False;modified['refineProfile']=False
                modified['backgroundTerms']=4
                resumed,cp,_=self.worker(method+'-resumed',modified,str(self.folder/(method+'.checkpoint.json')))
                self.assertLess(resumed['rwp'],.1)
                self.assertAlmostEqual(resumed['cell']['a'],result['cell']['a'],places=10)
                self.assertEqual(len(cp['state']['instrument']['background']['coefficients']),4)
        self.assertEqual((self.folder/'source.cif').read_text(),cif)

    def test_unchanged_resume_preserves_fit(self):
        for method in ('lebail', 'pawley', 'rietveld'):
            with self.subTest(method=method):
                settings={**copy.deepcopy(self.settings), 'method':method, 'maxIterations':1, 'maxPasses':2,
                          'cell':[5.7]*3+[90]*3, 'profile':dict(u=0,v=0,w=.12,x=.04,y=0)}
                before, checkpoint, _ = self.worker('continuity-'+method, settings)
                after, _, frames = self.worker('continuity-'+method+'-resume', checkpoint['settings'],
                    str(self.folder/('continuity-'+method+'.checkpoint.json')))
                print('resume continuity',method,'before',before['rwp'],'first',frames[0]['rwp'],'after',after['rwp'],flush=True)
                self.assertLessEqual(frames[0]['rwp'],before['rwp']+0.1)
                self.assertLessEqual(after['rwp'],before['rwp']+0.1)

    def test_cancel_and_resume(self):
        result,checkpoint,_=self.worker('cancel',cancel=True)
        self.assertEqual(result['status'],'cancelled')
        resumed,_,_=self.worker('cancel-resumed',checkpoint['settings'],str(self.folder/'cancel.checkpoint.json'))
        self.assertLess(resumed['rwp'],.1)

    def test_iteration_limit_retains_checkpoint(self):
        settings={**copy.deepcopy(self.settings),'maxIterations':1,'maxPasses':1}
        result,checkpoint,_=self.worker('limited',settings)
        self.assertFalse(result['converged'])
        settings=checkpoint['settings'];settings['maxIterations']=100;settings['maxPasses']=8
        result,_,_=self.worker('limited-resumed',settings,str(self.folder/'limited.checkpoint.json'))
        self.assertLess(result['rwp'],.1)

if __name__=='__main__':
    if len(sys.argv)>1 and sys.argv[1]=='--fixture':
        EngineTests.setUpClass()
        Path(sys.argv[2]).write_text(json.dumps(dict(cifText=cif,points=EngineTests.points)),encoding='utf-8')
        EngineTests.tearDownClass()
    else:
        unittest.main(verbosity=2)
