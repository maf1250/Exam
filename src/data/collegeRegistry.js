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
  "المزاحمية": "MZ",
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
  "الجعيمة": "JH",
  "الخبر": "KR",

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
  CT: "CT", // الكلية التقنية
  TT: "TT", // الكلية التطبيقية
  TO: "TO", // السياحة والفندقة
  CE: "CE", // المعلومات والإلكترونيات
  FE: "FE", // علوم الغذاء والبيئة
  RL: "RL", // الملكي
  PN: "PN", // السجن
  AR: "AR", // التشييد
  CI: "CI", // الاتصالات والمعلومات 
  MI: "MI", // العسكري
  HI: "HI", // الثانوي الصناعي
  IN: "IN", // الكليات العالمية
  DG: "DG", // الرقمية 


};
export const TRACK_OPTIONS = [
  { value: "CT", label: "كلية تقنية" },
  { value: "TT", label: "كلية تطبيقية" },
  { value: "TO", label: "سياحة وفندقة" },
  { value: "CE", label: "اتصالات وإلكترونيات" },
  { value: "CI", label: "اتصالات ومعلومات" },
  { value: "FE", label: "علوم الغذاء والبيئة" },
  { value: "DG", label: "كلية رقمية" },
  { value: "IN", label: "كليات عالمية" },
   { value: "RL", label: "معهد ملكي" },
  { value: "PN", label: "معهد سجن" },
  { value: "AR", label: "معهد عمارة وتشييد" },
  { value: "MI", label: "معهد عسكري" },
  { value: "HI", label: "معهد ثانوي صناعي" },
];
// =======================
// LOCATION SLUGS
// =======================
export const LOCATION_SLUGS = Object.fromEntries(
  Object.entries(LOCATION_CODES).map(([name, code]) => [
    name,
    {
      male: {
        IN: `${code}INM`,
        TT: `${code}TTM`,
        TO: `${code}TOM`,
        RL: `${code}RLM`,
        FE: `${code}FEM`,
        PN: `${code}PNM`,
        AR: `${code}ARM`,
        MI: `${code}MIM`,
        HI: `${code}HIM`,
        DG: `${code}DGM`,
        CI: `${code}CIM`,
        CE: `${code}CEM`,
        CT: `${code}CTM`,

      },
      female: {
        IN: `${code}INF`,
        DG: `${code}DGF`,
        CI: `${code}CIF`,
        CE: `${code}CEF`,
        TT: `${code}TTF`,
        TO: `${code}TOF`,
        RL: `${code}RLF`,
        FE: `${code}FEF`,
        PN: `${code}PNF`,
        AR: `${code}ARF`,
        MI: `${code}MIF`,
        HI: `${code}HIF`,
        CT: `${code}CTF`,
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
// HELPERS
// =======================
function stripCollegeWords(str = "") {
  return normalizeArabic(str)
    .replace(/^[\s\-_,.]+|[\s\-_,.]+$/g, "")
    .replace(/الكليه/g, "")
    .replace(/الكليات/g, "")
    .replace(/للبنين/g, "")
    .replace(/للبنات/g, "")
    .replace(/بنين/g, "")
    .replace(/بنات/g, "")
    .replace(/رجال/g, "")
    .replace(/نساء/g, "")
    .replace(/المتقدمه/g, "")
    .replace(/العالميه/g, "")
    .replace(/الدوليه/g, "")
    .replace(/بمنطقه/g, "")
    .replace(/بمحافظه/g, "")
    .replace(/بمدينه/g, "")
    .replace(/بمدينة/g, "")
    .replace(/بمنطقة/g, "")
    .replace(/بمحافظة/g, "")
    .replace(/في منطقه/g, "")
    .replace(/في محافظة/g, "")
    .replace(/في مدينة/g, "")
    .replace(/فرع/g, "")
    .replace(/بفرع/g, "")
    .replace(/\bبال(?=\S)/g, "ال")
    .replace(/\bب(?=ال)/g, "")
    .replace(/التقنيه/g, "")
    .replace(/التقنية/g, "")
    .replace(/تقنيه/g, "")
    .replace(/تقنية/g, "")
    .replace(/التطبيقية/g, "")
    .replace(/التطبيقيه/g, "")
    .replace(/تطبيقية/g, "")
    .replace(/تطبيقيه/g, "")
    .replace(/السياحة/g, "")
    .replace(/سياحه/g, "")
    .replace(/الفندقة/g, "")
    .replace(/فندقه/g, "")
    .replace(/الاتصالات/g, "")
    .replace(/اتصالات/g, "")
    .replace(/المعلومات/g, "")
    .replace(/معلومات/g, "")
    .replace(/الإلكترونيات/g, "")
    .replace(/الالكترونيات/g, "")
    .replace(/إلكترونيات/g, "")
    .replace(/الكترونيات/g, "")
    .replace(/الرقمية/g, "")
    .replace(/الرقميه/g, "")
    .replace(/رقمية/g, "")
    .replace(/رقميه/g, "")
    .replace(/الغذاء/g, "")
    .replace(/غذاء/g, "")
    .replace(/البيئة/g, "")
    .replace(/البيئه/g, "")
    .replace(/بيئة/g, "")
    .replace(/بيئه/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getLocationAliases(name = "") {
  const normalized = normalizeArabic(name);
  const withoutAl = normalized.replace(/^ال/, "");
  const withAl = withoutAl ? `ال${withoutAl}` : normalized;

  return Array.from(new Set([normalized, withoutAl, withAl].filter(Boolean)));
}

function normalizeTrackInput(track = "") {
  const value = String(track || "").trim().toUpperCase();
  if (TRACK_CODES[value]) return value;
  return "";
}

// =======================
// GENDER DETECTION
// =======================
export function detectGenderFromText(text = "") {
  const normalized = normalizeArabic(text);

  if (normalized.includes("للبنات") || normalized.includes("بنات")) {
    return "female";
  }

  if (normalized.includes("للبنين") || normalized.includes("بنين")) {
    return "male";
  }

  return "";
}

export function detectGenderFromRows(rows = []) {
  if (!Array.isArray(rows) || !rows.length) return "";

  const textPool = rows
    .slice(0, 50)
    .map((row) =>
      [row?.["الوحدة"], row?.["القسم"], row?.["التخصص"]]
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
    normalized.includes("العالمية") ||
    normalized.includes("عالميه") ||
    normalized.includes("العالميه") ||
    normalized.includes("التقنية العالمية") ||
    normalized.includes("تقنيه عالميه") ||
    normalized.includes("التقنيه العالميه") ||
    normalized.includes("عالمية")
  ) {
    return "IN";
  }
  if (
    normalized.includes("التطبيقية") ||
    normalized.includes("التطبيقيه") ||
    normalized.includes("تطبيقية") ||
    normalized.includes("تطبيقيه")
  ) {
    return "TT";
  }

  if (
    normalized.includes("السياحة") ||
    normalized.includes("سياحه") ||
    normalized.includes("الفندقة") ||
    normalized.includes("فندقه")
  ) {
    return "TO";
  }

  if (
    normalized.includes("إلكترون") ||
    normalized.includes("الكترون") ||
    normalized.includes("الإلكترونيات") ||
    normalized.includes("الالكترونيات") ||
    normalized.includes("إلكترونيات") ||
    normalized.includes("الكترونيات") 

  ) {
    return "CE";
  }

if (
    normalized.includes("المعلومات") ||
    normalized.includes("معلومات") 

  ) {
    return "CI";
  }
  if (

    normalized.includes("الرقمية") ||
    normalized.includes("الرقميه") ||
    normalized.includes("رقمية") ||
    normalized.includes("رقميه")
  ) {
    return "DG";
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


  if (
    normalized.includes("التقنية") ||
    normalized.includes("التقنيه") ||
    normalized.includes("تقنية") ||
    normalized.includes("تقنيه")
  ) {
    return "CT";
  }

if (
    normalized.includes("صناعية") ||
    normalized.includes("صناعي") ||
    normalized.includes("ثانوية") ||
    normalized.includes("الصناعي") ||
    normalized.includes("الثانوي") ||
    normalized.includes("ثانوي")
  ) {
    return "HI";
  }
  
  if (
    normalized.includes("عسكري") ||
    normalized.includes("عسكرية") ||
    normalized.includes("مهني") ||
    normalized.includes("العسكري") ||
    normalized.includes("المهني") ||
    normalized.includes("مهنية")
  ) {
    return "MI";
  }
  
  if (
    normalized.includes("عمارة") ||
    normalized.includes("عماره") ||
    normalized.includes("تشييد") ||
    normalized.includes("التشييد")
  ) {
    return "AR";
  }
  
  if (
    normalized.includes("السجون") ||
    normalized.includes("السجن") ||
    normalized.includes("سجون") ||
    normalized.includes("إصلاحية") ||
    normalized.includes("اصلاحية") ||
    normalized.includes("سجن")
  ) {
    return "PN";
  }
  
  if (
    normalized.includes("الملكي") ||
    normalized.includes("ملكي") 

  ) {
    return "RL";
  }
  
  return "";
}

export function detectCollegeTrackFromRows(rows = []) {
  if (!Array.isArray(rows) || !rows.length) return "";

  const textPool = rows
    .slice(0, 50)
    .map((row) =>
      [row?.["الوحدة"], row?.["القسم"], row?.["التخصص"]]
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
  const rawTokens = normalizedRaw.split(" ").filter(Boolean);
  const simplifiedTokens = simplifiedRaw.split(" ").filter(Boolean);

  const exactMatch = Object.keys(LOCATION_CODES).find((key) =>
    getLocationAliases(key).includes(normalizedRaw)
  );
  if (exactMatch) return exactMatch;

  const simplifiedMatch = Object.keys(LOCATION_CODES).find((key) =>
    getLocationAliases(key).includes(simplifiedRaw)
  );
  if (simplifiedMatch) return simplifiedMatch;

  const containsMatch = Object.keys(LOCATION_CODES).find((key) => {
    const aliases = getLocationAliases(key);
    return aliases.some(
      (alias) => normalizedRaw.includes(alias) || simplifiedRaw.includes(alias)
    );
  });
  if (containsMatch) return containsMatch;

  const tokenMatch = Object.keys(LOCATION_CODES).find((key) => {
    const aliases = getLocationAliases(key);

    return aliases.some((alias) => {
      const aliasTokens = alias.split(" ").filter(Boolean);
      return aliasTokens.every(
        (token) => rawTokens.includes(token) || simplifiedTokens.includes(token)
      );
    });
  });
  if (tokenMatch) return tokenMatch;

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
  const detectedFromText = detectCollegeTrackFromText(text);
  if (detectedFromText) return detectedFromText;

  const normalizedTrack = normalizeTrackInput(track);
  if (normalizedTrack) return normalizedTrack;

  return "CT";
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

  const resolvedTrack = resolveTrackCode(locationOrCollegeName, track);

  return (
    slugEntry?.[resolvedGender]?.[resolvedTrack] ||
    slugEntry?.male?.CT ||
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
