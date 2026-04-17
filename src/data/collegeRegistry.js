// =======================
// LOCATION CODES
// =======================
export const LOCATION_CODES = {
  "القصيم": "QS",

  "الباحة": "BA",
  "المخواة": "MW",
  "المندق": "MN",
  "بلجرشي": "BJ",

  "الجوف": "JF",
  "دومة الجندل": "DJ",
  "طبرجل": "TJ",
  "القريات": "QR",

  "رفحاء": "RF",
  "عرعر": "AR",
  "طريف": "TR",

  "الرياض": "RD",
  "الأفلاج": "FL",
  "الارطاوية": "AT",
  "الخرج": "KH",
  "الدوادمي": "DW",
  "الزلفي": "ZL",
  "السليل": "SL",
  "القويعية": "QW",
  "المجمعة": "MJ",
  "رماح": "RM",
  "وادي الدواسر": "WD",
  "الحريق": "HR",
  "حوطة بني تميم": "HB",
  "حوطة سدير": "HS",
  "عفيف": "AF",
  "شقراء": "SH",
  "ثادق": "TH",

  "الأحساء": "AH",
  "الدمام": "DM",
  "القطيف": "QT",
  "حفر الباطن": "HF",

  "بريدة": "BR",
  "الأسياح": "AY",
  "الرس": "RS",
  "المذنب": "MDH",
  "عنيزة": "UN",
  "البدائع": "BD",
  "رياض الخبراء": "RK",

  "المدينة المنورة": "MD",
  "الحناكية": "HK",
  "العلا": "UL",
  "العيص": "ES",
  "المهد": "MH",
  "بدر": "BDR",
  "خيبر": "KB",
  "ينبع": "YN",

  "تبوك": "TB",
  "أملج": "AM",
  "حقل": "HQ",
  "الوجه": "WG",
  "تيماء": "TM",
  "ضباء": "DB",

  "جازان": "JZ",
  "أبو عريش": "ABR",
  "الدرب": "DR",
  "العارضة": "AD",
  "الداير": "DY",
  "صامطة": "SM",
  "العيدابي": "ED",
  "فرسان": "FR",

  "حائل": "HL",
  "الحائط": "HT",
  "الشنان": "SN",
  "بقعاء": "BQ",

  "أبها": "AB",
  "أحد رفيدة": "AHR",
  "النماص": "NM",
  "بلقرن": "BL",
  "بيشة": "BS",
  "تنومة": "TN",
  "خميس مشيط": "KM",
  "رجال ألمع": "RA",
  "سراة عبيدة": "SA",
  "ظهران الجنوب": "DG",
  "محايل عسير": "MHL",
  "الفرشة": "FS",
  "تثليث": "TTS",

  "مكة": "MK",
  "مكة المكرمة": "MK",
  "أضم": "ADH",
  "الطائف": "TF",
  "القنفذة": "QN",
  "القوز": "QZ",
  "الليث": "LY",
  "تربة": "TRB",
  "جدة": "JD",
  "رنية": "RN",
  "ميسان": "MS",
  "الجموم": "JM",

  "نجران": "NJ",
  "يدمه": "YD",
  "حبونا": "HBN",
  "شرورة": "SR",
};

// =======================
// LOCATION SLUGS
// =======================
export const LOCATION_SLUGS = Object.fromEntries(
  Object.entries(LOCATION_CODES).map(([name, code]) => [
    name,
    {
      male: `${code}CTM`,
      female: `${code}CTF`,
    },
  ])
);

// =======================
// NORMALIZE
// =======================
export function normalizeArabic(str = "") {
  return String(str)
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

// =======================
// STRIP WORDS
// =======================
function stripCollegeWords(str = "") {
  return normalizeArabic(str)
    .replace(/الكليه|التقنيه|التقنية/g, "")
    .replace(/للبنين|للبنات|بنين|بنات/g, "")
    .replace(/المتقدمه|العالميه|الدوليه/g, "")
    .replace(/بمنطقه|بمنطقة|بمحافظه|بمحافظة|بمدينه|بمدينة/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// =======================
// GENDER DETECTION
// =======================
export function detectGenderFromText(text = "") {
  const normalized = normalizeArabic(text);

  if (normalized.includes("بنات")) return "female";
  if (normalized.includes("بنين")) return "male";

  return "";
}
export function detectGenderFromRows(rows = []) {
  if (!Array.isArray(rows) || !rows.length) return "";

  const textPool = rows
    .slice(0, 50)
    .map((row) =>
      [
        row?.["الوحدة"],
        row?.["القسم"],
        row?.["التخصص"],
      ]
        .filter(Boolean)
        .join(" ")
    )
    .join(" ");

  return detectGenderFromText(textPool);
}
export function detectCollegeTrackFromRows(rows = []) {
  if (!Array.isArray(rows) || !rows.length) return "";

  const textPool = rows
    .slice(0, 50)
    .map((row) =>
      [
        row?.["الوحدة"],
        row?.["القسم"],
        row?.["التخصص"],
      ]
        .filter(Boolean)
        .join(" ")
    )
    .join(" ");

  return detectCollegeTrackFromText(textPool);
}
// =======================
// TRACK DETECTION
// =======================
export function detectCollegeTrackFromText(text = "") {
  const n = normalizeArabic(text);

  if (n.includes("تطبيق")) return "TT";
  if (n.includes("سياحه") || n.includes("فندقه")) return "TO";
  if (n.includes("اتصالات") || n.includes("الكترون") || n.includes("رقمي"))
    return "IT";
  if (n.includes("غذاء") || n.includes("بيئه")) return "FE";

  return "";
}

// =======================
// RESOLVE LOCATION
// =======================
export function resolveLocationName(input = "") {
  const raw = String(input || "").trim();
  if (!raw) return "";

  const normalized = normalizeArabic(raw);
  const simplified = stripCollegeWords(raw);

  const keys = Object.keys(LOCATION_CODES);

  return (
    keys.find((k) => normalizeArabic(k) === normalized) ||
    keys.find((k) => normalizeArabic(k) === simplified) ||
    keys.find((k) => normalized.includes(normalizeArabic(k))) ||
    ""
  );
}

// =======================
// RESOLVE CODE
// =======================
export function resolveLocationCode(input = "") {
  const key = resolveLocationName(input);
  return key ? LOCATION_CODES[key] : "";
}

// =======================
// RESOLVE SLUG
// =======================
export function resolveLocationSlug(input = "", gender = "") {
  const key = resolveLocationName(input);
  if (!key) return "";

  const slugEntry = LOCATION_SLUGS[key];
  if (!slugEntry) return "";

  const resolvedGender =
    gender || detectGenderFromText(input) || "male";

  return slugEntry[resolvedGender] || slugEntry.male;
}

// =======================
// GENERATE LINK
// =======================
export function generateTraineeLink(locationName = "", gender = "") {
  const slug = resolveLocationSlug(locationName, gender);

  if (!slug) {
    console.warn("Slug not found:", locationName);
    return "";
  }

  return `https://exam-tvtc.onrender.com/#/${slug}`;
}
