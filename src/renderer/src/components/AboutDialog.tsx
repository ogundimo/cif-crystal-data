import { useEffect, useRef } from 'react';
export default function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    dialog?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); }
      if (event.key !== 'Tab' || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex="0"]'));
      const first = items[0], last = items[items.length - 1];
      if (!first) { event.preventDefault(); dialog.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => { document.removeEventListener('keydown', handleKey, true); previous?.focus(); };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/35 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="about-title" className="flex max-h-[calc(100vh-2rem)] w-[34rem] max-w-full flex-col overflow-hidden rounded-md border border-[#aeb8c2] bg-white shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-stroke bg-[#f4f7f9] px-4 py-2">
          <h1 id="about-title" className="text-sm font-semibold text-[#26384a]">About CIF Crystal Data</h1>
          <button className="rounded px-2 py-1 hover:bg-[#c42b1c] hover:text-white" onClick={onClose} aria-label="Close About">✕</button>
        </header>
        <div className="min-h-0 space-y-3 overflow-y-auto p-4 text-xs leading-5 text-[#33475b]">
          <p><strong>CIF Crystal Data 1.1.0</strong> is a local desktop application for indexing, searching, inspecting, and exporting crystallographic information files.</p>
          <p>It provides searchable structure metadata, atomic-site tables, an interactive JSmol crystal viewer, and simulated powder X-ray diffraction patterns with configurable wavelength and peak broadening.</p>
          <section aria-labelledby="contributors-title">
            <h2 id="contributors-title" className="font-semibold">Contributors</h2>
            <p className="mt-1">Opeyemi Ogundimu, Vidyanshu Mishra, Abishek Iyer</p>
          </section>
          <p><strong>Data and calculation note:</strong> metadata is read from the imported CIF source. PXRD patterns are calculated approximations intended for exploration and should not be treated as experimental measurements or a substitute for a full crystallographic refinement package.</p>
          <p><strong>Viewer:</strong> molecular and crystal rendering is powered by JSmol 16.4.15. Element colors follow the viewer’s CPK-style palette.</p>
          <p><strong>Privacy:</strong> imported CIF files and the search database remain on this computer. When a publication link without a DOI is clicked, its title, citation, and author names are sent to Crossref to look for a verified DOI. Publication links open in the system browser.</p>
          <p><strong>License:</strong> MIT.</p>
        </div>
        <footer className="flex shrink-0 justify-end border-t border-stroke bg-[#f7f9fb] px-4 py-2">
          <button className="btn-w32 btn-primary" onClick={onClose}>Close</button>
        </footer>
      </section>
    </div>
  );
}
