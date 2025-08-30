import { useState } from "react";

type Props = {
  apiResponse: { id: string; name: string; key: string; keyPrefix: string } | null;
  onClose: () => void;
};

export default function CreateKeyModal({ apiResponse, onClose }: Props) {
  if (!apiResponse?.key) return null;

  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(apiResponse.key);
    setCopied(true);
  };

  return (
    <div style={backdropStyle}>
      <div style={modalStyle}>
        <h3 style={{ marginTop: 0 }}>New API Key</h3>
        <p>Copy and store it now. You won’t be able to see it again.</p>
        <pre style={preStyle}>{apiResponse.key}</pre>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={copy}>{copied ? "Copied ✓" : "Copy"}</button>
          <button onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

const backdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 9999,
};

const modalStyle: React.CSSProperties = {
  background: "#fff",
  color: "#111",
  padding: 16,
  borderRadius: 8,
  width: 560,
  maxWidth: "90vw",
};

const preStyle: React.CSSProperties = {
  background: "#f4f4f5",
  padding: 12,
  borderRadius: 6,
  overflowX: "auto",
};
