import { COLORS } from "../utils/constants";

export default function Card({ children, style }) {
  return (
    <div
      style={{
        background: COLORS.card,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 30,
        padding: 22,
        boxShadow: "0 16px 36px rgba(20, 123, 131, 0.08)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
