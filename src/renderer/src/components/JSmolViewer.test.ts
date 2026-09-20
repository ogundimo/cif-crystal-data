import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { EntryRow } from '../../../shared/types';
import JSmolViewer, { crystalLegendModeForHeight } from './JSmolViewer';

it('starts as an uncluttered embedded viewer while the structure initializes', () => {
  const entry = { id: 1, source_filename: 'synthetic.cif' } as EntryRow;
  const html = renderToStaticMarkup(createElement(JSmolViewer, { entry, atomSites: [] }));
  expect(html).toContain('Double-click to open viewer controls');
  expect(html).toContain('Preparing the local viewer');
  expect(html).not.toContain('<button');
  expect(html).not.toContain('viewer-picking-status');
  expect(html).not.toContain('fixed inset-0');
});

describe('responsive crystal legend layout', () => {
  it('uses a vertical card for a tall viewer', () => {
    expect(crystalLegendModeForHeight(180)).toBe('vertical');
    expect(crystalLegendModeForHeight(400)).toBe('vertical');
  });

  it('uses a horizontal overlay for a medium-height viewer', () => {
    expect(crystalLegendModeForHeight(90)).toBe('horizontal');
    expect(crystalLegendModeForHeight(179)).toBe('horizontal');
  });

  it('hides the legend when the viewer is too small', () => {
    expect(crystalLegendModeForHeight(89)).toBeNull();
    expect(crystalLegendModeForHeight(44)).toBeNull();
  });

  it('falls back to horizontal when the measured vertical legend would clip', () => {
    expect(crystalLegendModeForHeight(180, 170, 24)).toBe('horizontal');
  });

  it('hides the legend when neither measured format fits inside the safe area', () => {
    expect(crystalLegendModeForHeight(95, 170, 84)).toBeNull();
  });

  it('accounts for the extra top clearance beneath the grid divider', () => {
    expect(crystalLegendModeForHeight(100, 170, 77)).toBeNull();
    expect(crystalLegendModeForHeight(101, 170, 77)).toBe('horizontal');
  });
});
