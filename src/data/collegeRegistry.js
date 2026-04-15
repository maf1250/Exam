export const LOCATION_CODES = {
  // مناطق
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

export function normalizeArabic(str = "") {
  return String(str)
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

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

export function getAllLocations() {
  return Object.keys(LOCATION_CODES).sort((a, b) => a.localeCompare(b, "ar"));
}

export function resolveLocationName(locationOrCollegeName = "") {
  const raw = String(locationOrCollegeName || "").trim();
  if (!raw) return "";

  const normalizedRaw = normalizeArabic(raw);
  const simplifiedRaw = stripCollegeWords(raw);

  // 1) تطابق مباشر
  const exactMatch = Object.keys(LOCATION_CODES).find(
    (key) => normalizeArabic(key) === normalizedRaw
  );
  if (exactMatch) return exactMatch;

  // 2) تطابق بعد إزالة كلمات الكلية التقنية ونحوها
  const simplifiedMatch = Object.keys(LOCATION_CODES).find(
    (key) => normalizeArabic(key) === simplifiedRaw
  );
  if (simplifiedMatch) return simplifiedMatch;

  // 3) البحث داخل اسم الكلية
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

export function resolveLocationCode(locationOrCollegeName = "") {
  const matchKey = resolveLocationName(locationOrCollegeName);
  return matchKey ? LOCATION_CODES[matchKey] : "";
}

export function generateTraineeLink(traineeId, locationOrCollegeName) {
  if (!traineeId || !locationOrCollegeName) return "";

  const code = resolveLocationCode(locationOrCollegeName);
  if (!code) {
    console.warn("Location not found:", locationOrCollegeName);
    return "";
  }

  return `https://exam-tvtc.onrender.com/trainee/${code}/${traineeId}`;
}
