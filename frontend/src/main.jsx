import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
          <h1 style={{ color: '#dc2626' }}>Something went wrong</h1>
          <pre style={{ background: '#fef2f2', padding: 16, borderRadius: 8, fontSize: 13, whiteSpace: 'pre-wrap' }}>
            {this.state.error?.message || 'Unknown error'}
          </pre>
          <pre style={{ background: '#f1f5f9', padding: 16, borderRadius: 8, fontSize: 11, whiteSpace: 'pre-wrap', marginTop: 8 }}>
            {this.state.error?.stack || ''}
          </pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: 16, padding: '8px 24px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
