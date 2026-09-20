import { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PxrdResult } from '../pxrd';

export default function PxrdInfo({ result }: { result: PxrdResult }) {
  const id = useId();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const above = anchor !== null && anchor.top >= 200;
  const title = result.status === 'incomplete' ? 'Incomplete pattern — reflection limit reached'
    : result.status === 'unsupported' ? 'Unsupported calculation'
    : 'Calculated X-ray model — assumptions and limits';

  return <span className="flex shrink-0" onMouseLeave={() => setAnchor(null)}>
    <button
      type="button"
      aria-label={title}
      aria-describedby={id}
      className={`flex h-6 w-6 items-center justify-center rounded-sm hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${result.status === 'complete' ? 'text-[#4c5260]' : 'text-[#9a5a00]'}`}
      onMouseEnter={event => setAnchor(event.currentTarget.getBoundingClientRect())}
      onFocus={event => setAnchor(event.currentTarget.getBoundingClientRect())}
      onBlur={() => setAnchor(null)}
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setAnchor(null); } }}
    >
      <svg aria-hidden="true" width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="10" cy="10" r="8" />
        <path d="M10 9v6" />
        <circle cx="10" cy="6" r="0.8" fill="currentColor" stroke="none" />
      </svg>
    </button>
    {createPortal(<div
      id={id} role="tooltip" data-testid="pxrd-diagnostics" hidden={!anchor}
      className={`fixed z-50 w-[360px] max-w-[calc(100vw-16px)] ${above ? 'pb-2' : 'pt-2'}`}
      style={anchor ? { left: Math.max(8, Math.min(anchor.right - 360, window.innerWidth - 368)), ...(above ? { bottom: window.innerHeight - anchor.top } : { top: anchor.bottom }) } : undefined}
    >
      <div className="overflow-auto rounded border border-[#aeb8c2] bg-white p-3 text-xs text-[#2f4052] shadow-lg" style={{ maxHeight: anchor ? Math.max(60, (above ? anchor.top : window.innerHeight - anchor.bottom) - 16) : undefined }}>
        <p className="mb-1 font-semibold">{title}</p>
        <ul className="list-disc space-y-1 pl-4">{result.diagnostics.map(message => <li key={message}>{message}</li>)}</ul>
      </div>
    </div>, document.body)}
  </span>;
}
