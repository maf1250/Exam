export const STORAGE_KEY = "exam_scheduler_saved_state_v1";
export const LARGE_STORAGE_KEY = "exam_scheduler_saved_state_large_v1";
export const STORAGE_MODE_KEY = "exam_scheduler_storage_mode_v1";
export const DB_NAME = "exam_scheduler_db";
export const DB_VERSION = 1;
export const STORE_NAME = "sessions";

export const REQUIRED_COLUMNS = [
  "المقرر",
  "اسم المقرر",
  "المدرب",
  "رقم المتدرب",
  "إسم المتدرب",
  "نوع الجدولة",
  "حالة تسجيل",
  "حالة المتدرب",
  "القسم",
  "التخصص",
  "الوحدة",
];

export const DAY_OPTIONS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];

export const LEVEL_OPTIONS = [
  { value: "1", label: "المستوى الأول" },
  { value: "2", label: "المستوى الثاني" },
  { value: "3", label: "المستوى الثالث" },
  { value: "4", label: "المستوى الرابع" },
];

export const EXCLUDED_REGISTRATION = ["انسحاب فصلي", "مطوي قيده", "معتذر", "منسحب"];
export const EXCLUDED_TRAINEE = ["مطوي قيده", "انسحاب فصلي", "مطوي قيده لإنقطاع أسبوعين"];

export const COLORS = {
  primary: "#1FA7A8",
  primaryDark: "#147B83",
  primaryLight: "#E7F8F7",
  primaryBorder: "#A8DDDA",
  charcoal: "#2C3135",
  charcoalSoft: "#616971",
  text: "#1F2529",
  muted: "#6B7280",
  bg1: "#EAF7F6",
  bg2: "#F7FBFB",
  bg3: "#FFFFFF",
  card: "#FFFFFF",
  border: "#D7E7E6",
  success: "#067647",
  successBg: "#ECFDF3",
  warning: "#B54708",
  warningBg: "#FFF7ED",
  danger: "#B42318",
  dangerBg: "#FEF3F2",
};

export const LOGO_SRC = "/tvtc-logo.png";
