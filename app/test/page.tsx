"use client";
import { useState } from "react";

export default function TestPage() {
  const [msg, setMsg] = useState("");
  const [result, setResult] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function send() {
    setLoading(true);
    setResult("");
    setStatus("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: msg }] }),
      });
      setStatus(`HTTP ${res.status} | source: ${res.headers.get("x-boss-source") ?? "unknown"}`);
      const text = await res.text();
      setResult(text);
    } catch (e: any) {
      setStatus("FETCH ERROR");
      setResult(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ fontFamily: "monospace", padding: 32, background: "#000", color: "#fff", minHeight: "100vh" }}>
      <h1>🍌 Boss Stack — Raw Test</h1>
      <p style={{ color: "#888" }}>No localStorage. No streaming. Just raw fetch → /api/chat</p>
      <br />
      <input
        value={msg}
        onChange={e => setMsg(e.target.value)}
        placeholder="Type a message..."
        style={{ width: 400, padding: 8, background: "#111", color: "#fff", border: "1px solid #444", borderRadius: 4 }}
        onKeyDown={e => e.key === "Enter" && send()}
      />
      <button onClick={send} disabled={loading} style={{ marginLeft: 8, padding: "8px 16px", background: "#eab308", color: "#000", border: "none", borderRadius: 4, cursor: "pointer" }}>
        {loading ? "..." : "Send"}
      </button>
      <br /><br />
      {status && <p style={{ color: status.startsWith("HTTP 2") ? "#4ade80" : "#f87171" }}>Status: {status}</p>}
      {result && (
        <pre style={{ background: "#111", padding: 16, borderRadius: 4, whiteSpace: "pre-wrap", color: "#e4e4e7" }}>
          {result}
        </pre>
      )}
    </div>
  );
}
