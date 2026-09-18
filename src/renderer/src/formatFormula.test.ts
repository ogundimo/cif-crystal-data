import { renderToStaticMarkup } from 'react-dom/server';
import { createElement, Fragment } from 'react';
import { expect, it } from 'vitest';
import { formatFormula } from './formatFormula';

it.each([
  ['Fe2O3', 'Fe<sub>2</sub>O<sub>3</sub>'],
  ['C12H22O11', 'C<sub>12</sub>H<sub>22</sub>O<sub>11</sub>'],
  ['Fe0.5Mg0.5O', 'Fe<sub>0.5</sub>Mg<sub>0.5</sub>O'],
  ['Ca(OH)2', 'Ca(OH)<sub>2</sub>'],
  ['CuSO4·5H2O', 'CuSO<sub>4</sub>·5H<sub>2</sub>O'],
  ['Fe3+', 'Fe3+'], ['NH4+', 'NH<sub>4</sub>+'],
  ['[Fe(CN)6]3-', '[Fe(CN)<sub>6</sub>]3-'],
  ['SO4^2-', 'SO<sub>4</sub>^2-'], ['2H2O', '2H<sub>2</sub>O'],
  ['C1', 'C'], ['', '']
])('formats %s without losing coefficients or charges', (input, expected) => {
  expect(renderToStaticMarkup(createElement(Fragment, null, formatFormula(input)))).toBe(expected);
});
