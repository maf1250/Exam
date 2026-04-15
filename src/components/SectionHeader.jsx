import { COLORS } from "../utils/constants";

export default function SectionHeader({ title, description }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 24, fontWeight: 900, color: COLORS.charcoal }}>{title}</div>
      {description ? (
        <div style={{ color: COLORS.muted, marginTop: 6, lineHeight: 1.8 }}>{description}</div>
      ) : null}
    </div>
  );
}
