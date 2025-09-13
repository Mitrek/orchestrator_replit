import { useEffect, useState } from "react";
import CreateKeyModal from "../components/CreateKeyModal";

type KeyRow = {
  id: string;
  name: string;
  keyPrefix: string; // ai_lure_<8-hex>
  isActive: boolean;
  lastUsedAt?: string | null;
  createdAt?: string | null;
};

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [newKey, setNewKey] = useState<any>(null);

  // TEMP user id just to test (until you wire real auth on server)
  const userId = "demo-user";

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/keys?userId=${encodeURIComponent(userId)}`);
        const data = await res.json();
        setKeys(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const createKey = async () => {
    try {
      const res = await fetch("/api/v1/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, name: "default" }),
      });
      const data = await res.json(); // { id, name, key, keyPrefix }
      if (!res.ok) throw new Error(data?.message || "Failed to create key");

      // show modal with the ONLY copy of full key
      setNewKey(data);

      // refresh table (this list only shows masked prefix)
      setKeys((prev) => [{ id: data.id, name: data.name, keyPrefix: data.keyPrefix, isActive: true }, ...prev]);
    } catch (e) {
      alert(String(e));
    }
  };

  const mask = (prefix: string) => `${prefix}${"•".repeat(32)}`;

  return (
    <div style={{ padding: 16 }}>
      <h2>API Keys</h2>
      <p style={{ maxWidth: 640 }}>
        Create a key and copy it from the modal. After creation, you’ll only see the masked prefix here.
      </p>
      <button onClick={createKey} disabled={loading}>+ Create API Key</button>

      <table style={{ marginTop: 16, width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thTd}>Name</th>
            <th style={thTd}>Key (masked)</th>
            <th style={thTd}>Status</th>
            <th style={thTd}>Last used</th>
            <th style={thTd}>Created</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td style={thTd} colSpan={5}>Loading…</td></tr>
          ) : keys.length === 0 ? (
            <tr><td style={thTd} colSpan={5}>No keys yet</td></tr>
          ) : (
            keys.map(k => (
              <tr key={k.id}>
                <td style={thTd}>{k.name}</td>
                <td style={thTd}><code>{mask(k.keyPrefix)}</code></td>
                <td style={thTd}>{k.isActive ? "Active" : "Inactive"}</td>
                <td style={thTd}>{k.lastUsedAt ?? "—"}</td>
                <td style={thTd}>{k.createdAt ?? "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {newKey && <CreateKeyModal apiResponse={newKey} onClose={() => setNewKey(null)} />}
    </div>
  );
}

const thTd: React.CSSProperties = {
  borderBottom: "1px solid #e5e7eb",
  textAlign: "left",
  padding: "8px 6px",
};
