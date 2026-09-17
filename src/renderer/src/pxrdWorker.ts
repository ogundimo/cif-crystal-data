import { calculatePxrd, createPxrdProfile } from './pxrd';
import type { PxrdRequest, PxrdResponse } from './pxrdTask';

self.onmessage = (event: MessageEvent<PxrdRequest>) => {
  try {
    const started = performance.now();
    const { entry, input, wavelength, fwhm } = event.data;
    const result = calculatePxrd(entry, input.atomSites, input.symmetryOperations, wavelength);
    if (entry.radiation_wavelength_angstrom == null) result.diagnostics.unshift(`CIF wavelength missing; the control defaults to 1.5406 Å. Current wavelength: ${wavelength} Å.`);
    if (fwhm < 0.04) result.diagnostics.push('The 0.02° profile grid undersamples this narrow FWHM; sampled heights may miss peak maxima.');
    const response: PxrdResponse = { result, profile:createPxrdProfile(result.peaks, fwhm), calculationMs:performance.now()-started };
    self.postMessage(response);
  } catch { self.postMessage({ error:'Calculation failed' }); }
};
