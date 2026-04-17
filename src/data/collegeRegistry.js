// =======================
// LOCATION CODES
// =======================
export const LOCATION_CODES = {
  // القصيم
  "القصيم": "QS",

  // الباحة
  "الباحة": "BA",
  "المخواة": "MW",
  "المندق": "MN",
  "بلجرشي": "BJ",

  // الجوف
  "الجوف": "JF",
  "دومة الجندل": "DJ",
  "طبرجل": "TJ",
  "القريات": "QR",

  // الحدود الشمالية
  "رفحاء": "RF",
  "عرعر": "AR",
  "طريف": "TR",

  // الرياض
  "الرياض": "RY",
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

  // الشرقية
  "الأحساء": "AH",
  "الدمام": "DM",
  "القطيف": "QT",
  "حفر الباطن": "HF",

  // القصيم
  "بريدة": "BR",
  "الأسياح": "AY",
  "الرس": "RS",
  "المذنب": "MDH",
  "عنيزة": "UN",
  "البدائع": "BD",
  "رياض الخبراء": "RK",

  // المدينة المنورة
  "المدينة المنورة": "MD",
  "الحناكية": "HK",
  "العلا": "UL",
  "العيص": "ES",
  "المهد": "MH",
  "بدر": "BDR",
  "خيبر": "KB",
  "ينبع": "YN",

  // تبوك
  "تبوك": "TB",
  "أملج": "AM",
  "حقل": "HQ",
  "الوجه": "WG",
  "تيماء": "TM",
  "ضباء": "DB",

  // جازان
  "جازان": "JZ",
  "أبو عريش": "ABR",
  "الدرب": "DR",
  "العارضة": "AD",
  "الداير": "DY",
  "صامطة": "SM",
  "العيدابي": "ED",
  "فرسان": "FR",

  // حائل
  "حائل": "HL",
  "الحائط": "HT",
  "الشنان": "SN",
  "بقعاء": "BQ",

  // عسير
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

  // مكة المكرمة
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

  // نجران
  "نجران": "NJ",
  "يدمه": "YD",
  "حبونا": "HBN",
  "شرورة": "SR",
};

// =======================
// TRACK CODES
// =======================
export const TRACK_CODES = {
  TT: "CT", // الكلية التطبيقية
  TO: "TO", // السياحة والفندقة
  IT: "IT", // الاتصالات والمعلومات والإلكترونيات
  FE: "FE", // علوم الغذاء والبيئة
};

// =======================
// LOCATION SLUGS
// صيغة السلق:
// - التطبيقية: RYCTM / RYCTF
// - السياحة والفندقة: RYTOM / RYTOF
// - الاتصالات والمعلومات والإلكترونيات: RYITM / RYITF
// - الغذاء والبيئة: RYFEM / RYFEF
// =======================
export const LOCATION_SLUGS = Object.fromEntries(
  Object.entries(LOCATION_CODES).map(([name, code]) => [
    name,
    {
      male: {
        TT: `${code}CTM`,
        TO: `${code}TOM`,
        IT: `${code}ITM`,
        FE: `${code}FEM`,
      },
      female: {
        TT: `${code}CTF`,
        TO: `${code}TOF`,
        IT: `${code}ITF`,
        FE: `${code}FEF`,
      },
    },
  ])
);

// =======================
// NORMALIZE
// =======================
export function normalizeArabic(str = "") {
  return String(str ?? "")
    .trim()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/أ|إ|آ/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ");
}

