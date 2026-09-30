import { Component, type ErrorInfo, type ReactNode } from "react";

type State = { failed: boolean };

/** Hide an optional GLB group that failed to load while leaving the arena playable. */
export class NonCriticalAssetBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Map props are decorative; a failed kit should not take down gameplay.
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}
