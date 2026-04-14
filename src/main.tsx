import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import MonitorApp from './MonitorApp';
import { InstructorPanel } from './components/InstructorPanel';

// InstructorPanel es fixed-position y no afecta el layout de MonitorApp.
// Ambos comparten los stores de Zustand (singleton pattern).
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MonitorApp />
    <InstructorPanel />
  </React.StrictMode>
);