// =======================
// STRIP COMMON WORDS
// =======================
function stripCollegeWords(str = "") {
  return normalizeArabic(str)
    .replace(/الكليه/g, "")
    .replace(/التقنيه/g, "")
    .replace(/التقنية/g, "")
    .replace(/للبنين/g, "")
    .replace(/للبنات/g, "")
    .replace(/بنين/g, "")
    .replace(/بنات/g, "")
    .replace(/المتقدمه/g, "")
    .replace(/العالميه/g, "")
    .replace(/الدوليه/g, "")
    .replace(/بمنطقه/g, "")
    .replace(/بمنطقة/g, "")
    .replace(/بمحافظه/g, "")
    .replace(/بمحافظة/g, "")
    .replace(/بمدينه/g, "")
    .replace(/بمدينة/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// =======================
// GENDER DETECTION
// =======================
export function detectGenderFromText(text = "") {
  const normalized = normalizeArabic(text);

  if (
    normalized.includes("للبنات") ||
    normalized.includes("بنات")
  ) {
    return "female";
  }

  if (
    normalized.includes("للبنين") ||
    normalized.includes("بنين")
  ) {
    return "male";
  }

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

// =======================
// TRACK DETECTION
// =======================
export function detectCollegeTrackFromText(text = "") {
  const normalized = normalizeArabic(text);

  if (
    normalized.includes("التطبيقية") ||
    normalized.includes("تطبيقية") ||
    normalized.includes("التطبيقيه") ||
    normalized.includes("تطبيقيه")
  ) {
    return "TT";
  }

  if (
    normalized.includes("السياحة") ||
    normalized.includes("الفندقة") ||
    normalized.includes("سياحه") ||
    normalized.includes("فندقه")
  ) {
    return "TO";
  }

  if (
    normalized.includes("الاتصالات") ||
    normalized.includes("اتصالات") ||
    normalized.includes("المعلومات") ||
    normalized.includes("معلومات") ||
    normalized.includes("الإلكترونيات") ||
    normalized.includes("الالكترونيات") ||
    normalized.includes("إلكترونيات") ||
    normalized.includes("الكترونيات") ||
    normalized.includes("الرقمية") ||
    normalized.includes("الرقميه") ||
    normalized.includes("رقمية") ||
    normalized.includes("رقميه")
  ) {
    return "IT";
  }

  if (
    normalized.includes("الغذاء") ||
    normalized.includes("غذاء") ||
    normalized.includes("البيئة") ||
    normalized.includes("البيئه") ||
    normalized.includes("بيئة") ||
    normalized.includes("بيئه")
  ) {
    return "FE";
  }

  return "";
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
// LIST LOCATIONS
// =======================
export function getAllLocations() {
  return Object.keys(LOCATION_CODES).sort((a, b) =>
    a.localeCompare(b, "ar", { sensitivity: "base" })
  );
}

// =======================
// RESOLVE LOCATION NAME
// =======================
export function resolveLocationName(locationOrCollegeName = "") {
  const raw = String(locationOrCollegeName || "").trim();
  if (!raw) return "";

  const normalizedRaw = normalizeArabic(raw);
  const simplifiedRaw = stripCollegeWords(raw);

  const exactMatch = Object.keys(LOCATION_CODES).find(
    (key) => normalizeArabic(key) === normalizedRaw
  );
  if (exactMatch) return exactMatch;

  const simplifiedMatch = Object.keys(LOCATION_CODES).find(
    (key) => normalizeArabic(key) === simplifiedRaw
  );
  if (simplifiedMatch) return simplifiedMatch;

  const containsMatch = Object.keys(LOCATION_CODES).find((key) => {
    const normalizedKey = normalizeArabic(key);
    return (
      normalizedRaw.includes(normalizedKey) ||
      simplifiedRaw.includes(normalizedKey)
    );
  });
  if (containsMatch) return containsMatch;

  return "";
}

// =======================
// RESOLVE LOCATION CODE
// =======================
export function resolveLocationCode(locationOrCollegeName = "") {
  const matchKey = resolveLocationName(locationOrCollegeName);
  return matchKey ? LOCATION_CODES[matchKey] || "" : "";
}

// =======================
// RESOLVE TRACK CODE
// =======================
export function resolveTrackCode(text = "", track = "") {
  const resolvedTrack = track || detectCollegeTrackFromText(text) || "TT";
  return TRACK_CODES[resolvedTrack] || TRACK_CODES.TT;
}

// =======================
// RESOLVE LOCATION SLUG
// =======================
export function resolveLocationSlug(locationOrCollegeName = "", gender = "", track = "") {
  const matchKey = resolveLocationName(locationOrCollegeName);
  if (!matchKey) return "";

  const slugEntry = LOCATION_SLUGS[matchKey];
  if (!slugEntry) return "";

  const resolvedGender =
    gender || detectGenderFromText(locationOrCollegeName) || "male";

  const resolvedTrack =
    track || detectCollegeTrackFromText(locationOrCollegeName) || "TT";

  return (
    slugEntry?.[resolvedGender]?.[resolvedTrack] ||
    slugEntry?.male?.TT ||
    ""
  );
}

// =======================
// GENERATE TRAINEE LINK
// =======================
export function generateTraineeLink(locationOrCollegeName, gender = "", track = "") {
  if (!locationOrCollegeName) return "";

  const slug = resolveLocationSlug(locationOrCollegeName, gender, track);
  if (!slug) {
    console.warn("Location slug not found:", locationOrCollegeName, gender, track);
    return "";
  }

  return `https://exam-tvtc.onrender.com/#/${slug}`;
}
