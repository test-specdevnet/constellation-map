"use client";

export default function GlobalError() {
  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          margin: 0,
          padding: "2rem",
          background: "#040917",
          color: "#eaf3ff",
          fontFamily: "Inter, Segoe UI, sans-serif",
        }}
      >
        <div style={{ maxWidth: "34rem", textAlign: "center" }}>
          <p style={{ letterSpacing: "0.16em", textTransform: "uppercase", color: "#67b8ff" }}>
            FluxCloud Atlas
          </p>
          <h1 style={{ margin: "0.5rem 0 1rem" }}>Something went wrong.</h1>
          <p style={{ margin: 0, color: "#96a8c2" }}>
            Reload the page or try again shortly. The public constellation
            data pipeline may be temporarily unavailable.
          </p>
        </div>
      </body>
    </html>
  );
}
