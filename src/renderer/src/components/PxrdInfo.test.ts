import { isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PxrdResult } from '../pxrd';
import PxrdInfo from './PxrdInfo';

// Exercise presentation and event contracts without a browser dependency.
// Native pointer/focus delivery and actual layout are covered by the Electron suite.
const state = vi.hoisted(() => ({ anchor: null as DOMRect | null }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useId: () => 'pxrd-info-test',
  useState: () => [state.anchor, (anchor: DOMRect | null) => { state.anchor = anchor; }]
}));
vi.mock('react-dom', () => ({ createPortal: (children: ReactNode) => children }));

const result: PxrdResult = { status: 'complete', diagnostics: ['Neutral atoms', 'Missing displacement assumed zero'], peaks: [], wavelength: 1.5406, model: 'Synthetic test' };
function elements(node: ReactNode): ReactElement<Record<string, any>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement(node)) return [];
  const element = node as ReactElement<Record<string, any>>;
  return [element, ...elements(element.props.children)];
}
function view(value = result) {
  const tree = PxrdInfo({ result: value });
  const nodes = elements(tree);
  return { tree, button: nodes.find(node => node.type === 'button')!,
    tooltip: nodes.find(node => node.props.role === 'tooltip')!,
    content: nodes.find(node => node.props.style?.maxHeight !== undefined)! };
}
const eventAt = (top: number, right = 600) => ({ currentTarget: {
  getBoundingClientRect: () => ({ top, bottom: top + 24, right } as DOMRect)
} });

beforeEach(() => {
  state.anchor = null;
  vi.stubGlobal('document', { body: {} });
  vi.stubGlobal('window', { innerWidth: 800, innerHeight: 650 });
});
afterEach(() => vi.unstubAllGlobals());

it.each([
  ['complete', 'Calculated X-ray model — assumptions and limits'],
  ['incomplete', 'Incomplete pattern — reflection limit reached'],
  ['unsupported', 'Unsupported calculation']
] as const)('identifies the %s model and associates its diagnostics with the icon', (status, title) => {
  const { tree, button, tooltip } = view({ ...result, status });
  expect(button.props['aria-label']).toBe(title);
  expect(button.props['aria-describedby']).toBe(tooltip.props.id);
  expect(tooltip.props.hidden).toBe(true);
  const html = renderToStaticMarkup(tree);
  expect(html).toContain('Neutral atoms');
  expect(html).toContain('Missing displacement assumed zero');
  expect(html).toContain('aria-hidden="true"');
});

it('opens above the hovered icon, bounds the content, and closes on mouse leave', () => {
  view().button.props.onMouseEnter(eventAt(400));
  const open = view();
  expect(open.tooltip.props.hidden).toBe(false);
  expect(open.tooltip.props.style).toEqual({ left: 240, bottom: 250 });
  expect(open.content.props.style.maxHeight).toBe(384);
  open.tree.props.onMouseLeave();
  expect(view().tooltip.props.hidden).toBe(true);
});

it('opens below a keyboard-focused icon near the top and clamps to the viewport edge', () => {
  view().button.props.onFocus(eventAt(20, 100));
  expect(view().tooltip.props.style).toEqual({ left: 8, top: 44 });
  expect(view().content.props.style.maxHeight).toBe(590);
  view().button.props.onBlur();
  expect(view().tooltip.props.hidden).toBe(true);
});

it('dismisses on Escape without closing the surrounding UI and ignores other keys', () => {
  view().button.props.onFocus(eventAt(220, 900));
  expect(view().tooltip.props.style.left).toBe(432);
  const stopPropagation = vi.fn();
  view().button.props.onKeyDown({ key: 'Tab', stopPropagation });
  expect(view().tooltip.props.hidden).toBe(false);
  expect(stopPropagation).not.toHaveBeenCalled();
  view().button.props.onKeyDown({ key: 'Escape', stopPropagation });
  expect(view().tooltip.props.hidden).toBe(true);
  expect(stopPropagation).toHaveBeenCalledOnce();
});
