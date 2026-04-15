import { COLORS } from "./constants";

export function normalizeArabic(value) {
  return String(value ?? "")
    .trim()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/أ|إ|آ/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ");
}

export function splitBySlash(value) {
  return String(value ?? "")
    .split("/")
    .map((x) => x.trim())
    .filter(Boolean);
}

export function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function formatGregorian(date) {
  return new Intl.DateTimeFormat("ar-SA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function formatHijri(date) {
  return new Intl.DateTimeFormat("ar-SA-u-ca-islamic", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function formatHijriNumeric(date) {
  const parts = new Intl.DateTimeFormat("en-GB-u-ca-islamic", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);

  const day = parts.find((p) => p.type === "day")?.value || "";
  const month = parts.find((p) => p.type === "month")?.value || "";
  const year = parts.find((p) => p.type === "year")?.value || "";

  return `${year}/${month}/${day}`;
}

export function parseTimeToMinutes(time) {
  const match = String(time || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

export function minutesToTimeText(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function parsePeriodsText(periodsText) {
  return String(periodsText || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const clean = line.replace(/\s+/g, "");
      const match = clean.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
      if (!match) return { index, raw: line, valid: false };

      const startMinutes = parseTimeToMinutes(match[1]);
      const endMinutes = parseTimeToMinutes(match[2]);

      if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
        return { index, raw: line, valid: false };
      }

      return {
        index,
        raw: line,
        valid: true,
        startMinutes,
        endMinutes,
        timeText: `${minutesToTimeText(startMinutes)} - ${minutesToTimeText(endMinutes)}`,
      };
    });
}

export function buildSlots({ startDate, numberOfDays, selectedDays, parsedPeriods }) {
  if (!startDate || !selectedDays.length || !parsedPeriods.length || numberOfDays <= 0) {
    return [];
  }

  const validPeriods = parsedPeriods.filter((p) => p.valid);
  if (!validPeriods.length) return [];

  const allowed = new Set(selectedDays);
  const slots = [];
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);

  let countedDays = 0;
  let safety = 0;

  while (countedDays < numberOfDays && safety < 800) {
    const dayName = new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(cursor);

    if (allowed.has(dayName)) {
      validPeriods.forEach((period, idx) => {
        slots.push({
          id: `${cursor.toISOString().slice(0, 10)}-${idx + 1}`,
          dateISO: cursor.toISOString().slice(0, 10),
          dayName,
          period: idx + 1,
          gregorian: formatGregorian(cursor),
          hijri: formatHijri(cursor),
          hijriNumeric: formatHijriNumeric(cursor),
          timeText: period.timeText,
          startMinutes: period.startMinutes,
          endMinutes: period.endMinutes,
        });
      });
      countedDays += 1;
    }

    cursor.setDate(cursor.getDate() + 1);
    safety += 1;
  }

  return slots;
}

export function rowsToCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((row) => headers.map((h) => esc(row[h])).join(","))].join("\n");
}

export function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function toggleDay(list, day) {
  return list.includes(day) ? list.filter((d) => d !== day) : [...list, day];
}

export function getSlotPeriodKey(itemOrSlot) {
  return `${itemOrSlot.dateISO}__${itemOrSlot.period}`;
}

export function fieldStyle() {
  return {
    width: "100%",
    boxSizing: "border-box",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 16,
    padding: "12px 14px",
    background: "#fff",
    outline: "none",
    fontFamily: "inherit",
    fontSize: 15,
    color: COLORS.text,
  };
}

export function cardButtonStyle({ active = false, disabled = false, danger = false } = {}) {
  let background = "#fff";
  let color = COLORS.charcoal;
  let border = `1px solid ${COLORS.border}`;
  let cursor = disabled ? "not-allowed" : "pointer";

  if (active) {
    background = COLORS.primaryDark;
    color = "#fff";
    border = `1px solid ${COLORS.primaryDark}`;
  }

  if (danger) {
    background = COLORS.dangerBg;
    color = COLORS.danger;
    border = "1px solid #FECACA";
  }

  if (disabled) {
    background = "#E5E7EB";
    color = COLORS.muted;
    border = "1px solid #E5E7EB";
  }

  return {
    background,
    color,
    border,
    borderRadius: 18,
    padding: "12px 20px",
    fontWeight: 800,
    cursor,
  };
}

export function serializeScheduleItem(item) {
  return {
    ...item,
    students: Array.isArray(item.students) ? item.students : Array.from(item.students || []),
  };
}

export function deserializeScheduleItem(item) {
  return {
    ...item,
    students: Array.isArray(item.students) ? item.students : [],
  };
}

export function hasMeaningfulSessionData(data) {
  return (
    (Array.isArray(data?.rows) && data.rows.length > 0) ||
    (Array.isArray(data?.schedule) && data.schedule.length > 0) ||
    (Array.isArray(data?.generalSchedule) && data.generalSchedule.length > 0) ||
    (Array.isArray(data?.specializedSchedule) && data.specializedSchedule.length > 0) ||
    (Array.isArray(data?.unscheduled) && data.unscheduled.length > 0)
  );
}
