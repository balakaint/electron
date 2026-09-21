import { Component, ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { RADIUS, SPACE } from '../spacing';

// Uncaught render error anywhere below this unmounts the whole tree —
// no error boundary existed in the app before this (ui-ux-audit full
// audit, 2026-09-22), so a null deref in any one of the ~35 panels
// blanked the screen with no recovery and no signal anything went wrong.
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('Uncaught render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: SPACE.md,
            height: '100vh',
            padding: SPACE.xl,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 600 }}>Something went wrong.</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 480 }}>
            {this.state.error.message || 'An unexpected error occurred.'}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: SPACE.xs,
              padding: '8px 16px',
              borderRadius: RADIUS.control,
            }}
          >
            <RefreshCw size={14} /> Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
