'use client'

import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean; message: string }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message }
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="page-container items-center justify-center text-center px-6">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-lg font-bold mb-2">Что-то пошло не так</h2>
        <p className="text-text-secondary text-sm mb-6">{this.state.message}</p>
        <button
          className="btn-primary"
          onClick={() => {
            this.setState({ hasError: false, message: '' })
            window.location.reload()
          }}
        >
          Перезагрузить
        </button>
      </div>
    )
  }
}