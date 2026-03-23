export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        background: "#040917",
        color: "#eaf3ff",
      }}
    >
      <div style={{ maxWidth: "32rem", textAlign: "center" }}>
        <p style={{ letterSpacing: "0.16em", textTransform: "uppercase", color: "#67b8ff" }}>
          FluxCloud Atlas
        </p>
        <h1 style={{ margin: "0.5rem 0 1rem" }}>This route was not found.</h1>
        <p style={{ margin: 0, color: "#96a8c2" }}>
          Return to the main constellation map to explore public FluxCloud
          deployments.
        </p>
      </div>
    </main>
  );
}
