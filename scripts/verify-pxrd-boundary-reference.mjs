import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Independent scalar inverse-metric oracle. No production calculation imports.
const records = [];
for (const [scale, expected] of [[4.003265380859375,10000], [4.0035400390625,10003]]) {
  const a=4.1*scale, b=5.3*scale, c=6.7*scale;
  const ca=Math.cos(73*Math.PI/180), cb=Math.cos(82*Math.PI/180), cg=Math.cos(67*Math.PI/180);
  const determinant=1-ca*ca-cb*cb-cg*cg+2*ca*cb*cg;
  const angles=[];
  // |h_i| <= length_i / d_min follows from Cauchy–Schwarz. All three
  // bounds are below 24 for these cells, independent of production's cap.
  assert.ok(Math.max(a,b,c)*2*Math.sin(40*Math.PI/180)/1.5406 < 24);
  for (let h=0; h<=24; h++) for (let k=-24; k<=24; k++) for (let l=-24; l<=24; l++) {
    if (h===0 && (k<0 || k===0 && l<=0)) continue;
    const q2=(h*h*(1-ca*ca)/(a*a)+k*k*(1-cb*cb)/(b*b)+l*l*(1-cg*cg)/(c*c)
      +2*h*k*(ca*cb-cg)/(a*b)+2*h*l*(ca*cg-cb)/(a*c)+2*k*l*(cb*cg-ca)/(b*c))/determinant;
    const angle=2*Math.asin(1.5406*Math.sqrt(q2)/2)*180/Math.PI;
    if (angle>=5 && angle<=80) angles.push(angle);
  }
  angles.sort((a,b)=>a-b);
  const minimumGap=Math.min(...angles.slice(1).map((a,i)=>a-angles[i]));
  assert.equal(angles.length,expected);
  assert.ok(minimumGap>8e-7); // No pair is within the 1e-7 merge tolerance.
  assert.ok(angles[0]>5.03 && angles.at(-1)<79.999); // Away from range equalities.
  records.push({scale,count:angles.length,minAngle:angles[0],maxAngle:angles.at(-1),minimumGap});
}

const coefficients=JSON.parse(await readFile(new URL('../src/shared/it92.json',import.meta.url),'utf8')).Na;
const theta=Math.asin(1.5406/(2*1.3));
const s2=(1/(2*1.3))**2;
// Sum the pinned coefficients directly, independently of xrayFormFactor.
let terms=0;
for (let i=0;i<4;i++) terms+=coefficients[i]*Math.exp(-coefficients[i+4]*s2);
const formFactor=coefficients[8]+terms;
const lp=(1+Math.cos(2*theta)**2)/(Math.sin(theta)**2*Math.cos(theta));
const occupancy=0.000008983789640712616;
const rawIntensity=(occupancy*formFactor)**2*lp;
assert.equal(rawIntensity,1e-8);
assert.equal(25**3*6400/2,50_000_000);
assert.equal(Math.sqrt(11)**2-1,1e-5*1000**2);
assert.equal(Number.isInteger(1e-7*2**50),false);
const sine=Math.sin(40*Math.PI/180);
const adjacentAngles=[sine,sine+2**-53].map(s=>2*Math.asin(s)/(Math.PI/180));
assert.ok(adjacentAngles[0]<80 && adjacentAngles[1]>80);
console.log(JSON.stringify({node:process.version,reflectionCounts:records,rawIntensity,adjacentAngles},null,2));
