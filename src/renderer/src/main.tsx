import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import RefinementWindow from './components/RefinementWindow';
import PlotExportWindow from './components/PlotExportWindow';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {new URLSearchParams(window.location.search).get('view') === 'plot-export' ? <PlotExportWindow /> : new URLSearchParams(window.location.search).get('view') === 'refinement' ? <RefinementWindow /> : <App />}
  </React.StrictMode>
);
