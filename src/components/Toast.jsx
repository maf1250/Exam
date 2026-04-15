import { COLORS } from "../utils/constants";

export default function Toast({ item, onClose, onRestore }) {
  if (!item) return null;

  const bg =
    item.type === "error" ? COLORS.dangerBg : item.type === "warning" ? COLORS.warningBg : COLORS.successBg;
  const color =
    item.type === "error" ? COLORS.danger : item.type === "warning" ? COLORS.warning : COLORS.success;

  return (
    <div
      style={{
        position: "fixed",
        top: 20,
        right: 20,
        zIndex: 9999,
        width: "min(380px, calc(100vw - 32px))",
        background: bg,
        border: "1px solid rgba(0,0,0,0.08)",
        color,
        borderRadius: 18,
        padding: 16,
        boxShadow: "0 16px 35px rgba(20, 123, 131, 0.16)",
      }}
    >
      <div style={{ fontWeight: 800, marginBottom: 6 }}>{item.title}</div>
      <div style={{ fontSize: 14, lineHeight: 1.7 }}>{item.description}</div>

      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        {item.type === "warning" && item.action === "restore_session" && onRestore ? (
          <button
            onClick={onRestore}
            style={{ background: "transparent", border: "none", color, fontWeight: 800, cursor: "pointer" }}
          >
            استرجاع
          </button>
        ) : null}

        <button
          onClick={onClose}
          style={{ background: "transparent", border: "none", color, fontWeight: 700, cursor: "pointer" }}
        >
          إغلاق
        </button>
      </div>
    </div>
  );
}
