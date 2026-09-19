import { createElement, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import type { EntryRow } from '../../../shared/types';
import { createRecoveryWorkflow } from '../sourceRecoveryWorkflow';
import SourceRecovery, { RecoveryContent, RecoveryDialog } from './SourceRecovery';

const entry = { id: 7, source_filename: 'missing.cif', formula: 'Na1Cl1', reference: 'Synthetic reference' } as EntryRow;
function setup() {
  const sourceRecovery = vi.fn().mockResolvedValue({ eligible: true, candidates: [{ ...entry, id: 11 }] });
  const completed = vi.fn();
  const workflow = createRecoveryWorkflow(entry, { sourceRecovery }, completed);
  const markup = () => renderToStaticMarkup(createElement(RecoveryContent, { entry, workflow }));
  return { workflow, sourceRecovery, completed, markup };
}
// Inspect the pure presentation's event contracts; native focus/layout is covered in Electron.
function nodes(node: ReactNode, type: string): ReactElement<Record<string, any>>[] {
  if (Array.isArray(node)) return node.flatMap(child => nodes(child, type));
  if (!isValidElement(node)) return [];
  const element = node as ReactElement<{ children?: ReactNode }>;
  return [...(element.type === type ? [element] : []), ...nodes(element.props.children, type)];
}
afterEach(() => vi.unstubAllGlobals());

it('labels the recovery dialog and identifies the entry before any action', () => {
  const { workflow } = setup();
  const html = renderToStaticMarkup(createElement(RecoveryDialog, { entry, workflow }));
  expect(html).toContain('aria-labelledby="source-recovery-title"');
  expect(html).toContain('id="source-recovery-title"');
  expect(html).toContain('missing.cif');
  expect(html).not.toContain('Delete entry confirmation');
});

it('keeps the entry intact until recovery inspection succeeds', () => {
  vi.stubGlobal('window', { cifApi: { sourceRecovery: vi.fn() } });
  expect(renderToStaticMarkup(createElement(SourceRecovery, { entry }))).toBe('');
});

it('shows candidates as unverified matches and wires explicit navigation', async () => {
  const t = setup(); await t.workflow.inspect();
  expect(t.markup()).toContain('does not prove they are the same structure');
  expect(t.markup()).toContain('Delete this entry…');
  expect(t.markup()).toContain('Locate CIF…');
  expect(t.markup()).not.toContain('Look in backup');
  expect(t.markup()).not.toContain('Save recovery snapshot');
  const view = RecoveryContent({ entry, workflow: t.workflow });
  nodes(view, 'button').find(button => button.props.children === 'Open matching entry')!.props.onClick();
  expect(t.completed).toHaveBeenCalledWith(expect.objectContaining({ id: 11 }));
});

it('renders the comparison and requires fresh acknowledgement after changing blocks', async () => {
  const t = setup(); await t.workflow.inspect();
  t.sourceRecovery.mockResolvedValue({ eligible: true, token: 'preview', choices: [{ index: 0, filename: 'chosen.cif', block: 'one', formula: 'Fe2O3',
    reference: 'Selected reference', atoms: 5, cell: [4,4,4,90,90,90] }] });
  await t.workflow.chooseCif();
  expect(t.markup()).toContain('Fe<sub>2</sub>O<sub>3</sub>'); expect(t.markup()).toContain('Confirm recovery');
  let view = RecoveryContent({ entry, workflow: t.workflow });
  nodes(view, 'input')[0].props.onChange({ target: { checked: true } });
  expect(t.workflow.snapshot().confirmed).toBe(true);
  nodes(view, 'select')[0].props.onChange({ target: { value: '0' } });
  expect(t.workflow.snapshot().confirmed).toBe(false);
  t.sourceRecovery.mockResolvedValue({ eligible: true, token: 'remove', removal: true });
  await t.workflow.prepareRemove(); view = RecoveryContent({ entry, workflow: t.workflow });
  expect(nodes(view, 'input')).toHaveLength(0);
  expect(t.markup()).not.toContain('snapshot.db'); expect(t.markup()).toContain('Delete entry');
  t.sourceRecovery.mockResolvedValue({ eligible: true, completed: 'removed' });
  await t.workflow.confirm(); expect(t.markup()).toContain('unavailable entry was removed');
});

it('shows missing candidates, errors, progress and a successful recovery result', async () => {
  const t = setup(); expect(t.markup()).toContain('No working candidate');
  t.sourceRecovery.mockRejectedValue(new Error('Invalid backup')); await t.workflow.chooseCif();
  expect(t.markup()).toContain('role="alert"');
  let finish!: (value: unknown) => void;
  t.sourceRecovery.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const pending = t.workflow.chooseCif(); expect(t.markup()).toContain('Checking sources');
  finish({ eligible: true, completed: 'recovered', entry, snapshot: 'saved.db' }); await pending;
  expect(t.markup()).toContain('The source was recovered');
});
