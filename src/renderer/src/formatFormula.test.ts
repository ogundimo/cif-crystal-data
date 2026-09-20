import { renderToStaticMarkup } from 'react-dom/server';
import { createElement, Fragment } from 'react';
import { expect, it } from 'vitest';
import { formatCifText, formatFormula, plainCifText } from './formatFormula';

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

it.each([
  ['Phase relations in the FeSe-FeGa~2~Se~4~-FeIn~2~Se~4~ system:',
    'Phase relations in the FeSe-FeGa<sub>2</sub>Se<sub>4</sub>-FeIn<sub>2</sub>Se<sub>4</sub> system:'],
  ['Fe~0.5~Mg~0.5~O in 2019, volume 40', 'Fe<sub>0.5</sub>Mg<sub>0.5</sub>O in 2019, volume 40'],
  ['A~1-x~B~x~', 'A<sub>1-x</sub>B<sub>x</sub>'],
  ['Fe~2', 'Fe~2'], ['Fe~~', 'Fe~~'], ['Fe~2\nO~', 'Fe~2\nO~'],
  ['<img src=x>~2~', '&lt;img src=x&gt;<sub>2</sub>'],
  ['A 2D model of Fe2O3', 'A 2D model of Fe2O3'], ['', '']
])('renders explicit CIF markup in prose: %s', (input, expected) => {
  expect(renderToStaticMarkup(createElement(Fragment, null, formatCifText(input)))).toBe(expected);
});


it.each([
  ['RE$_3$InSe$_6$', 'RE<sub>3</sub>InSe<sub>6</sub>', 'RE3InSe6'],
  ['RE$\\_3$InSe$\\_6$', 'RE<sub>3</sub>InSe<sub>6</sub>', 'RE3InSe6'],
  ['K$_{12}$Ta~6~Se$_{35}$', 'K<sub>12</sub>Ta<sub>6</sub>Se<sub>35</sub>', 'K12Ta6Se35'],
  ['Fe$_{1-x}$Se in 2021, 297', 'Fe<sub>1-x</sub>Se in 2021, 297', 'Fe1-xSe in 2021, 297'],
  ['Price $3, RE$_3 and $_{}$', 'Price $3, RE$_3 and $_{}$', 'Price $3, RE$_3 and $_{}$'],
  ['$_{<script>}$', '<sub>&lt;script&gt;</sub>', '<script>']
])('renders explicit LaTeX subscripts safely: %s', (input, expected, plain) => {
  expect(renderToStaticMarkup(createElement(Fragment, null, formatCifText(input)))).toBe(expected);
  expect(plainCifText(input)).toBe(plain);
});


it.each([
  ['SO~4~^2-^', 'SO<sub>4</sub><sup>2-</sup>'],
  ['$RE_3InSe_6$', 'RE<sub>3</sub>InSe<sub>6</sub>'],
  ['$Fe_{1-x}Mg_xO$', 'Fe<sub>1-x</sub>Mg<sub>x</sub>O'],
  ['SO$_4$$^{2-}$', 'SO<sub>4</sub><sup>2-</sup>'],
  ['\\(Ca(OH)_2\\)', 'Ca(OH)<sub>2</sub>'],
  ['$\\mathrm{RE}_{3}InSe_{6}$', 'RE<sub>3</sub>InSe<sub>6</sub>'],
  ['RE_{3}InSe_{6}', 'RE<sub>3</sub>InSe<sub>6</sub>'],
  ['Fe\\textsuperscript{3+}', 'Fe<sup>3+</sup>'],
  ['RE\\textsubscript{3}', 'RE<sub>3</sub>'],
  ['SO<sub>4</sub><sup>2-</sup>', 'SO<sub>4</sub><sup>2-</sup>'],
  ['RE<jats:sub>3</jats:sub>InSe<SUB>6</SUB>', 'RE<sub>3</sub>InSe<sub>6</sub>'],
  ['RE₃InSe₆ and Fe³⁺; α-Fe₂O₃', 'RE₃InSe₆ and Fe³⁺; α-Fe₂O₃'],
  ['2021, 297, 1-6; Fe2O3; sample_3.cif; $25', '2021, 297, 1-6; Fe2O3; sample_3.cif; $25'],
  ['Fe^3+; RE_{3; <sub>2', 'Fe^3+; RE_{3; &lt;sub&gt;2'],
  ['$\\frac{1}{2}Fe_3$', '$\\frac{1}{2}Fe_3$'],
  ['$\\ce{Fe2O3}$', '$\\ce{Fe2O3}$'],
  ['<sub onclick="alert(1)">3</sub>', '&lt;sub onclick=&quot;alert(1)&quot;&gt;3&lt;/sub&gt;'],
  ['<script>alert(1)</script>', '&lt;script&gt;alert(1)&lt;/script&gt;']
])('handles common publication notation without guessing: %s', (input, expected) => {
  expect(renderToStaticMarkup(createElement(Fragment, null, formatCifText(input)))).toBe(expected);
});


it('preserves unsupported math blocks as a whole, including braced scripts', () => {
  const source = '$\\frac{1}{2}Fe_{3}^{2+}X^{3}$ and \\(\\unknown{Fe}_{2}\\)';
  expect(plainCifText(source)).toBe(source);
  expect(renderToStaticMarkup(createElement(Fragment, null, formatCifText(source)))).toBe(source);
});

it('uses the same plain text for tooltips as mixed-format visible text', () => {
  expect(plainCifText('SO<sub>4</sub>^2-^ and $RE_3InSe_6$')).toBe('SO42- and RE3InSe6');
});
