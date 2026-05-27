import React from "react";
import { APP_NAME, SETTINGS_KEY } from "../lib/constants";
import { CrashScreen } from "./CrashScreen";

export class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`${APP_NAME} crash:`, error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetAndReload = () => {
    localStorage.removeItem(SETTINGS_KEY);
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <CrashScreen
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          onReload={this.handleReload}
          onResetAndReload={this.handleResetAndReload}
        />
      );
    }

    return this.props.children;
  }
}
