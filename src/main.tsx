import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import MonitorApp from './MonitorApp';
import { InstructorPanel } from './components/InstructorPanel';
import { LanguageProvider } from './i18n/LanguageContext';

interface ErrorBoundaryState { hasError: boolean; error: Error | null }

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: 'fixed', inset: 0,
          background: '#0a0a10',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16,
          fontFamily: 'monospace', color: '#ff4040',
        }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 900, letterSpacing: '0.2em' }}>
            ERROR CRÍTICO DEL SIMULADOR
          </div>
          <pre style={{
            background: '#14141e', border: '1px solid #4a1010',
            borderRadius: 8, padding: '16px 24px',
            color: '#ff8080', fontSize: '0.75rem', maxWidth: '80vw', overflow: 'auto',
          }}>
            {this.state.error?.message ?? 'Error desconocido'}
          </pre>
          <button
            onClick={this.handleReset}
            style={{
              background: '#1a1a2a', border: '1px solid #5b6af5',
              borderRadius: 6, color: '#5b6af5', cursor: 'pointer',
              fontSize: '0.9rem', fontWeight: 700, padding: '8px 24px',
              fontFamily: 'monospace',
            }}
          >
            RESET SIMULACIÓN
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LanguageProvider>
      <ErrorBoundary>
        <MonitorApp />
        <InstructorPanel />
      </ErrorBoundary>
    </LanguageProvider>
  </React.StrictMode>
);
