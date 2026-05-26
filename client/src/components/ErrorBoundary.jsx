import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        padding: "2rem",
        background: "var(--bg, #0a0a0a)",
        color: "var(--text, #fff)",
        fontFamily: "inherit",
        textAlign: "center",
      }}>
        <p style={{ fontSize: "2rem" }}>—</p>
        <p style={{ fontSize: "1.1rem", fontWeight: 600 }}>Algo salió mal.</p>
        <p style={{ fontSize: "0.9rem", opacity: 0.5, maxWidth: 400 }}>
          {this.state.error?.message || "Error inesperado en la aplicación."}
        </p>
        <button
          onClick={() => this.setState({ hasError: false, error: null })}
          style={{
            marginTop: "0.5rem",
            padding: "0.5rem 1.25rem",
            border: "1px solid rgba(255,255,255,.15)",
            borderRadius: "6px",
            background: "transparent",
            color: "inherit",
            cursor: "pointer",
            fontSize: "0.875rem",
          }}
        >
          Reintentar
        </button>
      </div>
    );
  }
}
