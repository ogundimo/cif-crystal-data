"""Regenerate original synthetic references with Gemmi 0.7.5 (validation only).

Install gemmi==0.7.5 in an isolated Python environment. No application code is
imported. Gemmi supplies reciprocal geometry, symmetry and structure factors.
Our small powder adapter sums all Friedel pairs, applies the unpolarized powder
Lorentz-polarization factor, and independently samples Gaussian profiles.
"""
import itertools
import json
import math
from pathlib import Path
import gemmi

assert gemmi.__version__ == '0.7.5'
ROOT = Path(__file__).resolve().parent.parent
table = {}
for z in range(1, 99):
    element = gemmi.Element(z)
    table[element.name] = element.it92.get_coefs()
(ROOT / 'src/shared/it92.json').write_text(json.dumps(table, indent=2) + '\n')

# All cells and coordinates below are authored synthetic models, not experiments.
CASES = [
    ('cubic-NaCl', [5.64]*3+[90]*3, 'F m -3 m', [('Na',[0,0,0],1,0.5), ('Cl',[.5,.5,.5],1,.6)], 1.5406),
    ('bcc-Fe', [2.87]*3+[90]*3, 'I m -3 m', [('Fe',[0,0,0],1,0)], 1.5406),
    ('hexagonal-Mg', [3.21,3.21,5.21,90,90,120], 'P 63/m m c', [('Mg',[1/3,2/3,.25],1,.4)], 1.0),
    ('tetragonal-mixed', [4.7,4.7,6.2,90,90,90], 'P 4', [('Ti',[.17,.29,.31],.8,.4),('O',[0,0,0],1,.7)], 1.5406),
    ('monoclinic-mixed', [4.1,5.3,6.7,90,105,90], 'P 1', [('Fe',[0,0,0],1,.5),('Na',[.17,.23,.37],.6,.2)], 1.5406),
    ('triclinic-mixed', [4.1,5.3,6.7,73,82,67], 'P 1', [('Na',[0,0,0],1,.3),('Fe',[.17,.23,.37],.6,.8),('H',[.31,.41,.11],1,.5)], 1.5406),
    ('large-orthorhombic', [17,19,23,90,90,90], 'P 1', [('C',[.11,.23,.37],1,.7),('O',[.31,.43,.57],.7,1.2)], 1.5406),
]
references = []
for name, cell, group, atoms, wavelength in CASES:
    structure = gemmi.SmallStructure()
    structure.cell = gemmi.UnitCell(*cell)
    structure.spacegroup_hm = group
    structure.spacegroup = gemmi.SpaceGroup(group)
    structure.setup_cell_images()
    for i, (symbol, xyz, occupancy, b_iso) in enumerate(atoms):
        site = gemmi.SmallStructure.Site()
        site.label = f'{symbol}{i}'
        site.type_symbol = symbol
        site.element = gemmi.Element(symbol)
        site.fract = gemmi.Fractional(*xyz)
        site.occ = occupancy
        site.u_iso = b_iso/(8*math.pi**2)
        structure.add_site(site)
    # Gemmi's crystallographic occupancy convention divides special positions
    # by their stabilizer size before summing the complete space-group orbit.
    structure.change_occupancies_to_crystallographic()
    calculator = gemmi.StructureFactorCalculatorX(structure.cell)
    dmin = wavelength/(2*math.sin(math.radians(40)))
    limits = [math.ceil(length/dmin) for length in cell[:3]]
    raw = []
    for hkl in itertools.product(*(range(-n,n+1) for n in limits)):
        if hkl == (0,0,0):
            continue
        d = structure.cell.calculate_d(hkl)
        sine = wavelength/(2*d)
        if not 0 < sine < 1:
            continue
        theta = math.asin(sine)
        angle = math.degrees(2*theta)
        if not 5 <= angle <= 80:
            continue
        factor = calculator.calculate_sf_from_small_structure(structure, hkl)
        intensity = abs(factor)**2 * (1+math.cos(2*theta)**2)/(math.sin(theta)**2*math.cos(theta))
        if intensity > 2e-8:
            raw.append((angle,intensity))
    raw.sort()
    peaks = []
    for angle, intensity in raw:
        if peaks and abs(peaks[-1][0]-angle) < 1e-7:
            peaks[-1][1] += intensity
        else:
            peaks.append([angle,intensity])
    maximum = max(p[1] for p in peaks)
    peaks = [[angle,intensity*100/maximum] for angle,intensity in peaks]
    # Compute every Gaussian directly; app uses a bounded tail loop.
    sigma = .1/(2*math.sqrt(2*math.log(2)))
    profile = [sum(intensity*math.exp(-.5*((5+i*.02-angle)/sigma)**2)
                   for angle,intensity in peaks) for i in range(3751)]
    maximum = max(profile)
    profile = [v*100/maximum for v in profile]
    references.append(dict(name=name, cell=cell, group=group,
        operations=[op.triplet() for op in structure.spacegroup.operations()],
        atoms=atoms, wavelength=wavelength, peaks=peaks, profile=profile))
output = ROOT / 'src/renderer/src/__fixtures__/pxrd-reference.json'
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(dict(generator='Gemmi 0.7.5; scripts/scientific-reference.py',
    positionToleranceDegrees=1e-6, intensityTolerancePercent=0.002,
    profileTolerancePercent=0.003, cases=references), separators=(',',':'))+'\n')
print(f'Wrote {len(table)} elements and {len(references)} independent synthetic reference patterns')
