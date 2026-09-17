import { afterEach, describe, expect, it, vi } from 'vitest';
import { startPxrdTask } from './pxrdTask';
import type { PxrdRequest, PxrdResponse } from './pxrdTask';

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: {data:PxrdResponse | {error:string}})=>void) | null = null;
  onerror: (()=>void) | null = null;
  onmessageerror: (()=>void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { FakeWorker.instances.push(this); }
}
afterEach(()=> { vi.unstubAllGlobals(); FakeWorker.instances=[]; });
const request = {wavelength:1.5406,fwhm:.1} as PxrdRequest;
const response = {calculationMs:42} as PxrdResponse;
describe('PXRD job lifecycle',()=> {
  it('terminates superseded work and ignores its late result even after another job finishes',()=> {
    vi.stubGlobal('Worker',FakeWorker);
    const complete = vi.fn(), fail = vi.fn();
    const cancel = startPxrdTask(request,complete,fail);
    const old = FakeWorker.instances[0]; const late = old.onmessage!;
    expect(old.postMessage).toHaveBeenCalledWith(request);
    cancel();
    startPxrdTask({...request,wavelength:1},complete,fail);
    FakeWorker.instances[1].onmessage!({data:response});
    late({data:{...response,calculationMs:999}});
    expect(complete).toHaveBeenCalledExactlyOnceWith(response);
    expect(old.terminate).toHaveBeenCalledOnce();
    expect(old.onmessage).toBeNull(); expect(fail).not.toHaveBeenCalled();
  });
  it.each(['onerror','onmessageerror','reported'] as const)('reports %s and supports a successful retry',kind=> {
    vi.stubGlobal('Worker',FakeWorker);
    const complete=vi.fn(),fail=vi.fn();
    startPxrdTask(request,complete,fail);
    const worker=FakeWorker.instances[0];
    if(kind==='reported') worker.onmessage!({data:{error:'failed'}}); else worker[kind]!();
    expect(worker.terminate).toHaveBeenCalledOnce(); expect(fail).toHaveBeenCalledOnce(); expect(complete).not.toHaveBeenCalled();
    startPxrdTask(request,complete,fail); FakeWorker.instances[1].onmessage!({data:response});
    expect(complete).toHaveBeenCalledWith(response);
  });
  it('handles worker construction failure',()=> {
    vi.stubGlobal('Worker',class {constructor(){throw new Error('unavailable');}});
    const fail=vi.fn(); expect(()=>startPxrdTask(request,vi.fn(),fail)).not.toThrow();
    expect(fail).toHaveBeenCalledOnce();
  });
});
