import { Component, type ReactNode } from 'react'

export interface BubbleErrorBoundaryProps { children: ReactNode }
export interface BubbleErrorBoundaryState { hasError: boolean }

/** Isolate one bubble's render failure to a placeholder, never crashing the app. */
export class BubbleErrorBoundary extends Component<BubbleErrorBoundaryProps, BubbleErrorBoundaryState> {
  state: BubbleErrorBoundaryState = { hasError: false }
  static getDerivedStateFromError(): BubbleErrorBoundaryState { return { hasError: true } }
  render(): ReactNode {
    if (this.state.hasError) {
      return <div data-bubble-error>（该成员气泡渲染失败）</div>
    }
    return this.props.children
  }
}
