'use client';

import React from 'react';

interface Props {
  pieceName: string;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}

/**
 * Error boundary that wraps the expanded piece editor (PieceVisualEditor / InlinePieceEditor).
 * Prevents a single piece with bad data from crashing the entire quote page.
 */
export default class PieceEditorErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, showDetails: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 border border-red-200 rounded-lg bg-red-50 text-sm">
          <p className="text-red-700 font-medium">
            Something went wrong displaying &ldquo;{this.props.pieceName}&rdquo;.
          </p>
          <p className="text-red-600 mt-1">
            Try collapsing and re-expanding, or contact support.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={this.handleRetry}
              className="text-xs px-2 py-1 rounded bg-red-100 hover:bg-red-200 text-red-700"
            >
              Retry
            </button>
            <button
              onClick={() => this.setState({ showDetails: !this.state.showDetails })}
              className="text-xs px-2 py-1 rounded bg-red-100 hover:bg-red-200 text-red-700"
            >
              {this.state.showDetails ? 'Hide' : 'Show'} Error Details
            </button>
          </div>
          {this.state.showDetails && this.state.error && (
            <pre className="mt-2 text-xs text-red-500 whitespace-pre-wrap overflow-auto max-h-32">
              {this.state.error.message}
              {'\n'}
              {this.state.error.stack}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
