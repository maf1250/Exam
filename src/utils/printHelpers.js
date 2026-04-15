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

export function groupScheduleForOfficialPrint(schedule) {
  const byDate = {};
  schedule.forEach((item) => {
    if (!byDate[item.dateISO]) {
      byDate[item.dateISO] = {
        dateISO: item.dateISO,
        dayName: item.dayName,
        hijriNumeric: item.hijriNumeric,
        periods: {},
      };
    }
    if (!byDate[item.dateISO].periods[item.period]) {
      byDate[item.dateISO].periods[item.period] = [];
    }
    byDate[item.dateISO].periods[item.period].push(item);
  });
  return Object.values(byDate).sort((a, b) => a.dateISO.localeCompare(b.dateISO));
}

export function getDayTheme(dayName) {
  const themes = {
    "الأحد": { bg: "#F3FBFA", border: "#1FA7A8", text: "#145A5F" },
    "الاثنين": { bg: "#F6FCFC", border: "#1B8F96", text: "#145A5F" },
    "الثلاثاء": { bg: "#EEF8F8", border: "#2A9D9C", text: "#145A5F" },
    "الأربعاء": { bg: "#F8FCFC", border: "#46AFAE", text: "#145A5F" },
    "الخميس": { bg: "#EFFAFA", border: "#147B83", text: "#145A5F" },
  };

  return themes[dayName] || { bg: "#FAFCFC", border: "#D7E7E6", text: "#1F2529" };
}
