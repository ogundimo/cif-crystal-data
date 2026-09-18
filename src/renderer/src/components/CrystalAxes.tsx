import { projectedAxes } from '../jsmol/geometry';

export default function CrystalAxes({ cell, rotation }: { cell: number[]; rotation: number[][] }) {
  const axes = projectedAxes(cell, rotation);
  const labels: number[][] = [];
  for (const [x, y] of axes) {
    const end = Math.hypot(x, y) < 5 ? [0, 12] : [x * 1.22, -y * 1.22];
    const candidates = [[0,0],[0,12],[0,-12],[12,0],[-12,0]].map(([dx,dy]) => [end[0]+dx,end[1]+dy]);
    labels.push(candidates.find(([lx,ly]) => Math.abs(lx) <= 40 && Math.abs(ly) <= 40 && labels.every(([px,py]) => Math.hypot(lx-px,ly-py) >= 11)) ?? end);
  }
  return <svg aria-label="Crystallographic orientation axes" className="pointer-events-none absolute bottom-1 left-1 z-[9998] h-24 max-h-full w-24 max-w-full" viewBox="0 0 96 96">
    <circle cx="48" cy="48" r="44" fill="#071018" fillOpacity="0.8" />
    {axes.map(([x,y], index) => <g key={index} fill={['#ff9494','#9bea9b','#99caff'][index]} stroke={['#ff9494','#9bea9b','#99caff'][index]}>
      <line x1="48" y1="48" x2={48+x} y2={48-y} strokeWidth="2" />
      <text x={48+labels[index][0]} y={48+labels[index][1]} stroke="none" fontSize="12" textAnchor="middle" dominantBaseline="middle">{'abc'[index]}</text>
    </g>)}
  </svg>;
}
