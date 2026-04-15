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

function normalizeArabic(str = "") {
  return str
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .trim();
}

export function generateTraineeLink(traineeId, locationName) {
  if (!traineeId || !locationName) return "";

  const normalizedInput = normalizeArabic(locationName);

  const matchKey = Object.keys(LOCATION_CODES).find(
    (key) => normalizeArabic(key) === normalizedInput
  );

  if (!matchKey) {
    console.warn("Location not found:", locationName);
    return "";
  }

  const code = LOCATION_CODES[matchKey];

  return `https://exam-tvtc.onrender.com/trainee/${code}/${traineeId}`;
}
