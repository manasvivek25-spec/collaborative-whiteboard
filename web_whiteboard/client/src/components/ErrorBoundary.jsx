import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) this.props.onReset();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 m-4 bg-white border border-red-200 rounded-2xl shadow-lg max-w-md mx-auto text-center animate-fade-in">
          <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-3 font-bold text-lg">
            !
          </div>
          <h3 className="font-bold text-slate-900 text-sm mb-1">
            {this.props.fallbackTitle || 'Component Recovered Safely'}
          </h3>
          <p className="text-xs text-slate-500 mb-4 leading-relaxed">
            A display issue was safely contained to keep your whiteboard running without crashing.
          </p>
          <div className="flex justify-center gap-2">
            <button
              onClick={this.handleReset}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition"
            >
              Resume
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl transition"
            >
              Refresh Workspace
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
