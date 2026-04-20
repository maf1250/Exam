import React, { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import {
  generateTraineeLink,
  getAllLocations,
  resolveLocationName,
  resolveLocationSlug,
  detectGenderFromText,
  detectGenderFromRows,
} from "../data/collegeRegistry";
import { exportCollegeDataFile } from "../data/exportCollegeData";
const STORAGE_KEY = "exam_scheduler_saved_state_v1";
const LARGE_STORAGE_KEY = "exam_scheduler_saved_state_large_v1";
const STORAGE_MODE_KEY = "exam_scheduler_storage_mode_v1";
const DB_NAME = "exam_scheduler_db";
const DB_VERSION = 1;
const STORE_NAME = "sessions";


function CountUp({ end, duration = 1000 }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime = null;

    function animate(timestamp) {
      if (!startTime) startTime = timestamp;

      const progress = Math.min((timestamp - startTime) / duration, 1);
      const currentValue = Math.floor(progress * end);

      setCount(currentValue);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setCount(end);
      }
    }

    requestAnimationFrame(animate);
  }, [end, duration]);
return <span>{count.toLocaleString("en-US")}</span>;
}
function normalizeArabicLetters(value) {
  return String(value ?? "")
    .trim()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/أ|إ|آ/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeCollegeName(value) {
  const stopWords = new Set([
    "الكليه",
    "كليه",
    "كلية",
    "الكلية",
    "التقنيه",
    "تقنيه",
    "التقنية",
    "تقنية",
    "للبنين",
    "للبنات",
    "بنين",
    "بنات",
  ]);

  return normalizeArabicLetters(value)
    .split(" ")
    .map((word) => word.trim())
    .filter(Boolean)
    .map((word) => {
      // بعنيزة -> عنيزه
      if (word.startsWith("ب") && word.length > 2) {
        const stripped = word.slice(1);
        if (stripped) return stripped;
      }
      return word;
    })
    .filter((word) => !stopWords.has(word));
}

function simplifyCollegeName(value) {
  return tokenizeCollegeName(value).join(" ");
}

function areCollegeNamesClose(manualName, fileName) {
  const manualTokens = tokenizeCollegeName(manualName);
  const fileTokens = tokenizeCollegeName(fileName);

  if (!manualTokens.length || !fileTokens.length) return false;

  const a = manualTokens.join(" ");
  const b = fileTokens.join(" ");

  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;

  const setA = new Set(manualTokens);
  const setB = new Set(fileTokens);

  let overlap = 0;
  for (const token of setA) {
    if (setB.has(token)) overlap += 1;
  }

  return overlap > 0;
}

function openAppDb() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("تعذر فتح قاعدة البيانات المحلية"));
  });
}

async function saveStateToIndexedDb(key, value) {
  const db = await openAppDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("تعذر حفظ البيانات الكبيرة"));
    tx.onabort = () => reject(tx.error || new Error("تم إلغاء حفظ البيانات الكبيرة"));
  });
  db.close();
}

async function loadStateFromIndexedDb(key) {
  const db = await openAppDb();
  const result = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("تعذر قراءة البيانات الكبيرة"));
  });
  db.close();
  return result;
}

async function removeStateFromIndexedDb(key) {
  const db = await openAppDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("تعذر حذف البيانات الكبيرة"));
    tx.onabort = () => reject(tx.error || new Error("تم إلغاء حذف البيانات الكبيرة"));
  });
  db.close();
}

const REQUIRED_COLUMNS = [
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

const DAY_OPTIONS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];

const LEVEL_OPTIONS = [
  { value: "1", label: "المستوى الأول" },
  { value: "2", label: "المستوى الثاني" },
  { value: "3", label: "المستوى الثالث" },
  { value: "4", label: "المستوى الرابع" },
];

const EXCLUDED_REGISTRATION = ["انسحاب فصلي", "مطوي قيده", "معتذر", "منسحب"];
const EXCLUDED_TRAINEE = ["مطوي قيده", "انسحاب فصلي", "مطوي قيده لإنقطاع أسبوعين"];

const COLORS = {
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

const LOGO_SRC = "/tvtc-logo.png";
function getSlotPeriodKey(itemOrSlot) {
  return `${itemOrSlot.dateISO}__${itemOrSlot.period}`;
}

function getCourseDepartmentRoots(course) {
  const values = [
    ...splitBySlash(course.department),
    ...splitBySlash(course.sectionName),
    ...splitBySlash(course.major),
  ];

  return Array.from(
    new Set(values.map((v) => normalizeArabic(v)).filter(Boolean))
  );
}
function normalizeArabic(value) {
  return String(value ?? "")
    .trim()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/أ|إ|آ/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ");
}

function getCourseStudentStatusKey(courseKey, studentId) {
  return `${String(courseKey || "").trim()}__${String(studentId || "").trim()}`;
}

function isDeprivationRegistrationStatus(status) {
  const normalized = normalizeArabic(String(status || "").trim());
  return normalized.includes("حرمان");
}

function getScheduleItemDeprivationStatus(item, studentId, deprivationMap) {
  if (!item || !studentId || !(deprivationMap instanceof Map)) return "";

  const direct = String(
    item?.deprivationStatus ||
      item?.registrationStatus ||
      item?.traineeRegistrationStatus ||
      ""
  ).trim();
  if (isDeprivationRegistrationStatus(direct)) return direct;

  const courseKey = String(item?.key || item?.courseKey || "").trim();
  if (!courseKey) return "";

  const mapped = String(
    deprivationMap.get(getCourseStudentStatusKey(courseKey, studentId)) || ""
  ).trim();

  return isDeprivationRegistrationStatus(mapped) ? mapped : "";
}

function enrichScheduleItemForStudent(item, studentId, deprivationMap) {
  const deprivationStatus = getScheduleItemDeprivationStatus(item, studentId, deprivationMap);

  return {
    ...item,
    deprivationStatus,
    isDeprived: Boolean(deprivationStatus),
  };
}

function getScheduleStudentIds(item) {
  return Array.isArray(item?.students)
    ? item.students
    : Array.from(item?.students || []);
}

function getStudentCourseRowKey(courseCode, courseName) {
  return [normalizeArabic(courseCode), normalizeArabic(courseName)].join("|");
}

function compareStudentScheduleEntries(a, b) {
  const hasDateA = Boolean(String(a?.dateISO || a?.gregorian || "").trim());
  const hasDateB = Boolean(String(b?.dateISO || b?.gregorian || "").trim());

  if (hasDateA !== hasDateB) return hasDateA ? -1 : 1;

  const dateA = String(a?.dateISO || a?.gregorian || "9999-99-99");
  const dateB = String(b?.dateISO || b?.gregorian || "9999-99-99");
  if (dateA !== dateB) return dateA.localeCompare(dateB, "ar");

  const periodA = Number(a?.period) || 0;
  const periodB = Number(b?.period) || 0;
  if (periodA !== periodB) return periodA - periodB;

  return String(a?.courseName || "").localeCompare(String(b?.courseName || ""), "ar");
}

function buildStudentScheduleEntries({ rows, combinedSchedule, studentId, deprivationMap }) {
  const cleanStudentId = String(studentId || "").trim();
  if (!cleanStudentId) return [];

  const scheduleLookup = new Map();

  (Array.isArray(combinedSchedule) ? combinedSchedule : []).forEach((item) => {
    const studentIds = getScheduleStudentIds(item).map((value) => String(value).trim());
    const scheduledForStudent = studentIds.includes(cleanStudentId);
    if (!scheduledForStudent) return;

    const enrichedItem = enrichScheduleItemForStudent(item, cleanStudentId, deprivationMap);
    const rowKey = getStudentCourseRowKey(item?.courseCode || "", item?.courseName || "");
    if (!rowKey) return;

    const existing = scheduleLookup.get(rowKey);
    if (!existing) {
      scheduleLookup.set(rowKey, enrichedItem);
      return;
    }

    const existingHasDate = Boolean(String(existing?.dateISO || existing?.gregorian || "").trim());
    const nextHasDate = Boolean(String(enrichedItem?.dateISO || enrichedItem?.gregorian || "").trim());

    if (!existingHasDate && nextHasDate) {
      scheduleLookup.set(rowKey, enrichedItem);
    }
  });

  const resultMap = new Map();

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const rowStudentId = String(row?.["رقم المتدرب"] ?? "").trim();
    if (rowStudentId !== cleanStudentId) return;

    const courseCode = String(row?.["المقرر"] ?? "").trim();
    const courseName = String(row?.["اسم المقرر"] ?? "").trim();
    if (!courseCode && !courseName) return;

    const registrationStatus = String(row?.["حالة تسجيل"] ?? "").trim();
    const rowKey = getStudentCourseRowKey(courseCode, courseName);
    const scheduledItem = scheduleLookup.get(rowKey);
    const deprivationStatus = isDeprivationRegistrationStatus(registrationStatus)
      ? registrationStatus
      : String(scheduledItem?.deprivationStatus || "").trim();

    if (!scheduledItem && !deprivationStatus) return;

    const entry = {
      ...(scheduledItem || {}),
      courseName: scheduledItem?.courseName || courseName,
      courseCode: scheduledItem?.courseCode || courseCode,
      department: scheduledItem?.department || String(row?.["القسم"] ?? "").trim(),
      major: scheduledItem?.major || String(row?.["التخصص"] ?? "").trim(),
      dayName: scheduledItem?.dayName || "",
      gregorian: scheduledItem?.gregorian || "",
      hijriNumeric: scheduledItem?.hijriNumeric || "",
      dateISO: scheduledItem?.dateISO || "",
      period: scheduledItem?.period || "",
      timeText: scheduledItem?.timeText || "",
      examHall: scheduledItem?.examHall || "",
      deprivationStatus,
      registrationStatus: deprivationStatus || registrationStatus,
      isDeprived: Boolean(deprivationStatus),
    };

    const uniqueKey = [
      rowKey,
      String(entry?.dateISO || entry?.gregorian || ""),
      String(entry?.period || ""),
    ].join("__");

    if (!resultMap.has(uniqueKey)) {
      resultMap.set(uniqueKey, entry);
    } else {
      const existing = resultMap.get(uniqueKey);
      if (!existing?.deprivationStatus && entry.deprivationStatus) {
        resultMap.set(uniqueKey, entry);
      }
    }
  });

  scheduleLookup.forEach((item, rowKey) => {
    const uniqueKey = [
      rowKey,
      String(item?.dateISO || item?.gregorian || ""),
      String(item?.period || ""),
    ].join("__");

    if (!resultMap.has(uniqueKey)) {
      resultMap.set(uniqueKey, item);
    }
  });

  return Array.from(resultMap.values()).sort(compareStudentScheduleEntries);
}


function formatGregorian(date) {
  return new Intl.DateTimeFormat("ar-SA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatHijri(date) {
  return new Intl.DateTimeFormat("ar-SA-u-ca-islamic", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatHijriNumeric(date) {
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

function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseTimeToMinutes(time) {
  const match = String(time || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function minutesToTimeText(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const PERIOD_DURATION_OPTIONS = [60, 75, 90, 120, 150, 180];

function generatePeriodTimeOptions() {
  const times = [];
  for (let h = 6; h <= 20; h += 1) {
    for (const m of [0, 15, 30, 45]) {
      times.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return times;
}

const PERIOD_TIME_OPTIONS = generatePeriodTimeOptions();

function getDefaultPeriodConfigs() {
  return [
    { start: "07:45", duration: 75, enabled: true },
    { start: "09:15", duration: 105, enabled: true },
    { start: "11:15", duration: 105, enabled: false },
  ];
}

function serializePeriodConfigsToText(periodConfigs) {
  return (Array.isArray(periodConfigs) ? periodConfigs : [])
    .map((item) => {
      if (item?.enabled === false) return "";
      const startMinutes = parseTimeToMinutes(item?.start);
      const duration = Number(item?.duration);
      if (startMinutes === null || !Number.isFinite(duration) || duration <= 0) return "";
      return `${minutesToTimeText(startMinutes)}-${minutesToTimeText(startMinutes + duration)}`;
    })
    .filter(Boolean)
    .join("\n");
}

function parsePeriodsTextToConfigs(periodsText) {
  const defaults = getDefaultPeriodConfigs();
  const parsed = parsePeriodsText(periodsText).filter((item) => item.valid);
  if (!parsed.length) return defaults;
  return defaults.map((item, index) => {
    const parsedItem = parsed[index];
    if (!parsedItem) return { ...item, enabled: false };
    return {
      start: minutesToTimeText(parsedItem.startMinutes),
      duration: parsedItem.endMinutes - parsedItem.startMinutes,
      enabled: true,
    };
  });
}

function parsePeriodsText(periodsText) {
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

function buildSlots({ startDate, numberOfDays, selectedDays, parsedPeriods }) {
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

function rowsToCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((row) => headers.map((h) => esc(row[h])).join(","))].join("\n");
}

function sanitizeDownloadFilename(filename, fallback = "file") {
  return String(filename || fallback)
    .replace(/[\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim() || fallback;
}

function getTodayFileStamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function downloadFile(filename, content, mime) {
  const safeFilename = sanitizeDownloadFilename(filename);
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeFilename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 150);
}

function splitBySlash(value) {
  return String(value ?? "")
    .split("/")
    .map((x) => x.trim())
    .filter(Boolean);
}

function makeHallId() {
  return `hall_${Math.random().toString(36).slice(2, 10)}`;
}

function makeCourseGroupId() {
  return `course_group_${Math.random().toString(36).slice(2, 10)}`;
}

function makeScheduledInstanceId() {
  return `scheduled_${Math.random().toString(36).slice(2, 12)}`;
}

function normalizeDepartmentList(list) {
  return Array.from(
    new Set(
      (Array.isArray(list) ? list : [])
        .map((x) => normalizeArabic(x))
        .filter(Boolean)
    )
  );
}

function isHallAllowedForCourse(hall, course) {
  if (!hall) return false;
  if (hall.allowAllDepartments) return true;

  const allowed = normalizeDepartmentList(hall.allowedDepartments || []);
  if (!allowed.length) return true;

  const roots = Array.isArray(course?.departmentRoots)
    ? normalizeDepartmentList(course.departmentRoots)
    : normalizeDepartmentList(getCourseDepartmentRoots(course));

  return roots.some((root) => allowed.includes(root));
}

function isHallValidForCourse(hall, course) {
  if (!hall || !course) return false;

  const capacity = Number(hall.capacity);
  const students = Number(course.studentCount);

  if (!Number.isFinite(capacity) || capacity <= 0) return false;
  if (!Number.isFinite(students) || students <= 0) return false;
  if (capacity < students) return false;

  return isHallAllowedForCourse(hall, course);
}

function getMaxAllowedHallCapacity(halls, course) {
  const allowedHalls = (Array.isArray(halls) ? halls : []).filter((hall) =>
    isHallAllowedForCourse(hall, course)
  );

  if (!allowedHalls.length) return 0;

  const maxCapacity = Math.max(
    ...allowedHalls.map((hall) => {
      const cap = Number(hall.capacity);
      return Number.isFinite(cap) ? cap : 0;
    })
  );

  return Number.isFinite(maxCapacity) ? maxCapacity : 0;
}
function getEffectiveAssignableHallCapacityForSlot(hall, course, slotOrItem, hallUsageMap) {
  if (!hall || !course) return 0;
  if (!isHallAllowedForCourse(hall, course)) return 0;

  const hallCapacity = Number(hall?.capacity);
  if (!Number.isFinite(hallCapacity) || hallCapacity <= 0) return 0;

  const requiredSeats = Number(course?.studentCount) || 0;
  const used = hallUsageMap.get(getHallUsageKey(slotOrItem, hall)) || 0;
  const rawRemaining = hallCapacity - used;
  const remainingBeforeConstraint = Math.max(0, rawRemaining);
  const computedRemaining = hall.allowSharedAssignments
    ? remainingBeforeConstraint
    : (used > 0 ? 0 : hallCapacity);
  const canFitSingleHall = computedRemaining >= requiredSeats;



  return computedRemaining;
}

function getMaxRemainingAllowedHallCapacityForSlot(halls, course, slotOrItem, hallUsageMap) {
  const allowedHalls = (Array.isArray(halls) ? halls : []).filter((hall) =>
    isHallAllowedForCourse(hall, course)
  );

  if (!allowedHalls.length) return 0;

  const maxRemaining = Math.max(
    ...allowedHalls.map((hall) =>
      getEffectiveAssignableHallCapacityForSlot(hall, course, slotOrItem, hallUsageMap)
    )
  );

  return Number.isFinite(maxRemaining) ? maxRemaining : 0;
}
function normalizeExamHallsInput(examHalls) {
  return (examHalls || [])
    .map((hall) => {
      const cap = Number(hall.capacity);

      return {
        ...hall,
        name: String(hall.name || "").trim(),
        capacity: Number.isFinite(cap) ? cap : 0,
        allowedDepartments: normalizeDepartmentList(hall.allowedDepartments),
        allowSharedAssignments: Boolean(hall.allowSharedAssignments),
      };
    })
    .filter((hall) => hall.name && hall.capacity > 0);
}

function getHallIdentity(hallOrName) {
  if (hallOrName && typeof hallOrName === "object") {
    const hallId = String(hallOrName.id || "").trim();
    if (hallId) return `id:${hallId}`;
    return `name:${normalizeArabic(hallOrName.name || "")}`;
  }

  return `name:${normalizeArabic(hallOrName || "")}`;
}

function getHallUsageKey(slotOrItem, hallOrName) {
  return `${getSlotPeriodKey(slotOrItem)}__${getHallIdentity(hallOrName)}`;
}

function getRemainingHallCapacityForSlot(hall, slotOrItem, hallUsageMap) {
  const hallCapacity = Number(hall?.capacity);
  if (!Number.isFinite(hallCapacity) || hallCapacity <= 0) return 0;

  const used = hallUsageMap.get(getHallUsageKey(slotOrItem, hall)) || 0;
  return Math.max(0, hallCapacity - used);
}

function canAssignHallToCourseInSlot(hall, course, slotOrItem, hallUsageMap) {
  if (!hall || !course) return false;
  if (!isHallAllowedForCourse(hall, course)) return false;

  const students = Number(course.studentCount);
  if (!Number.isFinite(students) || students <= 0) return false;

  if (hall.allowSharedAssignments) {
    return getRemainingHallCapacityForSlot(hall, slotOrItem, hallUsageMap) >= students;
  }

  const alreadyUsed = (hallUsageMap.get(getHallUsageKey(slotOrItem, hall)) || 0) > 0;
  if (alreadyUsed) return false;

  return Number(hall.capacity) >= students;
}

function reserveHallForCourseInSlot(hall, course, slotOrItem, hallUsageMap) {
  const students = Number(course?.studentCount) || 0;
  const key = getHallUsageKey(slotOrItem, hall);
  hallUsageMap.set(key, (hallUsageMap.get(key) || 0) + students);
}

function reserveSeatsInHallForSlot(hall, slotOrItem, hallUsageMap, seats) {
  const seatCount = Number(seats) || 0;
  if (!hall || seatCount <= 0) return;
  const key = getHallUsageKey(slotOrItem, hall);
  hallUsageMap.set(key, (hallUsageMap.get(key) || 0) + seatCount);
}

function getScheduledItemHallAssignments(item) {
  if (Array.isArray(item?.examHallAssignments) && item.examHallAssignments.length) {
    return item.examHallAssignments
      .map((entry) => ({
        hallName: String(entry?.hallName || entry?.name || "").trim(),
        seats: Number(entry?.seats) || 0,
      }))
      .filter((entry) => entry.hallName && entry.seats > 0);
  }

  const fallbackHall = String(item?.examHall || "").trim();
  const fallbackSeats = Number(item?.studentCount) || 0;
  if (!fallbackHall || fallbackSeats <= 0) return [];
  return [{ hallName: fallbackHall, seats: fallbackSeats }];
}

function fieldStyle() {
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

function toggleDay(list, day) {
  return list.includes(day) ? list.filter((d) => d !== day) : [...list, day];
}

function cardButtonStyle({ active = false, disabled = false, danger = false } = {}) {
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
    border = `1px solid #FECACA`;
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

function StepButton({ active, done, children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: `1px solid ${active ? COLORS.primaryDark : done ? COLORS.primaryBorder : COLORS.border}`,
        background: active ? COLORS.primaryDark : done ? COLORS.primaryLight : "#fff",
        color: active ? "#fff" : done ? COLORS.primaryDark : COLORS.charcoalSoft,
        borderRadius: 999,
        padding: "12px 18px",
        fontWeight: 800,
        cursor: "pointer",
        boxShadow: active ? "0 8px 18px rgba(20,123,131,0.18)" : "none",
      }}
    >
      {children}
    </button>
  );
}

function Card({ children, style }) {
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

function SectionHeader({ title, description }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 24, fontWeight: 900, color: COLORS.charcoal }}>{title}</div>
      {description ? (
        <div style={{ color: COLORS.muted, marginTop: 6, lineHeight: 1.8 }}>{description}</div>
      ) : null}
    </div>
  );
}
function TooltipIcon({ text }) {
  return (
    <div
      title={text}
      style={{
        width: 22,
        height: 22,
        borderRadius: "50%",
        background: "#EEF6F6",
        border: "1px solid #A8DDDA",
        color: "#0E2730",
        fontWeight: 900,
        fontSize: 13,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "help",
        userSelect: "none",
        flex: "0 0 auto",
      }}
    >
      ?
    </div>
  );
}

function Switch({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      style={{
        width: 56,
        height: 32,
        borderRadius: 999,
        border: `1px solid ${checked ? COLORS.primaryDark : COLORS.border}`,
        background: checked ? COLORS.primaryDark : "#E5E7EB",
        position: "relative",
        cursor: "pointer",
        transition: "all 180ms ease",
        padding: 0,
        flex: "0 0 auto",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          insetInlineStart: checked ? 27 : 3,
          width: 24,
          height: 24,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
          transition: "all 180ms ease",
        }}
      />
    </button>
  );
}
function StatBox({ label, value }) {
  return (
    <div
      style={{
        borderRadius: 22,
        padding: 18,
        width: 130,
        background: "#fff",
        flexWrap: "wrap",
        boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
      }}
    >
      <div
        style={{
          fontSize: 14,
          color: COLORS.charcoalSoft,
          marginBottom: 8,
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize: 28,
          fontWeight: 900,
          color: COLORS.primaryDark,
        }}
      >
        <CountUp end={value} />
      </div>
    </div>
  );
}

function Toast({ item, onClose, onRestore }) {
  if (!item) return null;

  const bg =
    item.type === "error" ? COLORS.dangerBg : item.type === "warning" ? COLORS.warningBg : COLORS.successBg;
  const color =
    item.type === "error" ? COLORS.danger : item.type === "warning" ? COLORS.warning : COLORS.success;

  return (
    <div
      style={{
        position: "fixed",
        top: 20,
        right: 20,
        zIndex: 9999,
        width: "min(380px, calc(100vw - 32px))",
        background: bg,
        border: "1px solid rgba(0,0,0,0.08)",
        color,
        borderRadius: 18,
        padding: 16,
        boxShadow: "0 16px 35px rgba(20, 123, 131, 0.16)",
      }}
    >
      <div style={{ fontWeight: 800, marginBottom: 6 }}>{item.title}</div>
      <div style={{ fontSize: 14, lineHeight: 1.7 }}>{item.description}</div>

      <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
        {item.type === "warning" && item.action === "restore_session" && onRestore ? (
          <button
            onClick={onRestore}
            style={{
              background: "transparent",
              border: "none",
              color,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            استرجاع
          </button>
        ) : null}

        {Array.isArray(item.actions)
          ? item.actions.map((action, index) => (
              <button
                key={`${action.label || "action"}-${index}`}
                onClick={action.onClick}
                style={{
                  background: "transparent",
                  border: "none",
                  color,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {action.label}
              </button>
            ))
          : null}

        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          إغلاق
        </button>
        </div>
      </div>
   
  );
}

function isGeneralStudiesCourse(course) {
  const text = normalizeArabic(`${course.courseName} ${course.courseCode} ${course.department} ${course.major}`);

  const keywords = [
    "انجليزي",
    "لغة انجليزية",
    "الرياضيات",
    "رياضيات",
    "فيزياء",
    "عربي",
    "لغة عربية",
    "السلوك الوظيفي",
    "أساسيات ريادة الأعمال",
    "مهارات الاتصال",
    "مقدمة تطبيقات الحاسب",
    "اسلم",
    "ثقافة اسلامية",
    "كتابة فنية",
  ];

  return keywords.some((k) => text.includes(normalizeArabic(k)));
}


function getDefaultExcludedPracticalCourseKeys(rows) {
  const map = new Map();

  rows.forEach((row) => {
    const courseCode = String(row["المقرر"] ?? "").trim();
    const courseName = String(row["اسم المقرر"] ?? "").trim();
    const scheduleType = String(row["نوع الجدولة"] ?? "").trim();

    if (!courseCode && !courseName) return;

    const normalizedCourseCode = normalizeArabic(courseCode);
    const normalizedCourseName = normalizeArabic(courseName);
    const normalizedScheduleType = normalizeArabic(scheduleType);
    const compactCourseName = normalizedCourseName.replace(/\s+/g, "");
    const hasProjectKeyword =
      normalizedCourseName.includes("مشروع") ||
      compactCourseName.includes("مشروع") ||
      normalizedCourseName.includes("تخرج") ||
      compactCourseName.includes("تخرج");

    const key = [normalizedCourseCode, normalizedCourseName].join("|");

    if (!map.has(key)) {
      map.set(key, {
        key,
        hasPractical: false,
        hasTheoretical: false,
        isCoop: false,
        isProject: false,
      });
    }

    const item = map.get(key);

    if (normalizedScheduleType.includes("عملي")) {
      item.hasPractical = true;
    }

    if (
      normalizedScheduleType.includes("نظري") ||
      normalizedScheduleType.includes("محاضره") ||
      normalizedScheduleType.includes("محاضرة")
    ) {
      item.hasTheoretical = true;
    }

    if (normalizedScheduleType.includes("تعاوني")) {
      item.isCoop = true;
    }

    if (hasProjectKeyword) {
      item.isProject = true;
    }
  });

  return Array.from(map.values())
    .filter((item) => {
      const practicalOnly = item.hasPractical && !item.hasTheoretical;
      return practicalOnly || item.isCoop || item.isProject;
    })
    .map((item) => item.key);
}



function groupScheduleForOfficialPrint(schedule) {
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

function openPrintWindow(title, html) {
  const printWindow = window.open("", "_blank", "width=1400,height=900");
  if (!printWindow) return null;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.document.title = title;

  const triggerPrint = () => {
    printWindow.focus();
    printWindow.print();
  };

  if (printWindow.document.readyState === "complete") {
    setTimeout(triggerPrint, 300);
  } else {
    printWindow.onload = () => setTimeout(triggerPrint, 300);
  }

  return printWindow;
}

function getPrintBaseStyles() {
  return `
    @page {
      size: A4 portrait;
      margin: 10mm;
    }

    * {
      box-sizing: border-box;
    }

    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #111827;
      direction: rtl;
      font-family: "Tahoma", "Arial", sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      padding: 0;
    }

    .page {
      width: 100%;
    }

    .header {
      text-align: center;
      margin-bottom: 12px;
      border-bottom: 2px solid #0f766e;
      padding-bottom: 10px;
    }

    .logo-wrap {
      margin-bottom: 8px;
    }

    .logo {
      width: 72px;
      height: auto;
      object-fit: contain;
    }

    .college-name {
      font-size: 22px;
      font-weight: 800;
      color: #0f766e;
      margin-bottom: 4px;
    }

    .doc-title {
      font-size: 18px;
      font-weight: 800;
      color: #111827;
      margin-bottom: 8px;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-top: 8px;
      font-size: 12px;
    }

    .meta-box {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 6px 8px;
      background: #f8fafc;
      text-align: center;
    }

    .period-strip {
      display: grid;
      grid-template-columns: 170px repeat(var(--period-count), 1fr);
      border: 1px solid #0f172a;
      border-bottom: 0;
      margin-top: 10px;
    }

    .period-strip > div {
      border-left: 1px solid #0f172a;
      padding: 8px 6px;
      text-align: center;
      min-height: 54px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      font-size: 12px;
      font-weight: 700;
    }

    .period-strip > div:first-child {
      background: #f8fafc;
    }

    .period-strip > div:last-child {
      border-left: 0;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    thead {
      display: table-header-group;
    }

    tr, td, th {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }

    th, td {
      border: 1px solid #0f172a;
      padding: 6px 5px;
      font-size: 11px;
      text-align: center;
      vertical-align: middle;
      word-break: break-word;
    }

    th {
      background: #ecfeff;
      font-weight: 800;
    }

    .day-col {
      width: 170px;
      font-weight: 800;
      background: #f8fafc;
    }

    .num-cell {
      width: 19px;
    }

    .course-cell {
      width: 170px;
    }

    .code-cell {
      width: 78px;
    }

    .hall-cell {
      width: 90px;
    }

    .section-note {
      margin-top: 12px;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 10px 12px;
      background: #fcfcfc;
      font-size: 11px;
      line-height: 1.9;
    }

    .section-note-title {
      font-weight: 800;
      margin-bottom: 4px;
      color: #0f172a;
    }

    .footer {
      margin-top: 10px;
      text-align: left;
      font-size: 11px;
      color: #475569;
    }

    .invigilators-table {
      table-layout: auto;
    }

    .invigilators-table th:first-child,
    .invigilators-table td:first-child {
      width: 180px;
      min-width: 180px;
      background: #f8fafc;
      font-weight: 800;
    }

    .day-head {
      line-height: 1.8;
    }
  `;
}

function getDayTheme(dayName) {
  const themes = {
    "الأحد": { bg: "#F3FBFA", border: "#1FA7A8", text: "#145A5F" },
    "الاثنين": { bg: "#F6FCFC", border: "#1B8F96", text: "#145A5F" },
    "الثلاثاء": { bg: "#EEF8F8", border: "#2A9D9C", text: "#145A5F" },
    "الأربعاء": { bg: "#F8FCFC", border: "#46AFAE", text: "#145A5F" },
    "الخميس": { bg: "#EFFAFA", border: "#147B83", text: "#145A5F" },
  };

  return themes[dayName] || {
    bg: "#FAFCFC",
    border: "#D7E7E6",
    text: "#1F2529",
  };
}

function printScheduleOnlyPdf({
  collegeName,
  schedule,
  periodLabels = [],
  defaultExamHall,
  selectedDepartment = "__all__",
  selectedMajor = "__all__",
  compactMode = false,
}) {
  const safeDefaultHall = defaultExamHall || "غير محدد";
  if (!schedule?.length) return;

  const groupedDays = groupScheduleForOfficialPrint(schedule);
  const periodIds = Array.from(new Set(schedule.map((item) => item.period))).sort((a, b) => a - b);

  const resolvedPeriodLabels = periodIds.map((periodId) => {
    const fromArg = periodLabels.find((p) => p.period === periodId);
    if (fromArg) return fromArg;

    const firstItem = schedule.find((s) => s.period === periodId);
    return {
      period: periodId,
      label: `الفترة ${periodId}`,
      timeText: firstItem?.timeText || "",
    };
  });

  const maxRowsPerDay = (day) =>
    Math.max(...periodIds.map((p) => (day.periods[p] ? day.periods[p].length : 0)), 1);

const renderPeriodColumns = (day, periodId, rowIndex) => {
  const list = day.periods[periodId] || [];
  const item = list[rowIndex];
  const dayTheme = getDayTheme(day.dayName);

  if (!item) {
    return `
      <td class="num-cell" style="background:${dayTheme.bg}; color:${dayTheme.text};">${rowIndex + 1}</td>
      <td class="course-cell" style="background:${dayTheme.bg}; color:${dayTheme.text};"></td>
      <td class="code-cell" style="background:${dayTheme.bg}; color:${dayTheme.text};"></td>
      <td class="hall-cell" style="background:${dayTheme.bg}; color:${dayTheme.text};"></td>
    `;
  }

  return `
    <td class="num-cell" style="background:${dayTheme.bg}; color:${dayTheme.text};">
      ${rowIndex + 1}
    </td>
    <td class="course-cell" style="background:${dayTheme.bg}; color:${dayTheme.text};">
      ${item.courseName || ""}
    </td>
    <td class="code-cell" style="background:${dayTheme.bg}; color:${dayTheme.text};">
      ${item.courseCode || ""}
    </td>
    <td class="hall-cell" style="background:${dayTheme.bg}; color:${dayTheme.text};">
      ${item.examHall || defaultExamHall}
    </td>
  `;
};
  
  const todayText = new Intl.DateTimeFormat("ar-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

const extractedDepartments = Array.from(
  new Set(
    schedule.flatMap((item) =>
      splitBySlash(item.department)
        .map((dep) => String(dep || "").trim())
        .filter((dep) => {
          const normalized = normalizeArabic(dep);
          return (
            dep &&
            normalized !== normalizeArabic("الدراسات العامة")
          );
        })
    )
  )
).sort((a, b) => a.localeCompare(b, "ar"));
let departmentLabel = "";
let majorLabel = "";

if (selectedDepartment === "__all__" && selectedMajor === "__all__") {
  departmentLabel = "جميع الأقسام";
  majorLabel = "جميع التخصصات";
} else {
  if (selectedDepartment !== "__all__") {
    departmentLabel = selectedDepartment;
  } else if (extractedDepartments.length) {
    departmentLabel =
      extractedDepartments.length === 1
        ? extractedDepartments[0]
        : extractedDepartments.join(" / ");
  } else {
    const roots = Array.from(
      new Set(
        schedule.flatMap((item) =>
          (item.departmentRoots || []).filter(
            (r) => r !== normalizeArabic("الدراسات العامة")
          )
        )
      )
    );

    departmentLabel =
      roots.length === 1
        ? roots[0]
        : roots.length
        ? roots.join(" / ")
        : "جميع الأقسام";
  }

  majorLabel = selectedMajor !== "__all__" ? selectedMajor : "جميع التخصصات";
}

  const tableFontSize = compactMode ? "9px" : "11px";
  const tablePadding = compactMode ? "4px 3px" : "6px 5px";
  const pageMargin = compactMode ? "6mm" : "10mm";

  const instructions = [
    "يجب على المتدرب الحضور إلى قاعة الاختبار قبل موعد الاختبار بـ 15 دقيقة.",
    "لا يسمح للمتدرب بدخول الاختبار بعد مضي نصف ساعة من بدايته، ولايسمح له بالخروج قبل مضي نصف ساعة.",
    "قيام المتدرب بالغش أو محاولة الغش يعتبر مخالفة لتعليمات وقواعد إجراء الاختبارات، وترصد له درجة (صفر) في اختبار ذلك المقرر.",
    "وجود الجوال أو أي أوراق تخص المقرر في حوزة المتدرب تعتبر شروعًا في الغش وتطبق عليه قواعد إجراءات الاختبارات.",
    "يجب على المتدرب التقيد بالزي التدريبي والتزام الهدوء داخل قاعة الاختبار.",
    "يتطلب حصول المتدرب على 25% من درجة الاختبار النهائي حتى يجتاز المقرر التدريبي بالكليات التقنية.",
    "لا يسمح للمتدرب المحروم بدخول الاختبارات النهائية.",
  ];

  const html = `
    <html dir="rtl" lang="ar">
      <head>
        <title>طباعة جدول الاختبارات</title>
        <style>
          ${getPrintBaseStyles()}

          @page {
            size: A4 portrait;
            margin: ${pageMargin};
          }

          body {
            zoom: ${compactMode ? "0.86" : "1"};
          }

          th, td {
            font-size: ${tableFontSize};
            padding: ${tablePadding};
          }

          .college-name {
            font-size: ${compactMode ? "19px" : "22px"};
          }

          .doc-title {
            font-size: ${compactMode ? "16px" : "18px"};
          }

          .meta-grid {
            font-size: ${compactMode ? "11px" : "12px"};
          }

          .section-note {
            font-size: ${compactMode ? "10px" : "11px"};
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <div class="logo-wrap">
              <img class="logo" src="${window.location.origin + LOGO_SRC}" alt="TVTC Logo" />
            </div>
            <div class="college-name">${collegeName || "الكلية التقنية"}</div>
            <div class="doc-title">جدول الاختبارات النهائية</div>

            <div class="meta-grid">
<div class="meta-box"><strong>القسم:</strong> ${departmentLabel}</div>
<div class="meta-box"><strong>التخصص:</strong> ${majorLabel}</div>
              <div class="meta-box"><strong>تاريخ الطباعة:</strong> ${todayText}</div>
            </div>
          </div>

          <div class="period-strip" style="--period-count:${periodIds.length}">
            <div>&nbsp;</div>
            ${resolvedPeriodLabels
              .map(
                (p) => `
                  <div>
                    <div>${p.label}</div>
                    <div>${p.timeText || ""}</div>
                  </div>
                `
              )
              .join("")}
          </div>

          <table>
            <thead>
              <tr>
                <th class="day-col">اليوم / التاريخ</th>
                ${periodIds
                  .map(
                    () => `
                      <th>م</th>
                      <th>المقرر</th>
                      <th>الرمز</th>
                      <th>المقر</th>
                    `
                  )
                  .join("")}
              </tr>
            </thead>
            <tbody>
              ${groupedDays
                .map((day) => {
                  const rowsCount = maxRowsPerDay(day);

                  return Array.from({ length: rowsCount })
                    .map(
                      (_, rowIndex) => `
                        <tr style="background:${getDayTheme(day.dayName).bg}; color:${getDayTheme(day.dayName).text};">
                          ${
                            rowIndex === 0
                              ? `
                                <td 
  class="day-col" 
  rowspan="${rowsCount}"
  style="background:${getDayTheme(day.dayName).bg}; color:${getDayTheme(day.dayName).text};"
>
                                  <div style="font-weight:800">${day.dayName}</div>
                                  <div style="margin-top:4px">${day.hijriNumeric}</div>
                                </td>
                              `
                              : ""
                          }
                          ${periodIds.map((periodId) => renderPeriodColumns(day, periodId, rowIndex)).join("")}
                        </tr>
                      `
                    )
                    .join("");
                })
                .join("")}
            </tbody>
          </table>

          <div class="section-note">
            <div class="section-note-title">تعليمات مهمة</div>
            <ol style="margin:0; padding-right:18px;">
              ${instructions.map((item) => `<li>${item}</li>`).join("")}
            </ol>
          </div>

        </div>
      </body>
    </html>
  `;

  openPrintWindow("طباعة جدول الاختبارات", html);
}

function printInvigilatorsOnlyPdf({ collegeName, invigilatorTable, compactMode = false }) {
  if (!invigilatorTable?.length) return;

  const todayText = new Intl.DateTimeFormat("ar-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

  const allDays = Array.from(
    new Set(
      invigilatorTable.flatMap((inv) => inv.items.map((item) => `${item.dateISO}|${item.dayName}|${item.gregorian}`))
    )
  )
    .map((value) => {
      const [dateISO, dayName, gregorian] = value.split("|");
      return { dateISO, dayName, gregorian };
    })
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));

const buildDayCell = (inv, day) => {
  const matches = inv.items
    .filter((item) => item.dateISO === day.dateISO)
    .sort((a, b) => a.period - b.period);

  if (!matches.length) return "-";

  return matches
    .map((item) => {
      const hallText = String(item.examHall || "").trim() || "بدون قاعة";
      return `
        <div style="line-height:1.8;">
          الفترة ${item.period} - ${hallText}
        </div>
      `;
    })
    .join("");
};

  const html = `
    <html dir="rtl" lang="ar">
      <head>
        <title>طباعة جدول المراقبين</title>
        <style>
          ${getPrintBaseStyles()}

          @page {
            size: A4 portrait;
            margin: ${compactMode ? "6mm" : "10mm"};
          }

          body {
            zoom: ${compactMode ? "0.86" : "1"};
          }

          th, td {
            font-size: ${compactMode ? "10px" : "12px"};
            padding: ${compactMode ? "5px 4px" : "8px 6px"};
          }

          .invigilators-table {
            table-layout: auto;
          }

          .invigilators-table th:first-child,
          .invigilators-table td:first-child {
            width: 180px;
            min-width: 180px;
            background: #f8fafc;
            font-weight: 800;
          }

          .day-head {
            line-height: 1.8;
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <div class="logo-wrap">
              <img class="logo" src="${window.location.origin + LOGO_SRC}" alt="TVTC Logo" />
            </div>
            <div class="college-name">${collegeName || "الكلية التقنية"}</div>
            <div class="doc-title">جدول المراقبين وفترات المراقبة</div>

            <div class="meta-grid">
              <div class="meta-box"><strong>عدد المراقبين:</strong> ${invigilatorTable.length}</div>
              <div class="meta-box"><strong>عدد الأيام:</strong> ${allDays.length}</div>
              <div class="meta-box"><strong>تاريخ الطباعة:</strong> ${todayText}</div>
            </div>
          </div>

          <table class="invigilators-table">
            <thead>
              <tr>
                <th>المراقب</th>
                ${allDays
                  .map(
                    (day) => `
                      <th class="day-head">
                     <div>${day.gregorian}</div>
                     
                      </th>
                    `
                  )
                  .join("")}
              </tr>
            </thead>
            <tbody>
              ${invigilatorTable
                .map(
                  (inv) => `
                    <tr>
                      <td>${inv.name}</td>
                      ${allDays.map((day) => `<td>${buildDayCell(inv, day)}</td>`).join("")}
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>

        </div>
      </body>
    </html>
  `;

  openPrintWindow("طباعة جدول المراقبين", html);
}


function printSingleStudentSchedule({ collegeName, student, items, compactMode = false }) {
  if (!student || !items?.length) return;

  const isLong = compactMode || items.length > 6;
  const todayText = new Intl.DateTimeFormat("ar-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

  const instructions = [
    "يجب على المتدرب الحضور إلى قاعة الاختبار قبل موعد الاختبار بـ 15 دقيقة.",
    "لا يسمح للمتدرب بدخول الاختبار بعد مضي نصف ساعة من بدايته، ولا يسمح له بالخروج قبل مضي نصف ساعة.",
    "قيام المتدرب بالغش أو محاولة الغش يعتبر مخالفة لتعليمات وقواعد إجراء الاختبارات، وترصد له درجة (صفر) في اختبار ذلك المقرر.",
    "وجود الجوال أو أي أوراق تخص المقرر في حوزة المتدرب تعتبر شروعًا في الغش وتطبق عليه قواعد إجراءات الاختبارات.",
    "يجب على المتدرب التقيد بالزي التدريبي والتزام الهدوء داخل قاعة الاختبار.",
    "يتطلب حصول المتدرب على 25% من درجة الاختبار النهائي حتى يجتاز المقرر التدريبي بالكليات التقنية.",
    "لا يسمح للمتدرب المحروم بدخول الاختبارات النهائية.",
  ];

  const rowsHtml = items
    .map((item, index) => {
      const deprivationStatus = String(item?.deprivationStatus || "").trim();
      const isDeprived = Boolean(deprivationStatus);
      const theme = getDayTheme(item.dayName);

      return `
      <tr style="
        background:${isDeprived ? "#FEF2F2" : theme.bg};
        color:${isDeprived ? "#B42318" : theme.text};
        font-weight:${isDeprived ? "700" : "400"};
      ">
        <td>${index + 1}</td>
        <td>
          ${item.courseName || ""}
          ${
            isDeprived
              ? `<div style="margin-top:4px;font-size:10px;font-weight:800;color:#B42318;">${item.deprivationStatus}</div>`
              : ""
          }
        </td>
        <td>${item.courseCode || ""}</td>
        <td>${item.dayName || ""}</td>
        <td>${item.gregorian || ""}</td>
        <td>${item.hijriNumeric || ""}</td>
        <td>${item.period || ""}</td>
        <td>${item.timeText || ""}</td>
        <td>${item.examHall || ""}</td>
      </tr>
    `;
    })
    .join("");

  const html = `
    <html dir="rtl" lang="ar">
      <head>
        <title>طباعة جدول متدرب</title>
        <style>
          ${getPrintBaseStyles()}

          @page {
            size: A4 portrait;
            margin: 8mm;
          }

          body {
            zoom: ${isLong ? 0.82 : 0.92};
          }

          .page {
            page-break-after: avoid !important;
          }

          table {
            table-layout: auto;
          }

          th, td {
            font-size: ${isLong ? "9px" : "10px"};
            padding: ${isLong ? "4px 3px" : "6px 4px"};
            white-space: nowrap;
          }

          .header {
            margin-bottom: 8px;
            padding-bottom: 8px;
          }

          .college-name {
            font-size: ${isLong ? "18px" : "20px"};
            margin-bottom: 2px;
          }

          .doc-title {
            font-size: ${isLong ? "14px" : "16px"};
            margin-bottom: 4px;
          }

          .student-meta {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 4px;
            margin: 8px 0;
            font-size: ${isLong ? "10px" : "11px"};
          }

          .student-box {
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            padding: 6px 8px;
            background: #f8fafc;
          }

          .footer {
            margin-top: 6px;
            font-size: 10px;
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <div class="logo-wrap">
              <img class="logo" src="${window.location.origin + LOGO_SRC}" alt="TVTC Logo" />
            </div>
            <div class="college-name">${collegeName || "الكلية التقنية"}</div>
            <div class="doc-title">جدول الاختبارات النهائي للمتدرب</div>
          </div>

          <div class="student-meta">
            <div class="student-box"><strong>اسم المتدرب:</strong> ${student.name || "-"}</div>
            <div class="student-box"><strong>رقم المتدرب:</strong> ${student.id || "-"}</div>
            <div class="student-box"><strong>القسم:</strong> ${student.department || "-"}</div>
            <div class="student-box"><strong>التخصص:</strong> ${student.major || "-"}</div>
          </div>

          <table>
            <thead>
              <tr>
                <th>م</th>
                <th>اليوم والتاريخ</th>
                <th>التاريخ الهجري</th>
                <th>المقرر</th>
                <th>الرمز</th>
                <th>الفترة</th>
                <th>الوقت</th>
                <th>المقر</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
 <div class="section-note">
            <div class="section-note-title">تعليمات مهمة</div>
            <ol style="margin:0; padding-right:18px;">
              ${instructions.map((item) => `<li>${item}</li>`).join("")}
            </ol>
          </div>
          
        </div>
      </body>
    </html>
  `;

  openPrintWindow("طباعة جدول متدرب", html);
}


function getCourseConstraintDefaults() {
  return {
    preferredDays: [],
    preferredPeriods: [],
    avoidedDays: [],
    avoidedPeriods: [],
  };
}

function getCourseHallConstraintDefaults() {
  return {
    mode: "off",
    hallNames: [],
    splitEnabled: false,
    splitHallNames: [],
  };
}

function getDepartmentHallConstraintDefaults() {
  return {
    mode: "off",
    hallNames: [],
  };
}

function getCourseInvigilatorConstraintDefaults() {
  return {
    mode: "off",
    invigilatorNames: [],
  };
}

function sanitizeCourseHallConstraintsMap(map, validKeys, validHallNames) {
  const valid = new Set(validKeys || []);
  const allowedHallNames = new Set((validHallNames || []).map((name) => normalizeArabic(name)));
  const next = {};

  Object.entries(map || {}).forEach(([courseKey, value]) => {
    if (!valid.has(courseKey)) return;

    next[courseKey] = {
      mode: value?.mode === "only" || value?.mode === "prefer" ? value.mode : "off",
      hallNames: Array.from(
        new Set(
          (value?.hallNames || []).filter((name) => allowedHallNames.has(normalizeArabic(name)))
        )
      ),
      splitEnabled: Boolean(value?.splitEnabled),
      splitHallNames: Array.from(
        new Set(
          (value?.splitHallNames || []).filter((name) => allowedHallNames.has(normalizeArabic(name)))
        )
      ),
    };
  });

  return next;
}

function sanitizeDepartmentHallConstraintsMap(map, validDepartmentKeys, validHallNames) {
  const valid = new Set((validDepartmentKeys || []).map((key) => normalizeArabic(key)));
  const allowedHallNames = new Set((validHallNames || []).map((name) => normalizeArabic(name)));
  const next = {};

  Object.entries(map || {}).forEach(([departmentKey, value]) => {
    const normalizedDepartmentKey = normalizeArabic(departmentKey);
    if (!valid.has(normalizedDepartmentKey)) return;

    next[normalizedDepartmentKey] = {
      mode: value?.mode === "only" || value?.mode === "prefer" ? value.mode : "off",
      hallNames: Array.from(
        new Set(
          (value?.hallNames || []).filter((name) => allowedHallNames.has(normalizeArabic(name)))
        )
      ),
    };
  });

  return next;
}

function sanitizeCourseConstraintsMap(map, validKeys) {
  const valid = new Set(validKeys || []);
  const next = {};

  Object.entries(map || {}).forEach(([courseKey, value]) => {
    if (!valid.has(courseKey)) return;

    next[courseKey] = {
      preferredDays: Array.from(new Set((value?.preferredDays || []).filter(Boolean))),
      preferredPeriods: Array.from(
        new Set((value?.preferredPeriods || []).map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0))
      ),
      avoidedDays: Array.from(new Set((value?.avoidedDays || []).filter(Boolean))),
      avoidedPeriods: Array.from(
        new Set((value?.avoidedPeriods || []).map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0))
      ),
    };
  });

  return next;
}

function sanitizeCourseInvigilatorConstraintsMap(map, validKeys, validInvigilatorNames) {
  const valid = new Set(validKeys || []);
  const allowedInvigilatorNames = new Set((validInvigilatorNames || []).map((name) => normalizeArabic(name)));
  const next = {};
  const allowedModes = new Set([
    "off",
    "only",
    "prefer",
    "avoid",
    "avoid_department_trainers",
    "only_department_trainers",
  ]);

  Object.entries(map || {}).forEach(([courseKey, value]) => {
    if (!valid.has(courseKey)) return;

    next[courseKey] = {
      mode: allowedModes.has(value?.mode) ? value.mode : "off",
      invigilatorNames: Array.from(
        new Set(
          (value?.invigilatorNames || []).filter((name) =>
            allowedInvigilatorNames.has(normalizeArabic(name))
          )
        )
      ),
    };
  });

  return next;
}

function getDepartmentTrainerNamesForCourse(course, rows, generalStudiesInvigilatorsSet) {
  if (!course) return [];

  if (isGeneralStudiesCourse(course)) {
    return Array.from(generalStudiesInvigilatorsSet || []);
  }

  const depMajKey = `${normalizeArabic(course.department || "")}|${normalizeArabic(course.major || "")}`;

  return Array.from(
    new Set(
      rows
        .filter((row) => {
          const rowDepartment = normalizeArabic(String(row["القسم"] || "").trim());
          const rowMajor = normalizeArabic(String(row["التخصص"] || "").trim());
          const rowTrainer = String(row["المدرب"] || "").trim();
          if (!rowTrainer) return false;

          const rowKey = `${rowDepartment}|${rowMajor}`;
          return rowKey === depMajKey;
        })
        .flatMap((row) =>
          String(row["المدرب"] || "")
            .split("/")
            .map((name) => name.trim())
            .filter(Boolean)
        )
    )
  );
}

function getStrictTrainerNamesForCourse(course, rows, generalStudiesInvigilatorsSet) {
  if (!course) return [];

  if (isGeneralStudiesCourse(course)) {
    return Array.from(generalStudiesInvigilatorsSet || []);
  }

  const courseKey = String(course.key || "").trim();
  const normalizedCourseCode = normalizeArabic(String(course.courseCode || "").trim());
  const normalizedCourseName = normalizeArabic(String(course.courseName || "").trim());
  const allowedDepartmentRoots = new Set(
    (Array.isArray(course.departmentRoots) ? course.departmentRoots : getCourseDepartmentRoots(course))
      .map((value) => normalizeArabic(value))
      .filter(Boolean)
  );

  return Array.from(
    new Set(
      (Array.isArray(rows) ? rows : [])
        .filter((row) => {
          const rowTrainer = String(row["المدرب"] || "").trim();
          if (!rowTrainer) return false;

          const rowCourseCode = String(row["المقرر"] || "").trim();
          const rowCourseName = String(row["اسم المقرر"] || "").trim();
          const rowCourseKey = [normalizeArabic(rowCourseCode), normalizeArabic(rowCourseName)].join("|");
          if (courseKey && rowCourseKey !== courseKey) return false;
          if (!courseKey && (normalizeArabic(rowCourseCode) !== normalizedCourseCode || normalizeArabic(rowCourseName) !== normalizedCourseName)) {
            return false;
          }

          if (!allowedDepartmentRoots.size) return true;

          const rowRoots = new Set();
          const rowDepartment = String(row["القسم"] || "").trim();
          const rowMajor = String(row["التخصص"] || "").trim();
          const rowSection = `${rowDepartment || "-"} / ${rowMajor || "-"}`;

          splitBySlash(rowDepartment).forEach((value) => {
            const clean = normalizeArabic(value);
            if (clean) rowRoots.add(clean);
          });
          splitBySlash(rowMajor).forEach((value) => {
            const clean = normalizeArabic(value);
            if (clean) rowRoots.add(clean);
          });
          splitBySlash(rowSection).forEach((value) => {
            const clean = normalizeArabic(value);
            if (clean && clean !== normalizeArabic("-")) rowRoots.add(clean);
          });

          for (const root of rowRoots) {
            if (allowedDepartmentRoots.has(root)) return true;
          }
          return false;
        })
        .flatMap((row) =>
          String(row["المدرب"] || "")
            .split("/")
            .map((name) => name.trim())
            .filter(Boolean)
        )
    )
  );
}
export default function AdminPage() {
  const fileRef = useRef(null);
  const topRef = useRef(null);
const pendingRestoreRef = useRef(null);
  const toastTimerRef = useRef(null);
  
  const [selectedConflicts, setSelectedConflicts] = useState(null);
  const [selectedConflictStudents, setSelectedConflictStudents] = useState(null);
  const [selectedManualMoveConflicts, setSelectedManualMoveConflicts] = useState(null);
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [collegeNameInput, setCollegeNameInput] = useState("");
  const [toast, setToast] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [previewTab, setPreviewTab] = useState("sortedCourses");
  const [invigilationMode, setInvigilationMode] = useState("ratio");
  const [studentsPerInvigilator, setStudentsPerInvigilator] = useState(20);
  const [currentStep, setCurrentStep] = useState(1);
  const [studentSearchText, setStudentSearchText] = useState("");
  const [showStudentSuggestions, setShowStudentSuggestions] = useState(false);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [showTrainerHint, setShowTrainerHint] = useState(false);
  const [numberOfDays, setNumberOfDays] = useState(8);
  const [selectedDays, setSelectedDays] = useState(["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"]);
  const [periodConfigs, setPeriodConfigs] = useState(getDefaultPeriodConfigs());
  const [examHalls, setExamHalls] = useState([
  {
    id: makeHallId(),
    name: "",
    capacity: "",
    allowAllDepartments: true,
    allowedDepartments: [],
    allowSharedAssignments: false,
  },
]);
const [enableSamePeriodGroups, setEnableSamePeriodGroups] = useState(false);
const [samePeriodGroups, setSamePeriodGroups] = useState([]);
const [draggingSamePeriodCourseKey, setDraggingSamePeriodCourseKey] = useState("");
const [maxExamsPerStudentPerDay, setMaxExamsPerStudentPerDay] = useState(2);
const [courseConstraints, setCourseConstraints] = useState({});
const [selectedConstraintCourseKey, setSelectedConstraintCourseKey] = useState("");
const [selectedConstraintCourseKeys, setSelectedConstraintCourseKeys] = useState([]);
const [courseHallConstraints, setCourseHallConstraints] = useState({});
const [departmentHallConstraints, setDepartmentHallConstraints] = useState({});
const [selectedHallConstraintCourseKey, setSelectedHallConstraintCourseKey] = useState("");
const [selectedHallConstraintCourseKeys, setSelectedHallConstraintCourseKeys] = useState([]);
const [selectedHallConstraintDepartmentKey, setSelectedHallConstraintDepartmentKey] = useState("");
const [selectedHallConstraintDepartmentKeys, setSelectedHallConstraintDepartmentKeys] = useState([]);
const [courseInvigilatorConstraints, setCourseInvigilatorConstraints] = useState({});
const [selectedInvigilatorConstraintCourseKey, setSelectedInvigilatorConstraintCourseKey] = useState("");
const [selectedInvigilatorConstraintCourseKeys, setSelectedInvigilatorConstraintCourseKeys] = useState([]);
const [manualScheduleLocked, setManualScheduleLocked] = useState(false);
const [generalSpecializedDaySeparationMode, setGeneralSpecializedDaySeparationMode] = useState("off");
const [draggingScheduleItemId, setDraggingScheduleItemId] = useState("");
const [draggingUnscheduledCourseKey, setDraggingUnscheduledCourseKey] = useState("");
const [activeDropSlotId, setActiveDropSlotId] = useState("");
const stepNineCardStyle = {
  borderRadius: 16,
  padding: "12px 14px",
  display: "flex",
  gap: 10,
  alignItems: "flex-start",
  width: "100%",
  maxWidth: 700,
};
const [hallWarnings, setHallWarnings] = useState([]);
const [showAdvancedManagementOptions, setShowAdvancedManagementOptions] = useState(false);
const [showHallConstraintPreferences, setShowHallConstraintPreferences] = useState(false);
const [showCourseExclusionsPreference, setShowCourseExclusionsPreference] = useState(false);
const [showGeneralSpecializedSeparationPreference, setShowGeneralSpecializedSeparationPreference] = useState(false);
const [showSamePeriodPreference, setShowSamePeriodPreference] = useState(false);
const [showCourseTimePreference, setShowCourseTimePreference] = useState(false);
const [showAvoidSameLevelSameDayPreference, setShowAvoidSameLevelSameDayPreference] = useState(false);
const [showInvigilatorConstraintPreference, setShowInvigilatorConstraintPreference] = useState(false);

const periodsText = useMemo(() => serializePeriodConfigsToText(periodConfigs), [periodConfigs]);

const updatePeriodConfig = (index, patch) => {
  setPeriodConfigs((prev) => {
    const next = prev.map((item, itemIndex) =>
      itemIndex === index
        ? {
            ...item,
            ...patch,
          }
        : item
    );

    return next.map((item, itemIndex) => {
      if (itemIndex === 0) return { ...item, enabled: true };
      return item;
    });
  });
};

const periodOverlapWarning = useMemo(() => {
  const normalized = periodConfigs
    .map((item, index) => {
      if (item?.enabled === false) {
        return {
          index,
          startMinutes: null,
          endMinutes: null,
        };
      }
      const startMinutes = parseTimeToMinutes(item?.start);
      const duration = Number(item?.duration);
      const endMinutes = startMinutes === null || !Number.isFinite(duration) ? null : startMinutes + duration;
      return {
        index,
        startMinutes,
        endMinutes,
      };
    })
    .filter((item) => item.startMinutes !== null && item.endMinutes !== null);

  const overlaps = [];
  for (let i = 0; i < normalized.length; i += 1) {
    for (let j = i + 1; j < normalized.length; j += 1) {
      const a = normalized[i];
      const b = normalized[j];
      if (a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes) {
        overlaps.push(`الفترة ${a.index + 1} تتداخل مع الفترة ${b.index + 1}`);
      }
    }
  }

  return overlaps.length ? overlaps.join('، ') : '';
}, [periodConfigs]);


  function addExamHall() {
    setExamHalls((prev) => [
      ...prev,
      {
        id: makeHallId(),
        name: "",
        capacity: "",
        allowAllDepartments: true,
        allowedDepartments: [],
        allowSharedAssignments: false,
      },
    ]);
  }

  function updateExamHall(id, patch) {
    setExamHalls((prev) =>
      prev.map((hall) => (hall.id === id ? { ...hall, ...patch } : hall))
    );
  }

  function removeExamHall(id) {
    setExamHalls((prev) => prev.filter((hall) => hall.id !== id));
  }

  function toggleHallDepartment(hallId, department) {
    setExamHalls((prev) =>
      prev.map((hall) => {
        if (hall.id !== hallId) return hall;

        const exists = hall.allowedDepartments.includes(department);

        return {
          ...hall,
          allowedDepartments: exists
            ? hall.allowedDepartments.filter((d) => d !== department)
            : [...hall.allowedDepartments, department],
        };
      })
    );
  }

  function setHallAllDepartments(hallId, checked) {
    setExamHalls((prev) =>
      prev.map((hall) =>
        hall.id === hallId
          ? {
              ...hall,
              allowAllDepartments: checked,
              allowedDepartments: checked ? [] : hall.allowedDepartments,
            }
          : hall
      )
    );
  }

  function addSamePeriodGroup() {
    setSamePeriodGroups((prev) => [
      ...prev,
      {
        id: makeCourseGroupId(),
        title: `مجموعة ${prev.length + 1}`,
        courseKeys: [],
      },
    ]);
  }

  function removeSamePeriodGroup(groupId) {
    setSamePeriodGroups((prev) => prev.filter((group) => group.id !== groupId));
  }

  function updateSamePeriodGroupTitle(groupId, title) {
    setSamePeriodGroups((prev) =>
      prev.map((group) => (group.id === groupId ? { ...group, title } : group))
    );
  }

  function assignCourseToSamePeriodGroup(courseKey, targetGroupId) {
    if (!courseKey) return;

    setSamePeriodGroups((prev) => {
      let alreadyInTarget = false;

      const next = prev.map((group) => {
        const filteredKeys = group.courseKeys.filter((key) => key !== courseKey);

        if (group.id === targetGroupId) {
          alreadyInTarget = group.courseKeys.includes(courseKey);
          return {
            ...group,
            courseKeys: alreadyInTarget ? filteredKeys : [...filteredKeys, courseKey],
          };
        }

        return {
          ...group,
          courseKeys: filteredKeys,
        };
      });

      return next;
    });
  }

  function removeCourseFromSamePeriodGroups(courseKey) {
    if (!courseKey) return;

    setSamePeriodGroups((prev) =>
      prev.map((group) => ({
        ...group,
        courseKeys: group.courseKeys.filter((key) => key !== courseKey),
      }))
    );
  }

  function updateCourseConstraint(courseKey, patch) {
    if (!courseKey) return;
    setCourseConstraints((prev) => ({
      ...prev,
      [courseKey]: {
        ...getCourseConstraintDefaults(),
        ...(prev[courseKey] || {}),
        ...patch,
      },
    }));
  }

  function toggleCourseConstraintValue(courseKey, field, value) {
    if (!courseKey || !field) return;
    setCourseConstraints((prev) => {
      const current = {
        ...getCourseConstraintDefaults(),
        ...(prev[courseKey] || {}),
      };
      const currentList = Array.isArray(current[field]) ? current[field] : [];
      const nextList = currentList.includes(value)
        ? currentList.filter((item) => item !== value)
        : [...currentList, value];

      return {
        ...prev,
        [courseKey]: {
          ...current,
          [field]: nextList,
        },
      };
    });
  }

  function clearCourseConstraint(courseKey) {
    if (!courseKey) return;
    setCourseConstraints((prev) => {
      const next = { ...prev };
      delete next[courseKey];
      return next;
    });
  }

  function updateCourseHallConstraint(courseKey, patch) {
    if (!courseKey) return;
    setCourseHallConstraints((prev) => ({
      ...prev,
      [courseKey]: {
        ...getCourseHallConstraintDefaults(),
        ...(prev[courseKey] || {}),
        ...patch,
      },
    }));
  }

  function toggleCourseHallConstraintValue(courseKey, hallName) {
    if (!courseKey || !hallName) return;
    setCourseHallConstraints((prev) => {
      const current = {
        ...getCourseHallConstraintDefaults(),
        ...(prev[courseKey] || {}),
      };
      const nextHallNames = current.hallNames.includes(hallName)
        ? current.hallNames.filter((name) => name !== hallName)
        : [...current.hallNames, hallName];

      return {
        ...prev,
        [courseKey]: {
          ...current,
          hallNames: nextHallNames,
        },
      };
    });
  }

  function clearCourseHallConstraint(courseKey) {
    if (!courseKey) return;
    setCourseHallConstraints((prev) => {
      const next = { ...prev };
      delete next[courseKey];
      return next;
    });
  }

  function updateDepartmentHallConstraint(departmentKey, patch) {
    const normalizedDepartmentKey = normalizeArabic(departmentKey);
    if (!normalizedDepartmentKey) return;
    setDepartmentHallConstraints((prev) => ({
      ...prev,
      [normalizedDepartmentKey]: {
        ...getDepartmentHallConstraintDefaults(),
        ...(prev[normalizedDepartmentKey] || {}),
        ...patch,
      },
    }));
  }

  function toggleDepartmentHallConstraintValue(departmentKey, hallName) {
    const normalizedDepartmentKey = normalizeArabic(departmentKey);
    if (!normalizedDepartmentKey || !hallName) return;
    setDepartmentHallConstraints((prev) => {
      const current = {
        ...getDepartmentHallConstraintDefaults(),
        ...(prev[normalizedDepartmentKey] || {}),
      };
      const nextHallNames = current.hallNames.includes(hallName)
        ? current.hallNames.filter((name) => name !== hallName)
        : [...current.hallNames, hallName];

      return {
        ...prev,
        [normalizedDepartmentKey]: {
          ...current,
          hallNames: nextHallNames,
        },
      };
    });
  }

  function clearDepartmentHallConstraint(departmentKey) {
    const normalizedDepartmentKey = normalizeArabic(departmentKey);
    if (!normalizedDepartmentKey) return;
    setDepartmentHallConstraints((prev) => {
      const next = { ...prev };
      delete next[normalizedDepartmentKey];
      return next;
    });
  }

  function addHallConstraintDepartmentToList(departmentKey) {
    const normalizedDepartmentKey = normalizeArabic(departmentKey);
    if (!normalizedDepartmentKey) return;
    setSelectedHallConstraintDepartmentKeys((prev) =>
      prev.includes(normalizedDepartmentKey) ? prev : [...prev, normalizedDepartmentKey]
    );
    setSelectedHallConstraintDepartmentKey("");
  }

  function removeHallConstraintDepartmentFromList(departmentKey) {
    const normalizedDepartmentKey = normalizeArabic(departmentKey);
    if (!normalizedDepartmentKey) return;
    setSelectedHallConstraintDepartmentKeys((prev) => {
      const next = prev.filter((key) => key !== normalizedDepartmentKey);
      if (normalizeArabic(selectedHallConstraintDepartmentKey) === normalizedDepartmentKey) {
        setSelectedHallConstraintDepartmentKey("");
      }
      return next;
    });
  }

  function getDepartmentHallConstraint(departmentKey) {
    const normalizedDepartmentKey = normalizeArabic(departmentKey);
    return departmentHallConstraints[normalizedDepartmentKey] || getDepartmentHallConstraintDefaults();
  }

  function getEffectiveHallConstraint(course) {
    const courseConstraint = getCourseHallConstraint(course);
    if (courseConstraint.mode !== "off" && (courseConstraint.hallNames || []).length) {
      return courseConstraint;
    }

    const departmentRoots = normalizeDepartmentList(
      Array.isArray(course?.departmentRoots) ? course.departmentRoots : getCourseDepartmentRoots(course)
    );

    const matchingDepartmentConstraints = departmentRoots
      .map((departmentKey) => getDepartmentHallConstraint(departmentKey))
      .filter((constraint) => constraint.mode !== "off" && (constraint.hallNames || []).length);

    const onlyHallNames = Array.from(
      new Set(
        matchingDepartmentConstraints
          .filter((constraint) => constraint.mode === "only")
          .flatMap((constraint) => constraint.hallNames || [])
      )
    );

    if (onlyHallNames.length) {
      return {
        mode: "only",
        hallNames: onlyHallNames,
      };
    }

    const preferredHallNames = Array.from(
      new Set(
        matchingDepartmentConstraints
          .filter((constraint) => constraint.mode === "prefer")
          .flatMap((constraint) => constraint.hallNames || [])
      )
    );

    if (preferredHallNames.length) {
      return {
        mode: "prefer",
        hallNames: preferredHallNames,
      };
    }

    return getCourseHallConstraintDefaults();
  }

  function updateCourseInvigilatorConstraint(courseKey, patch) {
    if (!courseKey) return;
    setCourseInvigilatorConstraints((prev) => ({
      ...prev,
      [courseKey]: {
        ...getCourseInvigilatorConstraintDefaults(),
        ...(prev[courseKey] || {}),
        ...patch,
      },
    }));
  }

  function toggleCourseInvigilatorConstraintValue(courseKey, invigilatorName) {
    if (!courseKey || !invigilatorName) return;
    setCourseInvigilatorConstraints((prev) => {
      const current = {
        ...getCourseInvigilatorConstraintDefaults(),
        ...(prev[courseKey] || {}),
      };
      const nextInvigilatorNames = current.invigilatorNames.includes(invigilatorName)
        ? current.invigilatorNames.filter((name) => name !== invigilatorName)
        : [...current.invigilatorNames, invigilatorName];

      return {
        ...prev,
        [courseKey]: {
          ...current,
          invigilatorNames: nextInvigilatorNames,
        },
      };
    });
  }

  function clearCourseInvigilatorConstraint(courseKey) {
    if (!courseKey) return;
    setCourseInvigilatorConstraints((prev) => {
      const next = { ...prev };
      delete next[courseKey];
      return next;
    });
  }

  function addInvigilatorConstraintCourseToList(courseKey) {
    if (!courseKey) return;
    setSelectedInvigilatorConstraintCourseKeys((prev) => (prev.includes(courseKey) ? prev : [...prev, courseKey]));
    setSelectedInvigilatorConstraintCourseKey("");
  }

  function removeInvigilatorConstraintCourseFromList(courseKey) {
    if (!courseKey) return;
    setSelectedInvigilatorConstraintCourseKeys((prev) => {
      const next = prev.filter((key) => key !== courseKey);
      if (selectedInvigilatorConstraintCourseKey === courseKey) {
        setSelectedInvigilatorConstraintCourseKey(next[0] || "");
      }
      return next;
    });
  }

  function getCourseInvigilatorConstraint(course) {
    return courseInvigilatorConstraints[course?.key] || getCourseInvigilatorConstraintDefaults();
  }

  function addHallConstraintCourseToList(courseKey) {
    if (!courseKey) return;
    setSelectedHallConstraintCourseKeys((prev) => (prev.includes(courseKey) ? prev : [...prev, courseKey]));
    setSelectedHallConstraintCourseKey(courseKey);
  }

  function removeHallConstraintCourseFromList(courseKey) {
    if (!courseKey) return;
    setSelectedHallConstraintCourseKeys((prev) => {
      const next = prev.filter((key) => key !== courseKey);
      if (selectedHallConstraintCourseKey === courseKey) {
        setSelectedHallConstraintCourseKey(next[0] || "");
      }
      return next;
    });
  }

  function getCourseHallConstraint(course) {
    return courseHallConstraints[course?.key] || getCourseHallConstraintDefaults();
  }

  function filterHallsByCourseHallConstraint(halls, course) {
    const constraint = getEffectiveHallConstraint(course);
    const selectedNames = new Set((constraint.hallNames || []).map((name) => normalizeArabic(name)));

    if (constraint.mode === "only" && selectedNames.size) {
      return halls.filter((hall) => selectedNames.has(normalizeArabic(hall.name)));
    }

    return halls;
  }

  function sortHallsByCourseHallPreference(halls, course) {
    const constraint = getEffectiveHallConstraint(course);
    const selectedNames = new Set((constraint.hallNames || []).map((name) => normalizeArabic(name)));

    return [...halls].sort((a, b) => {
      const aPreferred = selectedNames.has(normalizeArabic(a.name)) ? 1 : 0;
      const bPreferred = selectedNames.has(normalizeArabic(b.name)) ? 1 : 0;

      if (constraint.mode === "prefer") {
        if (aPreferred !== bPreferred) return bPreferred - aPreferred;
      }

      return 0;
    });
  }

  function getEffectiveHallConstraintSummary(course) {
    const constraint = getEffectiveHallConstraint(course);
    const hallNames = Array.from(new Set((constraint.hallNames || []).map((name) => String(name || "").trim()).filter(Boolean)));

    return {
      mode: constraint.mode || "off",
      hallNames,
      label:
        constraint.mode === "only"
          ? `قصر على القاعات: ${hallNames.join("، ") || "-"}`
          : constraint.mode === "prefer"
          ? `تفضيل القاعات: ${hallNames.join("، ") || "-"}`
          : "بدون قيد قاعات خاص",
    };
  }

  function getConstrainedHallsForCourse(halls, course) {
    return filterHallsByCourseHallConstraint(
      (Array.isArray(halls) ? halls : []).filter((hall) => isHallAllowedForCourse(hall, course)),
      course
    );
  }

  function getAssignableConstrainedHallsForSlot(halls, course, slotOrItem, hallUsageMap) {
    return sortHallsByCourseHallPreference(
      getConstrainedHallsForCourse(halls, course).filter((hall) =>
        canAssignHallToCourseInSlot(hall, course, slotOrItem, hallUsageMap)
      ),
      course
    );
  }

  function getMaxRemainingConstrainedHallCapacityForSlot(halls, course, slotOrItem, hallUsageMap) {
    const constrainedHalls = getConstrainedHallsForCourse(halls, course);

    if (!constrainedHalls.length) return 0;

    const maxRemaining = Math.max(
      ...constrainedHalls.map((hall) =>
        getEffectiveAssignableHallCapacityForSlot(hall, course, slotOrItem, hallUsageMap)
      )
    );

    return Number.isFinite(maxRemaining) ? maxRemaining : 0;
  }


  function getCourseSplitConstraint(course) {
    const constraint = getCourseHallConstraint(course);
    return {
      enabled: Boolean(constraint?.splitEnabled),
      hallNames: Array.from(
        new Set((constraint?.splitHallNames || []).map((name) => String(name || "").trim()).filter(Boolean))
      ),
    };
  }

  function getSplitAssignableHallCombinationForSlot(halls, course, slotOrItem, hallUsageMap) {
    const splitConstraint = getCourseSplitConstraint(course);
    if (!splitConstraint.enabled || splitConstraint.hallNames.length < 2) return [];

    const allowedNames = new Set(splitConstraint.hallNames.map((name) => normalizeArabic(name)));
    const candidates = getConstrainedHallsForCourse(halls, course)
      .filter((hall) => allowedNames.has(normalizeArabic(hall.name)))
      .map((hall) => ({
        hall,
        remaining: getEffectiveAssignableHallCapacityForSlot(hall, course, slotOrItem, hallUsageMap),
      }))
      .filter((item) => item.remaining > 0)
      .sort((a, b) => b.remaining - a.remaining || Number(b.hall.capacity) - Number(a.hall.capacity));

    const selected = [];
    let remainingStudents = Number(course?.studentCount) || 0;

    for (const item of candidates) {
      const available = Number(item.remaining) || 0;
      if (available <= 0) continue;

      const assignedSeats = Math.min(remainingStudents, available);
      if (assignedSeats <= 0) continue;

      selected.push({
        hall: item.hall,
        seats: assignedSeats,
      });
      remainingStudents -= assignedSeats;

      if (remainingStudents <= 0) break;
    }

    return remainingStudents <= 0 && selected.length >= 2 ? selected : [];
  }

  function canAssignCourseToSlotWithSplit(halls, course, slotOrItem, hallUsageMap) {
    const singleHallMatches = getAssignableConstrainedHallsForSlot(halls, course, slotOrItem, hallUsageMap);
    if (singleHallMatches.length) return true;
    return getSplitAssignableHallCombinationForSlot(halls, course, slotOrItem, hallUsageMap).length >= 2;
  }

  function getMaxAssignableCapacityForSlotIncludingSplit(halls, course, slotOrItem, hallUsageMap) {
    const singleHallCapacity = getMaxRemainingConstrainedHallCapacityForSlot(halls, course, slotOrItem, hallUsageMap);
    const splitAssignments = getSplitAssignableHallCombinationForSlot(halls, course, slotOrItem, hallUsageMap);
    const splitCapacity = splitAssignments.reduce((sum, entry) => sum + (Number(entry.seats) || 0), 0);
    return Math.max(singleHallCapacity, splitCapacity);
  }

  function getManualMoveConflictItems(course, targetSlotId, ignoredInstanceId = "") {
    if (!course || !targetSlotId) return [];

    const sourceStudents = new Set(Array.from(course.students || []));

    return schedule
      .filter((item) => item.id === targetSlotId && (!ignoredInstanceId || item.instanceId !== ignoredInstanceId))
      .map((item) => {
        const sharedStudentIds = (item.students || []).filter((studentId) => sourceStudents.has(studentId));
        if (!sharedStudentIds.length) return null;

        const students = sharedStudentIds
          .map((studentId) =>
            preciseStudentInfoMap.get(studentId) || {
              id: studentId,
              name: "بدون اسم",
              department: "-",
              major: "-",
            }
          )
          .sort((a, b) => a.name.localeCompare(b.name, "ar") || a.id.localeCompare(b.id, "ar"));

        return {
          courseKey: item.key,
          courseName: item.courseName || "-",
          courseCode: item.courseCode || "-",
          examHall: item.examHall || "غير محدد",
          sharedCount: students.length,
          students,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.sharedCount - a.sharedCount || a.courseName.localeCompare(b.courseName, "ar"));
  }

  function openManualConflictToast(course, targetSlot, conflictingItems) {
    const totalShared = conflictingItems.reduce((sum, item) => sum + item.sharedCount, 0);
    setSelectedManualMoveConflicts({
      sourceCourseName: course.courseName || "-",
      sourceCourseCode: course.courseCode || "-",
      targetSlot,
      conflicts: conflictingItems,
      totalShared,
    });
    showToast(
      "تعذر النقل",
      `يوجد ${formatTraineeCountLabel(totalShared)} متعارضون موزعون على ${formatCourseCountLabel(conflictingItems.length)} في هذه الفترة.`,
      "error",
      {
        persistent: true,
        actions: [
          {
            label: "عرض المتعارضين",
            onClick: () => {
              setSelectedManualMoveConflicts({
                sourceCourseName: course.courseName || "-",
                sourceCourseCode: course.courseCode || "-",
                targetSlot,
                conflicts: conflictingItems,
                totalShared,
              });
            },
          },
        ],
      }
    );
  }

  function buildManualPlacementContext(currentSchedule = [], ignoreInstanceId = "") {
    const baseInvigilators = manualInvigilators
      ? manualInvigilators.split(/\r?\n/).map((name) => name.trim()).filter(Boolean)
      : parsed.invigilators;

    const invigilatorPool = [
      ...new Set(
        baseInvigilators.filter((name) => {
          const normalizedName = normalizeArabic(name);

          const manuallyExcluded = excludedInvigilators.some(
            (excluded) => normalizeArabic(excluded) === normalizedName
          );

          const excludedBecauseGeneralStudiesOnly =
            !includeAllDepartmentsAndMajors &&
            excludedInvigilatorsForSelectedDepartments.has(normalizedName);

          return !manuallyExcluded && !excludedBecauseGeneralStudiesOnly;
        })
      ),
    ];

    const specializedScopedInvigilatorPool = restrictSpecializedInvigilationToVisibleDepartmentTrainers
      ? invigilatorPool.filter((name) =>
          specializedVisibleDepartmentTrainerNameSet.has(normalizeArabic(name))
        )
      : invigilatorPool;

    const generalStudiesScopedInvigilatorPool = restrictGeneralStudiesInvigilationToGeneralStudiesTrainers
      ? invigilatorPool.filter((name) =>
          generalStudiesInvigilatorsSet.has(normalizeArabic(name))
        )
      : invigilatorPool;

    const invigilatorLoad = new Map(invigilatorPool.map((name) => [name, 0]));
    const invigilatorBusyPeriods = new Map(invigilatorPool.map((name) => [name, new Set()]));
    const invigilatorDayLoad = new Map(invigilatorPool.map((name) => [name, new Map()]));

    (Array.isArray(currentSchedule) ? currentSchedule : [])
      .filter((item) => item && item.instanceId !== ignoreInstanceId)
      .forEach((item) => {
        const periodKey = getSlotPeriodKey(item);
        (item.invigilators || []).forEach((name) => {
          if (!invigilatorLoad.has(name)) invigilatorLoad.set(name, 0);
          if (!invigilatorBusyPeriods.has(name)) invigilatorBusyPeriods.set(name, new Set());
          if (!invigilatorDayLoad.has(name)) invigilatorDayLoad.set(name, new Map());
          invigilatorLoad.set(name, (invigilatorLoad.get(name) || 0) + 1);
          invigilatorBusyPeriods.get(name).add(periodKey);
          const dayLoadMap = invigilatorDayLoad.get(name);
          dayLoadMap.set(item.dateISO, (dayLoadMap.get(item.dateISO) || 0) + 1);
        });
      });

    const getMinInvigilatorLoad = () => {
      const values = Array.from(invigilatorLoad.values());
      return values.length ? Math.min(...values) : 0;
    };

    const getInvigilatorDayLoadForDate = (name, dateISO) =>
      invigilatorDayLoad.get(name)?.get(dateISO) || 0;

    const rankInvigilatorForFairness = (
      name,
      slot,
      preferTrainer = false,
      hardFairness = false
    ) => {
      const load = invigilatorLoad.get(name) || 0;
      const minLoad = getMinInvigilatorLoad();
      const dayLoad = slot ? getInvigilatorDayLoadForDate(name, slot.dateISO) : 0;
      const overloadPenalty = hardFairness
        ? (load > minLoad ? 100000 : 0)
        : (load > minLoad + 1 ? 1000 : 0);
      const sameDayPenalty = hardFairness
        ? (dayLoad > 0 ? 20 + dayLoad * 10 : 0)
        : (dayLoad > 0 ? 3 + dayLoad * 2 : 0);
      const trainerBonus = preferTrainer && !hardFairness ? -0.15 : 0;
      return load + overloadPenalty + sameDayPenalty + trainerBonus;
    };

    const pickInvigilatorsForSlot = (course, slot) => {
      if (!includeInvigilators) return [];

      const requiredCount = getRequiredInvigilatorsCount(course);
      const periodKey = getSlotPeriodKey(slot);
      const chosen = [];

      const courseTrainerNames = String(course.trainerText || "")
        .split("/")
        .map((name) => name.trim())
        .filter(Boolean);

      const normalizedTrainerSet = new Set(
        courseTrainerNames.map((name) => normalizeArabic(name))
      );

      const constraint =
        typeof getCourseInvigilatorConstraint === "function"
          ? getCourseInvigilatorConstraint(course)
          : { mode: "off", invigilatorNames: [] };

      const scopedPool = isGeneralStudiesCourse(course)
        ? (restrictGeneralStudiesInvigilationToGeneralStudiesTrainers
            ? generalStudiesScopedInvigilatorPool
            : invigilatorPool)
        : (restrictSpecializedInvigilationToVisibleDepartmentTrainers &&
          !includeAllDepartmentsAndMajors
            ? specializedScopedInvigilatorPool
            : invigilatorPool);

      const baseCandidates = scopedPool
        .filter(
          (name) =>
            !excludedInvigilators.some(
              (ex) => normalizeArabic(ex) === normalizeArabic(name)
            )
        )
        .filter((name) => !invigilatorBusyPeriods.get(name)?.has(periodKey));

      if (restrictSpecializedInvigilationToVisibleDepartmentTrainers && !includeAllDepartmentsAndMajors) {
        console.warn("INVIGILATOR_SCOPE_DEBUG", {
          courseName: course?.courseName,
          courseCode: course?.courseCode,
          department: course?.department,
          major: course?.major,
          scopedPoolCount: scopedPool.length,
          baseCandidatesCount: baseCandidates.length,
          scopedPool,
          baseCandidates,
        });
      }

      const normalizedManualSet = new Set(
        (constraint.invigilatorNames || []).map((name) => normalizeArabic(name))
      );

      const departmentTrainerSet = new Set(
        (
          (typeof getStrictTrainerNamesForCourse === "function"
            ? getStrictTrainerNamesForCourse(course, parsed.filteredRows, generalStudiesInvigilatorsSet)
            : []) || []
        ).map((name) => normalizeArabic(name))
      );

      let constrainedCandidates = [...baseCandidates];
      let strictOnlyMode = false;

      if (
        restrictSpecializedInvigilationToVisibleDepartmentTrainers &&
        !includeAllDepartmentsAndMajors &&
        !isGeneralStudiesCourse(course)
      ) {
        strictOnlyMode = true;
        constrainedCandidates = baseCandidates.filter((name) =>
          departmentTrainerSet.has(normalizeArabic(name))
        );
      }

      switch (constraint.mode) {
        case "only":
          strictOnlyMode = true;
          constrainedCandidates = baseCandidates.filter((name) =>
            normalizedManualSet.has(normalizeArabic(name))
          );
          break;

        case "avoid":
          constrainedCandidates = baseCandidates.filter(
            (name) => !normalizedManualSet.has(normalizeArabic(name))
          );
          break;

        case "only_department_trainers":
          strictOnlyMode = true;
          constrainedCandidates = baseCandidates.filter((name) =>
            departmentTrainerSet.has(normalizeArabic(name))
          );
          break;

        case "avoid_department_trainers":
          constrainedCandidates = baseCandidates.filter(
            (name) => !departmentTrainerSet.has(normalizeArabic(name))
          );
          break;

        case "prefer":
        default:
          constrainedCandidates = baseCandidates;
          break;
      }

      const hardFairnessForThisCourse =
        (restrictSpecializedInvigilationToVisibleDepartmentTrainers &&
          !includeAllDepartmentsAndMajors &&
          !isGeneralStudiesCourse(course)) ||
        (restrictGeneralStudiesInvigilationToGeneralStudiesTrainers &&
          isGeneralStudiesCourse(course));

      const sortCandidates = (candidates) =>
        [...candidates].sort((a, b) => {
          const aScore = rankInvigilatorForFairness(
            a,
            slot,
            preferCourseTrainerInvigilation &&
              normalizedTrainerSet.has(normalizeArabic(a)),
            hardFairnessForThisCourse
          );
          const bScore = rankInvigilatorForFairness(
            b,
            slot,
            preferCourseTrainerInvigilation &&
              normalizedTrainerSet.has(normalizeArabic(b)),
            hardFairnessForThisCourse
          );

          return aScore - bScore || a.localeCompare(b, "ar");
        });

      while (chosen.length < requiredCount) {
        const minLoad = getMinInvigilatorLoad();

        const fairCandidates = sortCandidates(
          constrainedCandidates
            .filter((name) => !chosen.includes(name))
            .filter((name) =>
              (invigilatorLoad.get(name) || 0) <=
              (hardFairnessForThisCourse ? minLoad : minLoad + 1)
            )
        );

        if (!fairCandidates.length) break;
        chosen.push(fairCandidates[0]);
      }

      if (chosen.length < requiredCount) {
        const minLoad = getMinInvigilatorLoad();
        const nearFairCandidates = sortCandidates(
          constrainedCandidates
            .filter((name) => !chosen.includes(name))
            .filter((name) =>
              (invigilatorLoad.get(name) || 0) <=
              (hardFairnessForThisCourse ? minLoad + 1 : minLoad + 2)
            )
        );

        for (const name of nearFairCandidates) {
          if (chosen.length >= requiredCount) break;
          chosen.push(name);
        }
      }

      if (!hardFairnessForThisCourse && chosen.length < requiredCount) {
        const fallbackCandidates = sortCandidates(
          constrainedCandidates.filter((name) => !chosen.includes(name))
        );

        for (const name of fallbackCandidates) {
          if (chosen.length >= requiredCount) break;
          chosen.push(name);
        }
      }

      chosen.forEach((name) => {
        if (!invigilatorBusyPeriods.has(name)) {
          invigilatorBusyPeriods.set(name, new Set());
        }
        if (!invigilatorDayLoad.has(name)) {
          invigilatorDayLoad.set(name, new Map());
        }

        invigilatorLoad.set(name, (invigilatorLoad.get(name) || 0) + 1);
        invigilatorBusyPeriods.get(name).add(periodKey);
        const dayLoadMap = invigilatorDayLoad.get(name);
        dayLoadMap.set(slot.dateISO, (dayLoadMap.get(slot.dateISO) || 0) + 1);
      });

      return chosen;
    };

    return { pickInvigilatorsForSlot };
  }

  function resolveManualPlacementResources(course, targetSlot, currentSchedule = [], ignoreInstanceId = "") {
    const hallUsageMap = new Map();
    (Array.isArray(currentSchedule) ? currentSchedule : [])
      .filter((item) => item && item.instanceId !== ignoreInstanceId && item.id === targetSlot.id)
      .forEach((item) => {
        getScheduledItemHallAssignments(item).forEach((entry) => {
          const key = getHallUsageKey(targetSlot, entry.hallName);
          hallUsageMap.set(key, (hallUsageMap.get(key) || 0) + (Number(entry.seats) || 0));
        });
      });

    const fittingHalls = getAssignableConstrainedHallsForSlot(
      normalizedExamHalls,
      course,
      targetSlot,
      hallUsageMap
    );

    let assignedHall = "";
    let assignedHallAssignments = [];
    if (fittingHalls.length) {
      assignedHall = fittingHalls[0].name;
      assignedHallAssignments = [
        {
          hallName: fittingHalls[0].name,
          seats: Number(course.studentCount) || 0,
        },
      ];
      reserveHallForCourseInSlot(fittingHalls[0], course, targetSlot, hallUsageMap);
    } else {
      const splitAssignments = getSplitAssignableHallCombinationForSlot(
        normalizedExamHalls,
        course,
        targetSlot,
        hallUsageMap
      );

      if (splitAssignments.length) {
        assignedHallAssignments = splitAssignments.map((entry) => ({
          hallName: entry.hall.name,
          seats: entry.seats,
        }));
        assignedHall = assignedHallAssignments.map((entry) => entry.hallName).join(" + ");
        splitAssignments.forEach((entry) => {
          reserveSeatsInHallForSlot(entry.hall, targetSlot, hallUsageMap, entry.seats);
        });
      } else {
        const hallConstraintSummary = getEffectiveHallConstraintSummary(course);
        const maxRemaining = getMaxRemainingConstrainedHallCapacityForSlot(
          normalizedExamHalls,
          course,
          targetSlot,
          hallUsageMap
        );

        return {
          ok: false,
          reasonType: "hall",
          reasonMessage:
            hallConstraintSummary.mode === "only"
              ? `تعذر وضع المقرر في هذه الفترة لأن قيد القاعات الفعّال هو: ${hallConstraintSummary.label}. أكبر سعة متبقية بعد تطبيق القيد هي ${Number(maxRemaining) || 0}.`
              : `تعذر وضع المقرر في هذه الفترة لعدم توفر قاعة مناسبة. يحتاج ${Number(course.studentCount) || 0} مقعدًا، وأكبر سعة متبقية بعد تطبيق القيود هي ${Number(maxRemaining) || 0}.`,
        };
      }
    }

    const { pickInvigilatorsForSlot } = buildManualPlacementContext(currentSchedule, ignoreInstanceId);
    const pickedInvigilators = pickInvigilatorsForSlot(course, targetSlot);
    const requiredInvigilators = includeInvigilators ? getRequiredInvigilatorsCount(course) : 0;

    if (includeInvigilators && pickedInvigilators.length < requiredInvigilators) {
      return {
        ok: false,
        reasonType: "invigilators",
        reasonMessage: `${isGeneralStudiesCourse(course) && restrictGeneralStudiesInvigilationToGeneralStudiesTrainers
          ? `تعذر وضع المقرر في هذه الفترة لعدم توفر عدد كافٍ من مدربي مقررات الدراسات العامة. المطلوب ${requiredInvigilators}، والمتاح فعليًا ${pickedInvigilators.length}.`
          : (!isGeneralStudiesCourse(course) && restrictSpecializedInvigilationToVisibleDepartmentTrainers && !includeAllDepartmentsAndMajors)
            ? `تعذر وضع المقرر في هذه الفترة لعدم توفر عدد كافٍ من مدربي مقررات القسم/التخصص المحدد. المطلوب ${requiredInvigilators}، والمتاح فعليًا ${pickedInvigilators.length}.`
            : `تعذر وضع المقرر في هذه الفترة لعدم توفر عدد كافٍ من المراقبين. المطلوب ${requiredInvigilators}، والمتاح فعليًا ${pickedInvigilators.length}.`}`,
      };
    }

    return {
      ok: true,
      assignedHall,
      assignedHallAssignments,
      invigilators: pickedInvigilators,
    };
  }

  function placeUnscheduledCourseInSlot(courseKey, targetSlotId) {
    if (manualScheduleLocked) return;

    const course = parsed.courses.find((item) => item.key === courseKey) || unscheduled.find((item) => item.key === courseKey);
    if (!canEditManualCourse(course)) {
      showGeneralStudiesManualLockToast();
      return;
    }
    const targetSlot = slots.find((slot) => slot.id === targetSlotId);
    if (!course || !targetSlot) return;

    const conflictingItems = getManualMoveConflictItems(course, targetSlotId);
    if (conflictingItems.length) {
      openManualConflictToast(course, targetSlot, conflictingItems);
      return;
    }

    const manualPlacement = resolveManualPlacementResources(course, targetSlot, schedule);
    if (!manualPlacement.ok) {
      showToast("تعذر الإسناد اليدوي", manualPlacement.reasonMessage, "error");
      return;
    }

    const assignedHall = manualPlacement.assignedHall;

    const placedItem = {
      ...course,
      ...targetSlot,
      instanceId: makeScheduledInstanceId(),
      students: Array.from(course.students || []),
      trainers: Array.from(course.trainers || []),
      departments: Array.from(course.departments || []),
      majors: Array.from(course.majors || []),
      sectionNames: Array.from(course.sectionNames || []),
      scheduleTypes: Array.from(course.scheduleTypes || []),
      departmentRoots: Array.from(course.departmentRoots || []),
      examHall: assignedHall,
      examHallAssignments: manualPlacement.assignedHallAssignments,
      invigilators: manualPlacement.invigilators,
      manualEdited: true,
      isPinned: false,
    };

    setSchedule((prev) =>
      [...prev, placedItem].sort(
        (a, b) => a.dateISO.localeCompare(b.dateISO) || a.period - b.period || b.studentCount - a.studentCount
      )
    );
    setUnscheduled((prev) => prev.filter((item) => item.key !== course.key));
    setDraggingUnscheduledCourseKey("");
    setActiveDropSlotId("");
    showToast("تمت الإضافة", "تمت إضافة المقرر إلى الفترة المحددة بنجاح.", "success");
  }

  function addConstraintCourseToList(courseKey) {
    if (!courseKey) return;
    setSelectedConstraintCourseKeys((prev) => (prev.includes(courseKey) ? prev : [...prev, courseKey]));
    setSelectedConstraintCourseKey(courseKey);
  }

  function removeConstraintCourseFromList(courseKey) {
    if (!courseKey) return;
    setSelectedConstraintCourseKeys((prev) => {
      const next = prev.filter((key) => key !== courseKey);
      if (selectedConstraintCourseKey === courseKey) {
        setSelectedConstraintCourseKey(next[0] || "");
      }
      return next;
    });
  }

  function moveScheduledCourseToSlot(itemId, targetSlotId) {
    if (manualScheduleLocked) return;

    setSchedule((prev) => {
      const sourceItem = prev.find((item) => item.instanceId === itemId);
      if (!canEditManualCourse(sourceItem)) {
        showGeneralStudiesManualLockToast();
        return prev;
      }
      const targetSlot = slots.find((slot) => slot.id === targetSlotId);

      if (!sourceItem || !targetSlot || sourceItem.id === targetSlotId) {
        return prev;
      }

      const conflictingItems = getManualMoveConflictItems(sourceItem, targetSlotId, itemId);

      if (conflictingItems.length) {
        openManualConflictToast(sourceItem, targetSlot, conflictingItems);
        return prev;
      }

      const manualPlacement = resolveManualPlacementResources(sourceItem, targetSlot, prev, itemId);
      if (!manualPlacement.ok) {
        showToast("تعذر النقل", manualPlacement.reasonMessage, "error");
        return prev;
      }

      return prev.map((item) =>
        item.instanceId === itemId
          ? {
              ...item,
              ...targetSlot,
              examHall: manualPlacement.assignedHall,
              examHallAssignments: manualPlacement.assignedHallAssignments,
              invigilators: manualPlacement.invigilators,
              manualEdited: true,
            }
          : item
      );
    });
  }


  function togglePinScheduledCourse(itemId) {
    setSchedule((prev) => {
      const targetItem = prev.find((item) => item.instanceId === itemId);
      if (!canEditManualCourse(targetItem)) {
        showGeneralStudiesManualLockToast();
        return prev;
      }
      return prev.map((item) =>
        item.instanceId === itemId ? { ...item, isPinned: !item.isPinned } : item
      );
    });
  }

  function unscheduleCourseManually(itemId) {
    if (manualScheduleLocked) return;

    const currentItem = schedule.find((item) => item.instanceId === itemId);
    if (!canEditManualCourse(currentItem)) {
      showGeneralStudiesManualLockToast();
      return;
    }

    let removedItem = null;

    setSchedule((prev) => {
      removedItem = prev.find((item) => item.instanceId === itemId) || null;
      return prev.filter((item) => item.instanceId !== itemId);
    });

    if (removedItem) {
      setUnscheduled((prev) => [
        ...prev,
        {
          ...removedItem,
          unscheduledReason: removedItem.unscheduledReason || "تم نقل المقرر يدويًا إلى قائمة غير المجدول.",
        },
      ]);
    }
  }

  function restoreUnscheduledCourse(courseKey) {
    if (manualScheduleLocked) return;

    const course = parsed.courses.find((item) => item.key === courseKey);
    if (!canEditManualCourse(course)) {
      showGeneralStudiesManualLockToast();
      return;
    }
    if (!course) return;

    const result = generateScheduleForCourses([course], schedule);
    if (!result?.placed?.length) {
      showToast("تعذر الإعادة", "لم يتم العثور على فترة مناسبة لهذا المقرر.", "error");
      return;
    }

    setSchedule((prev) =>
      [...prev, ...result.placed].sort(
        (a, b) => a.dateISO.localeCompare(b.dateISO) || a.period - b.period || b.studentCount - a.studentCount
      )
    );
    setUnscheduled((prev) => prev.filter((item) => item.key !== courseKey));
    showToast("تمت الإعادة", "تمت إعادة جدولة المقرر بنجاح.", "success");
  }

  function clearAllPinnedCourses() {
    setSchedule((prev) => prev.map((item) => ({ ...item, isPinned: false })));
    showToast("تم إلغاء التثبيت", "تم إلغاء تثبيت جميع المقررات.", "success");
  }

  function redistributeUnpinnedCourses() {
    if (manualScheduleLocked) return;

    const pinnedCourses = schedule.filter((item) => item.isPinned);
    const candidateKeys = new Set([
      ...schedule.filter((item) => !item.isPinned).map((item) => item.key),
      ...unscheduled.map((item) => item.key),
    ]);

    const coursesToRedistribute = Array.from(candidateKeys)
      .map((courseKey) => parsed.courses.find((course) => course.key === courseKey) || unscheduled.find((course) => course.key === courseKey) || schedule.find((course) => course.key === courseKey))
      .filter(Boolean);

    if (!coursesToRedistribute.length) {
      showToast("لا توجد مقررات", "لا توجد مقررات غير مثبتة لإعادة توزيعها.", "warning");
      return;
    }

    const result = generateScheduleForCourses(coursesToRedistribute, pinnedCourses);
    const placed = Array.isArray(result?.placed) ? result.placed : [];
    const notPlaced = Array.isArray(result?.notPlaced) ? result.notPlaced : [];
    const nextHallWarnings = Array.isArray(result?.hallWarnings) ? result.hallWarnings : [];

    const mergedSchedule = [...pinnedCourses, ...placed].sort(
      (a, b) => a.dateISO.localeCompare(b.dateISO) || a.period - b.period || b.studentCount - a.studentCount
    );

    setSchedule(mergedSchedule);
    setUnscheduled(notPlaced);
    setHallWarnings(nextHallWarnings);

    if (notPlaced.length) {
      showToast(
        "تمت إعادة التوزيع مع ملاحظات",
        `تمت إعادة توزيع ${formatCourseCountLabel(placed.length)}، وتعذر جدولة ${formatCourseCountLabel(notPlaced.length)}.`,
        "warning"
      );
    } else {
      showToast("تمت إعادة التوزيع", `تمت إعادة توزيع ${formatCourseCountLabel(placed.length)} غير مثبت بنجاح.`, "success");
    }
  }

  const normalizedExamHalls = useMemo(() => normalizeExamHallsInput(examHalls), [examHalls]);

  const [previewPage, setPreviewPage] = useState(0);
  const [selectedStudentIdForPrint, setSelectedStudentIdForPrint] = useState("");
  const [compactPrintMode, setCompactPrintMode] = useState(false);
const [courseAKey, setCourseAKey] = useState("");
const [courseBKey, setCourseBKey] = useState("");
  const [includeInvigilators, setIncludeInvigilators] = useState(true);
  const [excludedInvigilators, setExcludedInvigilators] = useState([]);
  const [excludeInactive, setExcludeInactive] = useState(true);
  const [prioritizeTrainer, setPrioritizeTrainer] = useState("");
  const [manualInvigilators, setManualInvigilators] = useState("");
  const [invigilatorsPerPeriod, setInvigilatorsPerPeriod] = useState(4);
  const [manualCollegeLocation, setManualCollegeLocation] = useState("");
  const [autoDetectedCollegeLocation, setAutoDetectedCollegeLocation] = useState("");
  const [excludedCourses, setExcludedCourses] = useState([]);
  const [includeAllDepartmentsAndMajors, setIncludeAllDepartmentsAndMajors] = useState(true);
  const [restrictSpecializedInvigilationToVisibleDepartmentTrainers, setRestrictSpecializedInvigilationToVisibleDepartmentTrainers] = useState(false);
  const [restrictGeneralStudiesInvigilationToGeneralStudiesTrainers, setRestrictGeneralStudiesInvigilationToGeneralStudiesTrainers] = useState(false);

  const isGeneralStudiesManualEditLocked = !includeAllDepartmentsAndMajors;

  function canEditManualCourse(courseLike) {
    if (!courseLike) return false;
    if (!isGeneralStudiesManualEditLocked) return true;
    return !isGeneralStudiesCourse(courseLike);
  }

  function showGeneralStudiesManualLockToast() {
    showToast(
      "الدراسات العامة مقفلة",
      "لا يمكن تعديل مقررات الدراسات العامة يدويًا عند تفعيل توزيع التخصصات والأقسام بشكل مستقل.",
      "warning"
    );
  }
  const [excludedDepartmentMajors, setExcludedDepartmentMajors] = useState([]);
  const [lockGeneralStudiesStep, setLockGeneralStudiesStep] = useState(false);
  const [printDepartmentFilter, setPrintDepartmentFilter] = useState("__all__");
  const [avoidSameLevelSameDay, setAvoidSameLevelSameDay] = useState(false);
  const [courseLevels, setCourseLevels] = useState({});
  const [draggingCourseKey, setDraggingCourseKey] = useState("");
  const [preferCourseTrainerInvigilation, setPreferCourseTrainerInvigilation] = useState(false);
  const [printMajorFilter, setPrintMajorFilter] = useState("__all__");
  const [generalSchedule, setGeneralSchedule] = useState([]);
  const [specializedSchedule, setSpecializedSchedule] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [unscheduled, setUnscheduled] = useState([]);
const [expandedUnscheduledCourseKeys, setExpandedUnscheduledCourseKeys] = useState([]);
const [selectedUnscheduledReasonModal, setSelectedUnscheduledReasonModal] = useState(null);
  const [hasImportedSessionFile, setHasImportedSessionFile] = useState(false);
  const [pendingRestore, setPendingRestore] = useState(null);
  const [didRestore, setDidRestore] = useState(false);
  const [storageMode, setStorageMode] = useState("localStorage");
  const [pageVisible, setPageVisible] = useState(true);


const handleUpload = (file) => {
  if (!file) return;

  setFileName(file.name);
  setStudentSearchText("");
  setShowStudentSuggestions(false);

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    encoding: "UTF-8",
    complete: (result) => {
      const cleanRows = (result.data || []).filter((row) =>
        Object.values(row).some((v) => String(v ?? "").trim() !== "")
      );

      const extractedCollegeName = String(cleanRows[0]?.["الوحدة"] || "").trim();

      setRows(cleanRows);
      setCollegeNameInput((prev) => {
        const manualName = String(prev || "").trim();
        const fileNameFromRow = extractedCollegeName;

        if (!fileNameFromRow) return prev;
        if (!manualName) return fileNameFromRow;

        return areCollegeNamesClose(manualName, fileNameFromRow) ? prev : fileNameFromRow;
      });

      setSchedule([]);
      setGeneralSchedule([]);
      setSpecializedSchedule([]);
      setUnscheduled([]);
      setExpandedUnscheduledCourseKeys([]);
      setSelectedUnscheduledReasonModal(null);
      setHallWarnings([]);
      setShowAdvancedManagementOptions(false);
      setShowHallConstraintPreferences(false);
      setShowCourseExclusionsPreference(false);
      setShowGeneralSpecializedSeparationPreference(false);
      setShowSamePeriodPreference(false);
      setShowCourseTimePreference(false);
      setShowAvoidSameLevelSameDayPreference(false);
      setShowInvigilatorConstraintPreference(false);
      setEnableSamePeriodGroups(false);
      setSamePeriodGroups([]);
      setDraggingSamePeriodCourseKey("");
      setMaxExamsPerStudentPerDay(2);
      setCourseConstraints({});
      setSelectedConstraintCourseKey("");
      setSelectedConstraintCourseKeys([]);
      setCourseHallConstraints({});
      setDepartmentHallConstraints({});
      setSelectedHallConstraintCourseKey("");
      setSelectedHallConstraintCourseKeys([]);
      setSelectedHallConstraintDepartmentKey("");
      setSelectedHallConstraintDepartmentKeys([]);
      setManualScheduleLocked(false);
      setGeneralSpecializedDaySeparationMode("off");
      setDraggingScheduleItemId("");
      setDraggingUnscheduledCourseKey("");
      setActiveDropSlotId("");
      setExcludedCourses(getDefaultExcludedPracticalCourseKeys(cleanRows));
      setIncludeAllDepartmentsAndMajors(true);
      setRestrictSpecializedInvigilationToVisibleDepartmentTrainers(false);
      setRestrictGeneralStudiesInvigilationToGeneralStudiesTrainers(false);
      setExcludedDepartmentMajors([]);
      setLockGeneralStudiesStep(false);
      setCourseLevels({});
      setPreviewPage(0);
      setPreviewTab("sortedCourses");
      setSelectedStudentIdForPrint("");
      setCompactPrintMode(false);
      setCurrentStep(1);
      setHasImportedSessionFile(false);
      pendingRestoreRef.current = null;
      setPendingRestore(null);
      setDidRestore(true);
      setToast(null);

      showToast("تم رفع الملف", `تم تحليل الملف ${file.name} بنجاح.`, "success");
    },
    error: (err) => {
      showToast("تعذر قراءة الملف", err.message || "تحقق من صحة ملف CSV.", "error");
    },
  });
};

const showToast = (title, description, type = "success", options = {}) => {
  const nextToast = { title, description, type, ...options };
  setToast(nextToast);

  const duration =
    options.persistent || options.action === "restore_session"
      ? null
      : type === "error"
      ? 7000
      : type === "warning"
      ? 6000
      : 4000;

  if (toastTimerRef.current) {
    window.clearTimeout(toastTimerRef.current);
  }
  if (duration) {
    toastTimerRef.current = window.setTimeout(() => setToast(null), duration);
  }
};

const openUnscheduledCoursesPreview = (focusReason = false) => {
  setPreviewTab("schedule");
  setCurrentStep(9);
  setPreviewPage(0);

  window.requestAnimationFrame(() => {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  if (focusReason) {
    showToast(
      "المقررات غير المجدولة",
      "يمكنك الآن مراجعة المقررات غير المجدولة مع سبب كل مقرر داخل صفحة المعاينة.",
      "warning"
    );
  }
};

const getUnscheduledReasonCategory = (courseOrReason) => {
  const reason = typeof courseOrReason === "string"
    ? courseOrReason
    : String(courseOrReason?.unscheduledReason || "");
  const normalized = normalizeArabic(reason);

  if (!normalized) {
    return {
      code: "generic",
      shortLabel: "تعذر الجدولة",
    };
  }

  if (normalized.includes("قاعة")) {
    return {
      code: "hall",
      shortLabel: "لا توجد قاعة مناسبة",
    };
  }

  if (normalized.includes("مراقب")) {
    return {
      code: "invigilator",
      shortLabel: "لا يوجد مراقبون كافيون",
    };
  }

  if (
    normalized.includes("تعارض") ||
    normalized.includes("متدرب") ||
    normalized.includes("حد اليوم") ||
    normalized.includes("مستوى") ||
    normalized.includes("قيود") ||
    normalized.includes("فتره") ||
    normalized.includes("فترة") ||
    normalized.includes("يوم")
  ) {
    return {
      code: "constraint",
      shortLabel: "تعارض أو قيود",
    };
  }

  if (normalized.includes("نقل") || normalized.includes("يدوي")) {
    return {
      code: "manual",
      shortLabel: "تم نقله يدويًا",
    };
  }

  return {
    code: "other",
    shortLabel: "سبب آخر",
  };
};

const formatArabicCountLabel = (count, forms = {}) => {
  const n = Number(count) || 0;
  const singular = forms.singular || "";
  const dual = forms.dual || singular;
  const plural = forms.plural || singular;

  if (n === 1) return `${n} ${singular}`;
  if (n === 2) return `${n} ${dual}`;
  if (n >= 3 && n <= 10) return `${n} ${plural}`;
  return `${n} ${singular}`;
};

const formatCourseCountLabel = (count) =>
  formatArabicCountLabel(count, {
    singular: "مقرر",
    dual: "مقررين",
    plural: "مقررات",
  });

const formatTraineeCountLabel = (count) =>
  formatArabicCountLabel(count, {
    singular: "متدرب",
    dual: "متدربين",
    plural: "متدربين",
  });

const buildUnscheduledSummaryText = (notPlaced = []) => {
  const total = Array.isArray(notPlaced) ? notPlaced.length : 0;
  if (!total) return "لم يتبق أي مقرر غير مجدول.";

  const reasonMap = new Map();

  notPlaced.forEach((item) => {
    const reasonInfo = normalizeUnscheduledReason(item);
    const summaryReason =
      String(reasonInfo?.shortLabel || "")
        .replace(/\s+/g, " ")
        .trim() ||
      String(reasonInfo?.detail || "")
        .replace(/\s+/g, " ")
        .trim() ||
      "سبب غير محدد";

    reasonMap.set(summaryReason, (reasonMap.get(summaryReason) || 0) + 1);
  });

  const sortedReasons = Array.from(reasonMap.entries()).sort((a, b) => b[1] - a[1]);

  return [
    `تعذر جدولة ${formatCourseCountLabel(total)}.`,
    ...sortedReasons.map(([reason, count]) => `${formatCourseCountLabel(count)} بسبب ${reason}.`),
  ].join(" ");
};

const toggleExpandedUnscheduledCourse = (courseKey) => {
  if (!courseKey) return;
  setExpandedUnscheduledCourseKeys((prev) =>
    prev.includes(courseKey)
      ? prev.filter((key) => key !== courseKey)
      : [...prev, courseKey]
  );
};

const formatSlotBadgeLabel = (slot) => {
  if (!slot) return "";
  const day = String(slot.dayName || "").trim();
  const date = String(slot.dateISO || "").trim();
  const period = Number(slot.period) || "";
  const time = String(slot.timeText || "").trim();
  const segments = [day, date ? `(${date})` : "", period ? `الفترة ${period}` : "", time || ""].filter(Boolean);
  return segments.join(" - ");
};

const getUnscheduledReasonBreakdown = (course) => {
  const details = course?.unscheduledReasonDetails || {};
  const groups = [
    {
      key: "studentConflict",
      title: "فترات تعارض المتدربين",
      slots: Array.isArray(details.studentConflictSlots) ? details.studentConflictSlots : [],
    },
    {
      key: "dailyLimit",
      title: "فترات بلوغ الحد اليومي للمتدربين",
      slots: Array.isArray(details.dailyLimitSlots) ? details.dailyLimitSlots : [],
    },
    {
      key: "hallUnavailable",
      title: "فترات عدم توفر قاعة مناسبة",
      slots: Array.isArray(details.hallUnavailableSlots) ? details.hallUnavailableSlots : [],
    },
    {
      key: "levelConflict",
      title: "فترات تعارض المستوى",
      slots: Array.isArray(details.levelConflictSlots) ? details.levelConflictSlots : [],
    },
    {
      key: "invigilatorShortage",
      title: "فترات عدم كفاية المراقبين",
      slots: Array.isArray(details.invigilatorShortageSlots) ? details.invigilatorShortageSlots : [],
    },
    {
      key: "avoidedConstraint",
      title: "فترات متأثرة بقيود التفضيل أو التجنب",
      slots: Array.isArray(details.avoidedConstraintSlots) ? details.avoidedConstraintSlots : [],
    },
    {
      key: "generic",
      title: "تفاصيل السبب",
      slots: Array.isArray(details.genericSlots) ? details.genericSlots : [],
    },
  ].filter((item) => item.slots.length);

  if (groups.length) return groups;

  const reasonDetail = String(course?.unscheduledReason || "").trim();
  if (!reasonDetail) return [];

  return [
    {
      key: "genericFallback",
      title: "تفاصيل السبب",
      slots: [
        {
          reason: reasonDetail,
          summary: "تم تسجيل هذا السبب للمقرر غير المجدول، ويمكن مراجعته هنا.",
        },
      ],
    },
  ];
};

const openUnscheduledReasonModal = (course, group) => {
  if (!course || !group) return;
  setSelectedUnscheduledReasonModal({
    courseKey: course.key,
    courseName: course.courseName || course.courseCode || "مقرر بدون اسم",
    courseCode: course.courseCode || "",
    shortLabel: normalizeUnscheduledReason(course).shortLabel,
    reasonDetail: normalizeUnscheduledReason(course).detail,
    group,
  });
};

const normalizeUnscheduledReason = (course) => {
  const reason = String(course?.unscheduledReason || "").trim();
  if (!reason) {
    return {
      shortLabel: "تعذر الجدولة",
      detail: "تعذر العثور على فترة مناسبة لهذا المقرر ضمن الإعدادات الحالية.",
    };
  }

  const explicitShortLabel = String(course?.unscheduledShortLabel || "")
    .replace(/\s+/g, " ")
    .trim();

  if (explicitShortLabel) {
    return {
      shortLabel: explicitShortLabel,
      detail: reason,
    };
  }

  const category = getUnscheduledReasonCategory(reason);
  const fallbackShortLabel =
    category.code === "other"
      ? reason.replace(/\s+/g, " ").trim()
      : category.shortLabel;

  return {
    shortLabel: fallbackShortLabel || "سبب غير محدد",
    detail: reason,
  };
};

const hasImportedSf01 = rows.length > 0;
const showSf01ImportFirstToast = () => {
  showToast(
    "لم يتم استيراد تقرير SF01",
    "نأمل استيراد تقرير SF01 أولًا قبل توزيع مقررات الدراسات العامة أو مقررات التخصص.",
    "error"
  );
};

const serializeScheduleItem = (item) => ({
  ...item,
  students: Array.isArray(item.students)
    ? item.students
    : Array.from(item.students || []),
  examHallAssignments: getScheduledItemHallAssignments(item),
});


  
 const getTvtcRowTheme = (index) => {
  const themes = [
    {
      bg: "#E7F8F7",
      border: "#1FA7A8",
      text: "#0F766E",
    },
    {
      bg: "#F0FDFA",
      border: "#0F766E",
      text: "#115E59",
    },
    {
      bg: "#ECFEFF",
      border: "#06B6D4",
      text: "#0E7490",
    },
    {
      bg: "#F5FBFA",
      border: "#147B83",
      text: "#134E4A",
    },
  ];

  return themes[index % themes.length];
};


  
const deserializeScheduleItem = (item) => ({
  ...item,
  instanceId: item.instanceId || makeScheduledInstanceId(),
  students: Array.isArray(item.students) ? item.students : [],
  examHallAssignments: getScheduledItemHallAssignments(item),
});

  const formatTrainees = (n) => {
  const label = formatTraineeCountLabel(n);
  return label.replace(/^\d+\s+/, "");
};

const getPeriodTheme = (period) => {
  const themes = [
    {
      bg: "#F0FDFA",
      border: "#99F6E4",
      accent: "#0F766E",
      badgeBg: "#CCFBF1",
    },
    {
      bg: "#ECFDF5",
      border: "#A7F3D0",
      accent: "#047857",
      badgeBg: "#D1FAE5",
    },
    {
      bg: "#EFF6FF",
      border: "#BFDBFE",
      accent: "#1D4ED8",
      badgeBg: "#DBEAFE",
    },
    {
      bg: "#F5F3FF",
      border: "#DDD6FE",
      accent: "#6D28D9",
      badgeBg: "#EDE9FE",
    },
    {
      bg: "#FFF7ED",
      border: "#FED7AA",
      accent: "#C2410C",
      badgeBg: "#FFEDD5",
    },
  ];

  return themes[(Math.max(1, Number(period) || 1) - 1) % themes.length];
};
 const getConflictsDetails = (courseKey) => {
  const detailsMap = parsed.conflictDetailsMap?.get(courseKey);
  if (!detailsMap) return [];

  return Array.from(detailsMap.entries())
    .map(([conflictKey, sharedCount]) => {
      const course = parsed.courses.find((c) => c.key === conflictKey);

      return {
        key: conflictKey,
        name: course ? `${course.courseName} - ${course.courseCode}` : conflictKey,
        sharedCount,
      };
    })
    .sort((a, b) => b.sharedCount - a.sharedCount || a.name.localeCompare(b.name, "ar"));
};
const getConflictStudentsDetails = (courseKey, conflictKey) => {
  const studentInfoMap = preciseStudentInfoMap;
  const sourceCourse = parsed.courses.find((c) => c.key === courseKey);
  const conflictCourse = parsed.courses.find((c) => c.key === conflictKey);
  if (!sourceCourse || !conflictCourse) return [];

  const sourceStudents = Array.from(sourceCourse.students || []);
  const conflictStudentsSet = new Set(Array.from(conflictCourse.students || []));



  return sourceStudents
    .filter((studentId) => conflictStudentsSet.has(studentId))
    .map((studentId) => studentInfoMap.get(studentId) || {
      id: studentId,
      name: "بدون اسم",
      department: "-",
      major: "-",
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ar") || a.id.localeCompare(b.id, "ar"));
};
  
const hasMeaningfulSessionData = (data) => {
  return (
    (Array.isArray(data?.rows) && data.rows.length > 0) ||
    (Array.isArray(data?.schedule) && data.schedule.length > 0) ||
    (Array.isArray(data?.generalSchedule) && data.generalSchedule.length > 0) ||
    (Array.isArray(data?.specializedSchedule) && data.specializedSchedule.length > 0) ||
    (Array.isArray(data?.unscheduled) && data.unscheduled.length > 0)
  );
};

const buildPersistedState = () => ({
  rows,
  fileName,
  collegeNameInput,
  hasImportedSessionFile,
  currentStep,
  startDate,
  numberOfDays,
  selectedDays,
  periodConfigs,
  periodsText,
  examHalls,
  enableSamePeriodGroups,
  samePeriodGroups,
  maxExamsPerStudentPerDay,
  courseConstraints,
  selectedConstraintCourseKey,
  selectedConstraintCourseKeys,
  courseHallConstraints,
  departmentHallConstraints,
  selectedHallConstraintCourseKey,
  selectedHallConstraintCourseKeys,
  selectedHallConstraintDepartmentKey,
  selectedHallConstraintDepartmentKeys,
  courseInvigilatorConstraints,
  selectedInvigilatorConstraintCourseKey,
  selectedInvigilatorConstraintCourseKeys,
  manualScheduleLocked,
  generalSpecializedDaySeparationMode,
  hallWarnings,
  showAdvancedManagementOptions,
  showHallConstraintPreferences,
  showCourseExclusionsPreference,
  showGeneralSpecializedSeparationPreference,
  showSamePeriodPreference,
  showCourseTimePreference,
  showAvoidSameLevelSameDayPreference,
  showInvigilatorConstraintPreference,
  includeInvigilators,
  excludedInvigilators,
  excludeInactive,
  prioritizeTrainer,
  manualInvigilators,
  invigilatorsPerPeriod,
  invigilationMode,
  studentsPerInvigilator,
  excludedCourses,
  includeAllDepartmentsAndMajors,
  restrictSpecializedInvigilationToVisibleDepartmentTrainers,
  restrictGeneralStudiesInvigilationToGeneralStudiesTrainers,
  excludedDepartmentMajors,
  lockGeneralStudiesStep,
  printDepartmentFilter,
  printMajorFilter,
  avoidSameLevelSameDay,
  courseLevels,
  preferCourseTrainerInvigilation,
  generalSchedule: generalSchedule.map(serializeScheduleItem),
  specializedSchedule: specializedSchedule.map(serializeScheduleItem),
  schedule: schedule.map(serializeScheduleItem),
  unscheduled: unscheduled.map(serializeScheduleItem),
  previewTab,
  previewPage,
  compactPrintMode,
  courseAKey,
courseBKey,
});

const restorePersistedState = (saved) => {
  setRows(saved.rows || []);
  setFileName(saved.fileName || "");
  setCollegeNameInput(saved.collegeNameInput || saved.collegeName || "");
  setHasImportedSessionFile(Boolean(saved.hasImportedSessionFile));
  setCurrentStep(saved.currentStep || 1);
  setStartDate(saved.startDate || "");
  setNumberOfDays(saved.numberOfDays || 8);
  setSelectedDays(saved.selectedDays || ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"]);
  setPeriodConfigs(
    Array.isArray(saved.periodConfigs) && saved.periodConfigs.length
      ? getDefaultPeriodConfigs().map((defaultItem, index) => ({
          start: String(saved.periodConfigs[index]?.start || defaultItem.start || "07:45"),
          duration: Number(saved.periodConfigs[index]?.duration) || defaultItem.duration || 90,
          enabled:
            index === 0
              ? true
              : saved.periodConfigs[index]?.enabled !== undefined
              ? Boolean(saved.periodConfigs[index]?.enabled)
              : Boolean(saved.periodConfigs[index]),
        }))
      : parsePeriodsTextToConfigs(saved.periodsText || "07:45-09:00\n09:15-11:00")
  );
  setExamHalls(
    Array.isArray(saved.examHalls) && saved.examHalls.length
      ? saved.examHalls.map((hall) => ({
          ...hall,
          allowSharedAssignments: Boolean(hall.allowSharedAssignments),
        }))
      : [
          {
            id: makeHallId(),
            name: "",
            capacity: "",
            allowAllDepartments: true,
            allowedDepartments: [],
            allowSharedAssignments: false,
          },
        ]
  );
  setEnableSamePeriodGroups(saved.enableSamePeriodGroups ?? false);
  setSamePeriodGroups(
    Array.isArray(saved.samePeriodGroups)
      ? saved.samePeriodGroups.map((group, index) => ({
          id: group.id || makeCourseGroupId(),
          title: String(group.title || `مجموعة ${index + 1}`).trim() || `مجموعة ${index + 1}`,
          courseKeys: Array.isArray(group.courseKeys) ? group.courseKeys : [],
        }))
      : []
  );
  setMaxExamsPerStudentPerDay(Math.max(1, Number(saved.maxExamsPerStudentPerDay) || 2));
  setCourseConstraints(saved.courseConstraints || {});
  setSelectedConstraintCourseKey(saved.selectedConstraintCourseKey || "");
  setSelectedConstraintCourseKeys(
    Array.isArray(saved.selectedConstraintCourseKeys)
      ? saved.selectedConstraintCourseKeys
      : []
  );
  setCourseHallConstraints(saved.courseHallConstraints || {});
  setDepartmentHallConstraints(saved.departmentHallConstraints || {});
  setSelectedHallConstraintCourseKey(saved.selectedHallConstraintCourseKey || "");
  setSelectedHallConstraintCourseKeys(
    Array.isArray(saved.selectedHallConstraintCourseKeys)
      ? saved.selectedHallConstraintCourseKeys
      : []
  );
  setSelectedHallConstraintDepartmentKey(saved.selectedHallConstraintDepartmentKey || "");
  setSelectedHallConstraintDepartmentKeys(
    Array.isArray(saved.selectedHallConstraintDepartmentKeys)
      ? saved.selectedHallConstraintDepartmentKeys
      : []
  );
  setCourseInvigilatorConstraints(saved.courseInvigilatorConstraints || {});
  setSelectedInvigilatorConstraintCourseKey(saved.selectedInvigilatorConstraintCourseKey || "");
  setSelectedInvigilatorConstraintCourseKeys(
    Array.isArray(saved.selectedInvigilatorConstraintCourseKeys)
      ? saved.selectedInvigilatorConstraintCourseKeys
      : []
  );
  setManualScheduleLocked(saved.manualScheduleLocked ?? false);
  setGeneralSpecializedDaySeparationMode(saved.generalSpecializedDaySeparationMode || "off");
  setHallWarnings(Array.isArray(saved.hallWarnings) ? saved.hallWarnings : []);
  setShowAdvancedManagementOptions(saved.showAdvancedManagementOptions ?? false);
  setShowHallConstraintPreferences(saved.showHallConstraintPreferences ?? false);
  setShowCourseExclusionsPreference(saved.showCourseExclusionsPreference ?? false);
  setShowGeneralSpecializedSeparationPreference(saved.showGeneralSpecializedSeparationPreference ?? false);
  setShowSamePeriodPreference(saved.showSamePeriodPreference ?? false);
  setShowCourseTimePreference(saved.showCourseTimePreference ?? false);
  setShowAvoidSameLevelSameDayPreference(saved.showAvoidSameLevelSameDayPreference ?? false);
  setShowInvigilatorConstraintPreference(saved.showInvigilatorConstraintPreference ?? false);
  setIncludeInvigilators(saved.includeInvigilators ?? true);
  setExcludedInvigilators(saved.excludedInvigilators || []);
  setExcludeInactive(saved.excludeInactive ?? true);
  setPrioritizeTrainer(saved.prioritizeTrainer || "");
  setManualInvigilators(saved.manualInvigilators || "");
  setInvigilatorsPerPeriod(saved.invigilatorsPerPeriod || 4);
  setInvigilationMode(saved.invigilationMode || "ratio");
  setStudentsPerInvigilator(saved.studentsPerInvigilator || 20);
  setExcludedCourses(saved.excludedCourses || []);
  setIncludeAllDepartmentsAndMajors(saved.includeAllDepartmentsAndMajors ?? true);
  setRestrictSpecializedInvigilationToVisibleDepartmentTrainers(saved.restrictSpecializedInvigilationToVisibleDepartmentTrainers ?? false);
  setRestrictGeneralStudiesInvigilationToGeneralStudiesTrainers(saved.restrictGeneralStudiesInvigilationToGeneralStudiesTrainers ?? false);
  setExcludedDepartmentMajors(saved.excludedDepartmentMajors || []);
  setLockGeneralStudiesStep(saved.lockGeneralStudiesStep ?? false);
  setPrintDepartmentFilter(saved.printDepartmentFilter || "__all__");
  setPrintMajorFilter(saved.printMajorFilter || "__all__");
  setAvoidSameLevelSameDay(saved.avoidSameLevelSameDay ?? false);
  setCourseLevels(saved.courseLevels || {});
  setPreferCourseTrainerInvigilation(saved.preferCourseTrainerInvigilation ?? false);
  setGeneralSchedule((saved.generalSchedule || []).map(deserializeScheduleItem));
  setSpecializedSchedule((saved.specializedSchedule || []).map(deserializeScheduleItem));
  setSchedule((saved.schedule || []).map(deserializeScheduleItem));
  setUnscheduled((saved.unscheduled || []).map(deserializeScheduleItem));
  setPreviewTab(saved.previewTab || "sortedCourses");
  setPreviewPage(saved.previewPage || 0);
  setSelectedStudentIdForPrint("");
  setStudentSearchText("");
  setShowStudentSuggestions(false);
  setCompactPrintMode(saved.compactPrintMode ?? false);
  setCourseAKey(saved.courseAKey || "");
setCourseBKey(saved.courseBKey || "");
};


useEffect(() => {
  let cancelled = false;

  const loadSavedSession = async () => {
    try {
      const mode = localStorage.getItem(STORAGE_MODE_KEY) || "localStorage";
      let saved = null;

      if (mode === "indexedDB") {
        saved = await loadStateFromIndexedDb(LARGE_STORAGE_KEY);
      } else {
        const raw = localStorage.getItem(STORAGE_KEY);
        saved = raw ? JSON.parse(raw) : null;
      }

      if (cancelled) return;

      if (!saved || !hasMeaningfulSessionData(saved)) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_MODE_KEY);
        await removeStateFromIndexedDb(LARGE_STORAGE_KEY).catch(() => {});
        if (!cancelled) {
          setPendingRestore(null);
          pendingRestoreRef.current = null;
          setDidRestore(true);
          setStorageMode("localStorage");
        }
        return;
      }

      pendingRestoreRef.current = saved;
      setPendingRestore(saved);
      setStorageMode(mode);

      showToast(
        "جلسة محفوظة",
        "تم العثور على جلسة محفوظة — اضغط استرجاع لاستعادتها.",
        "warning",
        { action: "restore_session", persistent: true }
      );
    } catch (error) {
      console.error("فشل في استرجاع البيانات المحفوظة:", error);
      if (!cancelled) setDidRestore(true);
    }
  };

  loadSavedSession();

  return () => {
    cancelled = true;
  };
}, []);

useEffect(() => {
  if (!rows.length) return;
  if (collegeNameInput !== "") return;

  const initialName = rows[0]?.["الوحدة"] || "";
  if (initialName) {
    setCollegeNameInput(initialName);
  }
}, [rows]);

useEffect(() => {
  return () => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
  };
}, []);

useEffect(() => {
  setPageVisible(false);

  const timer = window.setTimeout(() => {
    topRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    setPageVisible(true);
  }, 120);

  return () => window.clearTimeout(timer);
}, [currentStep, previewTab]);


useEffect(() => {
  if (!didRestore) return;
  if (pendingRestoreRef.current) return;

  let cancelled = false;

  const timer = window.setTimeout(() => {
    const persistState = async () => {
      try {
        const data = buildPersistedState();

        if (!hasMeaningfulSessionData(data)) {
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(STORAGE_MODE_KEY);
          await removeStateFromIndexedDb(LARGE_STORAGE_KEY).catch(() => {});
          if (!cancelled) setStorageMode("localStorage");
          return;
        }

        const serialized = JSON.stringify(data);

        try {
          localStorage.setItem(STORAGE_KEY, serialized);
          localStorage.setItem(STORAGE_MODE_KEY, "localStorage");
          await removeStateFromIndexedDb(LARGE_STORAGE_KEY).catch(() => {});
          if (!cancelled) setStorageMode("localStorage");
        } catch (storageError) {
          await saveStateToIndexedDb(LARGE_STORAGE_KEY, data);
          localStorage.setItem(STORAGE_MODE_KEY, "indexedDB");
          localStorage.removeItem(STORAGE_KEY);
          if (!cancelled) setStorageMode("indexedDB");
        }
      } catch (error) {
        console.error("Failed to persist state:", error);
      }
    };

    persistState();
  }, 700);

  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}, [
  didRestore,
  rows,
  fileName,
  collegeNameInput,
  currentStep,
  startDate,
  numberOfDays,
  selectedDays,
  periodConfigs,
  periodsText,
  examHalls,
  enableSamePeriodGroups,
  samePeriodGroups,
  maxExamsPerStudentPerDay,
  courseConstraints,
  selectedConstraintCourseKey,
  selectedConstraintCourseKeys,
  courseHallConstraints,
  departmentHallConstraints,
  selectedHallConstraintCourseKey,
  selectedHallConstraintCourseKeys,
  selectedHallConstraintDepartmentKey,
  selectedHallConstraintDepartmentKeys,
  courseInvigilatorConstraints,
  selectedInvigilatorConstraintCourseKey,
  selectedInvigilatorConstraintCourseKeys,
  manualScheduleLocked,
  generalSpecializedDaySeparationMode,
  hallWarnings,
  showAdvancedManagementOptions,
  showHallConstraintPreferences,
  showCourseExclusionsPreference,
  showGeneralSpecializedSeparationPreference,
  showSamePeriodPreference,
  showCourseTimePreference,
  showAvoidSameLevelSameDayPreference,
  showInvigilatorConstraintPreference,
  includeInvigilators,
  excludedInvigilators,
  excludeInactive,
  prioritizeTrainer,
  manualInvigilators,
  invigilatorsPerPeriod,
  invigilationMode,
  studentsPerInvigilator,
  excludedCourses,
  includeAllDepartmentsAndMajors,
  restrictSpecializedInvigilationToVisibleDepartmentTrainers,
  restrictGeneralStudiesInvigilationToGeneralStudiesTrainers,
  excludedDepartmentMajors,
  lockGeneralStudiesStep,
  printDepartmentFilter,
  printMajorFilter,
  avoidSameLevelSameDay,
  courseLevels,
  preferCourseTrainerInvigilation,
  generalSchedule,
  specializedSchedule,
  schedule,
  unscheduled,
  previewTab,
  previewPage,
  compactPrintMode,
  courseAKey,
  courseBKey,
  
]);

const restoreSavedSession = async () => {
  const saved = pendingRestoreRef.current || pendingRestore;
  if (!saved) return;

  restorePersistedState(saved);

  try {
    const serialized = JSON.stringify(saved);

    try {
      localStorage.setItem(STORAGE_KEY, serialized);
      localStorage.setItem(STORAGE_MODE_KEY, "localStorage");
      await removeStateFromIndexedDb(LARGE_STORAGE_KEY).catch(() => {});
      setStorageMode("localStorage");
    } catch (storageError) {
      await saveStateToIndexedDb(LARGE_STORAGE_KEY, saved);
      localStorage.setItem(STORAGE_MODE_KEY, "indexedDB");
      localStorage.removeItem(STORAGE_KEY);
      setStorageMode("indexedDB");
    }
  } catch (error) {
    console.error("Failed to re-save restored session:", error);
  }

  pendingRestoreRef.current = null;
  setPendingRestore(null);
  setToast(null);
  setDidRestore(true);

  showToast("تم الاسترجاع", "تم استرجاع الجلسة بنجاح.", "success");
};

const clearSavedState = async () => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_MODE_KEY);
  await removeStateFromIndexedDb(LARGE_STORAGE_KEY).catch(() => {});

  pendingRestoreRef.current = null;
  setPendingRestore(null);
  setToast(null);
  setDidRestore(true);
  setStorageMode("localStorage");

  showToast("تم المسح", "تم حذف النسخة المحفوظة من المتصفح.", "success");
};

const exportSavedSession = () => {
  const data = buildPersistedState();
  const collegeLabel = sanitizeDownloadFilename(collegeNameInput || "الكلية التقنية", "الكلية التقنية");
  const dateStamp = getTodayFileStamp();

  downloadFile(
    `ملف الاختبارات النهائية - ${collegeLabel} - ${dateStamp}.json`,
    JSON.stringify(data, null, 2),
    "application/json;charset=utf-8"
  );
  showToast("تم التصدير", "تم تنزيل ملف الجلسة بنجاح.", "success");
};

const importSessionRef = useRef(null);

const importSavedSession = (file) => {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const saved = JSON.parse(e.target.result);
      restorePersistedState(saved);
      setHasImportedSessionFile(true);

      const serialized = JSON.stringify(saved);
      try {
        localStorage.setItem(STORAGE_KEY, serialized);
        localStorage.setItem(STORAGE_MODE_KEY, "localStorage");
        await removeStateFromIndexedDb(LARGE_STORAGE_KEY).catch(() => {});
        setStorageMode("localStorage");
      } catch (storageError) {
        await saveStateToIndexedDb(LARGE_STORAGE_KEY, saved);
        localStorage.setItem(STORAGE_MODE_KEY, "indexedDB");
        localStorage.removeItem(STORAGE_KEY);
        setStorageMode("indexedDB");
      }

      pendingRestoreRef.current = null;
      setPendingRestore(null);
      setDidRestore(true);
      if (importSessionRef.current) {
        importSessionRef.current.value = "";
      }
      showToast("تم الاستيراد", "تم تحميل الجلسة بنجاح.", "success");
    } catch (error) {
      if (importSessionRef.current) {
        importSessionRef.current.value = "";
      }
      showToast("خطأ في الاستيراد", "ملف الجلسة غير صالح.", "error");
    }
  };

  reader.readAsText(file, "utf-8");
};

  const parsed = useMemo(() => {
    if (!rows.length) {
      return {
        missingColumns: [],
        filteredRows: [],
        collegeName: "",
        courses: [],
        studentsCount: 0,
        invigilators: [],
        sections: [],
        conflictDetailsByCourse: {},
      };
    }

    const missingColumns = REQUIRED_COLUMNS.filter((column) => !(column in (rows[0] || {})));

    if (missingColumns.length) {
      return {
        missingColumns,
        filteredRows: [],
        collegeName: "",
        courses: [],
        studentsCount: 0,
        invigilators: [],
        sections: [],
        conflictDetailsByCourse: {},
      };
    }

    const filteredRows = rows.filter((row) => {
      if (!excludeInactive) return true;

      const regStatus = normalizeArabic(row["حالة تسجيل"]);
      const traineeStatus = normalizeArabic(row["حالة المتدرب"]);

      const badReg = EXCLUDED_REGISTRATION.some((item) => regStatus.includes(normalizeArabic(item)));
      const badTrainee = EXCLUDED_TRAINEE.some((item) => traineeStatus.includes(normalizeArabic(item)));

      return !badReg && !badTrainee;
    });

    const activeExcludedDepartmentMajors = includeAllDepartmentsAndMajors
      ? []
      : excludedDepartmentMajors;

    const rowsAfterDepartmentMajorFilter = filteredRows.filter((row) => {
      if (includeAllDepartmentsAndMajors) return true;

      const departments = splitBySlash(String(row["القسم"] ?? "").trim() || "-");
      const majors = splitBySlash(String(row["التخصص"] ?? "").trim() || "-");

      for (const dep of departments) {
        for (const maj of majors) {
          const pairKey = `${normalizeArabic(dep || "-")}|${normalizeArabic(maj || "-")}`;
          if (activeExcludedDepartmentMajors.includes(pairKey)) {
            return false;
          }
        }
      }

      return true;
    });

    const courseMap = new Map();
    const studentSet = new Set();
    const studentCourseMap = new Map();
    const studentDepartmentMap = new Map();
    const invigilatorSet = new Set();
    const sectionSet = new Set();

    rowsAfterDepartmentMajorFilter.forEach((row) => {
      const courseCode = String(row["المقرر"] ?? "").trim();
      const courseName = String(row["اسم المقرر"] ?? "").trim();
      const trainer = String(row["المدرب"] ?? "").trim();
      const studentId = String(row["رقم المتدرب"] ?? "").trim();
      const department = String(row["القسم"] ?? "").trim();
   if (studentId && department) {
  const dept = normalizeArabic(department);

  if (!studentDepartmentMap.has(studentId)) {
    studentDepartmentMap.set(studentId, new Set());
  }

  studentDepartmentMap.get(studentId).add(dept);
}
      const major = String(row["التخصص"] ?? "").trim();
      const scheduleType = String(row["نوع الجدولة"] ?? "").trim();
      const sectionName = `${department || "-"} / ${major || "-"}`;

      if (!courseCode && !courseName) return;

      const key = [normalizeArabic(courseCode), normalizeArabic(courseName)].join("|");

      if (trainer) invigilatorSet.add(trainer);
      if (studentId) studentSet.add(studentId);
      if (sectionName !== "- / -") sectionSet.add(sectionName);

   if (!courseMap.has(key)) {
  courseMap.set(key, {
    key,
    courseCode,
    courseName,
    trainers: new Set(),
    departments: new Set(),
    majors: new Set(),
    sectionNames: new Set(),
    scheduleTypes: new Set(),
    students: new Set(),
    departmentRoots: new Set(),
  });
}

      const course = courseMap.get(key);
      if (trainer) course.trainers.add(trainer);
      if (department) course.departments.add(department);
      if (major) course.majors.add(major);
      if (sectionName !== "- / -") course.sectionNames.add(sectionName);
      splitBySlash(department).forEach((value) => {
  const clean = normalizeArabic(value);
  if (clean) {
    course.departmentRoots.add(clean);
  }
});

splitBySlash(major).forEach((value) => {
  const clean = normalizeArabic(value);
  if (clean) course.departmentRoots.add(clean);
});

splitBySlash(sectionName).forEach((value) => {
  const clean = normalizeArabic(value);
  if (clean && clean !== normalizeArabic("-")) {
    course.departmentRoots.add(clean);
  }
});
      if (scheduleType) course.scheduleTypes.add(scheduleType);

      if (studentId) {
        course.students.add(studentId);
        if (!studentCourseMap.has(studentId)) studentCourseMap.set(studentId, new Set());
        studentCourseMap.get(studentId).add(key);
      }
    });

const activeCourseKeys = Array.from(courseMap.keys()).filter(
  (key) => !excludedCourses.includes(key)
);

const conflictMap = new Map();
const conflictDetailsMap = new Map();

activeCourseKeys.forEach((key) => {
  conflictMap.set(key, new Set());
  conflictDetailsMap.set(key, new Map());
});


    studentCourseMap.forEach((courseSet) => {
  const list = Array.from(courseSet).filter(
    (key) => !excludedCourses.includes(key)
  );

  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i];
      const b = list[j];

      if (!conflictMap.has(a) || !conflictMap.has(b)) continue;

      conflictMap.get(a).add(b);
      conflictMap.get(b).add(a);

      const aDetails = conflictDetailsMap.get(a);
      const bDetails = conflictDetailsMap.get(b);

      aDetails.set(b, (aDetails.get(b) || 0) + 1);
      bDetails.set(a, (bDetails.get(a) || 0) + 1);
    }
  }
});
    
// ربط الأقسام بالمقررات بعد اكتمال البيانات
courseMap.forEach((course) => {
  course.students.forEach((studentId) => {
    const studentDepts = studentDepartmentMap.get(studentId) || new Set();
    studentDepts.forEach((d) => course.departmentRoots.add(d));
  });
});
    const courses = Array.from(courseMap.values())
      .map((course) => ({
        ...course,
        department: Array.from(course.departments).join(" / "),
        major: Array.from(course.majors).join(" / "),
        scheduleType: Array.from(course.scheduleTypes).join(" / "),
        trainerText: Array.from(course.trainers).join(" / "),
        studentCount: course.students.size,
        conflictDegree: conflictMap.get(course.key)?.size || 0,
        sectionName: Array.from(course.sectionNames).join(" / ") || "-",
            departmentRoots: Array.from(course.departmentRoots),
      }))
      .filter((course) => !excludedCourses.includes(course.key))
      .sort((a, b) => b.studentCount - a.studentCount || b.conflictDegree - a.conflictDegree);

 const conflictDetailsByCourse = Object.fromEntries(
  activeCourseKeys.map((courseKey) => {
        const details = Array.from(conflictMap.get(courseKey) || [])
          .map((conflictKey) => {
            const conflictCourse = courseMap.get(conflictKey);
            if (!conflictCourse) return conflictKey;
            const code = String(conflictCourse.courseCode || "").trim();
            const name = String(conflictCourse.courseName || "").trim();
            return code ? `${name} - ${code}` : name || conflictKey;
          })
          .sort((a, b) => a.localeCompare(b, "ar"));

        return [courseKey, details];
      })
    );

    return {
      missingColumns,
      filteredRows: rowsAfterDepartmentMajorFilter,
      collegeName: collegeNameInput || rowsAfterDepartmentMajorFilter[0]?.["الوحدة"] || filteredRows[0]?.["الوحدة"] || rows[0]?.["الوحدة"] || "الكلية التقنية",
      courses,
      conflictDetailsByCourse,
      studentsCount: studentSet.size,
      invigilators: Array.from(invigilatorSet).sort((a, b) => a.localeCompare(b, "ar")),
      sections: Array.from(sectionSet).sort((a, b) => a.localeCompare(b, "ar")),
      conflictDetailsMap,
    };
  }, [rows, excludeInactive, excludedCourses, collegeNameInput, includeAllDepartmentsAndMajors, excludedDepartmentMajors, enableSamePeriodGroups, samePeriodGroups]);

const getStudentNameFromRow = (row) =>
  String(
    row["إسم المتدرب"] ??
    row["اسم المتدرب"] ??
    row["اسم المتدرب "] ??
    ""
  ).trim();
  
const deprivedCourseStudentStatusMap = useMemo(() => {
  const map = new Map();

  parsed.filteredRows.forEach((row) => {
    const studentId = String(row["رقم المتدرب"] ?? "").trim();
    const courseCode = String(row["المقرر"] ?? "").trim();
    const courseName = String(row["اسم المقرر"] ?? "").trim();
    const registrationStatus = String(row["حالة تسجيل"] ?? "").trim();

    if (!studentId || !courseCode && !courseName) return;
    if (!isDeprivationRegistrationStatus(registrationStatus)) return;

    const courseKey = [normalizeArabic(courseCode), normalizeArabic(courseName)].join("|");
    map.set(getCourseStudentStatusKey(courseKey, studentId), registrationStatus);
  });

  return map;
}, [parsed.filteredRows]);

const preciseStudentInfoMap = useMemo(() => {
  const map = new Map();

  parsed.filteredRows.forEach((row) => {
    const id = String(row["رقم المتدرب"] ?? "").trim();
    if (!id) return;

    const name = getStudentNameFromRow(row) || "بدون اسم";
    const department = String(row["القسم"] ?? "").trim() || "-";
    const major = String(row["التخصص"] ?? "").trim() || "-";

    const normalizedDepartment = normalizeArabic(department);
    const isGeneralStudies =
      normalizedDepartment === normalizeArabic("الدراسات العامة");

    const existing = map.get(id);

    if (!existing) {
      map.set(id, {
        id,
        name,
        department,
        major,
        isGeneralStudies,
      });
      return;
    }

    if (existing.isGeneralStudies && !isGeneralStudies) {
      map.set(id, {
        id,
        name,
        department,
        major,
        isGeneralStudies,
      });
      return;
    }

    if (!existing.isGeneralStudies && isGeneralStudies) {
      return;
    }

    const existingMajorScore =
      existing.major && existing.major !== "-" ? existing.major.length : 0;
    const newMajorScore =
      major && major !== "-" ? major.length : 0;

    if (newMajorScore > existingMajorScore) {
      map.set(id, {
        id,
        name,
        department,
        major,
        isGeneralStudies,
      });
    }
  });

  return map;
}, [parsed.filteredRows]);
  

const detectedGender = useMemo(() => {
  const fromCollegeName = detectGenderFromText(parsed?.collegeName || "");
  if (fromCollegeName) return fromCollegeName;

  const fromInput = detectGenderFromText(collegeNameInput || "");
  if (fromInput) return fromInput;

  const fromRows = detectGenderFromRows(rows);
  if (fromRows) return fromRows;

  return "male";
}, [parsed?.collegeName, collegeNameInput, rows]);


const invigilatorDepartmentRootsMap = useMemo(() => {
  const map = new Map();

  parsed.filteredRows.forEach((row) => {
    const trainer = String(row["المدرب"] ?? "").trim();
    if (!trainer) return;

    const normalizedTrainer = normalizeArabic(trainer);
    if (!normalizedTrainer) return;

    if (!map.has(normalizedTrainer)) {
      map.set(normalizedTrainer, new Set());
    }

    const roots = new Set();
    const department = String(row["القسم"] ?? "").trim();
    const major = String(row["التخصص"] ?? "").trim();
    const sectionName = `${department || "-"} / ${major || "-"}`;

    splitBySlash(department).forEach((value) => {
      const clean = normalizeArabic(value);
      if (clean) roots.add(clean);
    });

    splitBySlash(major).forEach((value) => {
      const clean = normalizeArabic(value);
      if (clean) roots.add(clean);
    });

    splitBySlash(sectionName).forEach((value) => {
      const clean = normalizeArabic(value);
      if (clean && clean !== normalizeArabic("-")) roots.add(clean);
    });

    const target = map.get(normalizedTrainer);
    roots.forEach((value) => target.add(value));
  });

  return map;
}, [parsed.filteredRows]);

const availableDepartments = useMemo(() => {
  if (!parsed?.courses?.length) return [];

  return Array.from(
    new Set(
      parsed.courses.flatMap((course) => {
        const roots = Array.isArray(course.departmentRoots)
          ? course.departmentRoots
          : getCourseDepartmentRoots(course);

        return (roots || [])
          .map((d) => String(d || "").trim())
          .filter(Boolean);
      })
    )
  ).sort((a, b) => a.localeCompare(b, "ar"));
}, [parsed]);
  
const detectedCollegeLocation = useMemo(() => {
  const sourceName =
    String(parsed?.collegeName || "").trim() ||
    String(collegeNameInput || "").trim();

  return resolveLocationName(sourceName);
}, [parsed?.collegeName, collegeNameInput]);

const effectiveCollegeLocation = manualCollegeLocation || detectedCollegeLocation || "";

const collegeSourceForSlug = useMemo(() => {
  return (
    String(parsed?.collegeName || "").trim() ||
    String(collegeNameInput || "").trim() ||
    String(effectiveCollegeLocation || "").trim()
  );
}, [parsed?.collegeName, collegeNameInput, effectiveCollegeLocation]);

const effectiveCollegeSlug = useMemo(() => {
  return resolveLocationSlug(collegeSourceForSlug, detectedGender);
}, [collegeSourceForSlug, detectedGender]);

const baseLink = useMemo(() => {
  return generateTraineeLink(collegeSourceForSlug, detectedGender);
}, [collegeSourceForSlug, detectedGender]);


  const allCollegeLocations = useMemo(() => getAllLocations(), []);

  useEffect(() => {
  setAutoDetectedCollegeLocation(detectedCollegeLocation || "");
}, [detectedCollegeLocation]);


  const departmentMajorOptions = useMemo(() => {
    if (!rows.length) return [];

    const map = new Map();

    rows.forEach((row) => {
      const department = String(row["القسم"] ?? "").trim();
      const major = String(row["التخصص"] ?? "").trim();

      splitBySlash(department || "-").forEach((dep) => {
        splitBySlash(major || "-").forEach((maj) => {
          const cleanDepartment = String(dep || "").trim() || "-";
          const cleanMajor = String(maj || "").trim() || "-";
          const key = `${normalizeArabic(cleanDepartment)}|${normalizeArabic(cleanMajor)}`;

          if (
            normalizeArabic(cleanDepartment) === normalizeArabic("الدراسات العامة") ||
            normalizeArabic(cleanMajor) === normalizeArabic("الدراسات العامة")
          ) {
            return;
          }

          if (!map.has(key)) {
            map.set(key, {
              key,
              department: cleanDepartment,
              major: cleanMajor,
              label: `${cleanDepartment} / ${cleanMajor}`,
            });
          }
        });
      });
    });

    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "ar"));
  }, [rows]);

  const toggleExcludedDepartmentMajor = (itemKey) => {
    setExcludedDepartmentMajors((prev) =>
      prev.includes(itemKey)
        ? prev.filter((key) => key !== itemKey)
        : [...prev, itemKey]
    );
  };

  useEffect(() => {
    setLockGeneralStudiesStep(!includeAllDepartmentsAndMajors);
  }, [includeAllDepartmentsAndMajors]);

  const handleIncludeAllDepartmentsAndMajorsChange = (checked) => {
    if (!checked && !generalSchedule.length) {
      showToast(
        "يجب توزيع مقررات الدراسات العامة أولًا",
        "لا يمكن تفعيل التوزيع الخاص بالأقسام والتخصصات قبل توزيع مقررات الدراسات العامة.",
        "warning"
      );
      return;
    }

    setIncludeAllDepartmentsAndMajors(checked);
    if (checked) {
      setExcludedDepartmentMajors([]);
      setRestrictSpecializedInvigilationToVisibleDepartmentTrainers(false);
      setLockGeneralStudiesStep(false);
    } else {
      setLockGeneralStudiesStep(true);
    }
  };


const getSelectedPairConflictStudents = useMemo(() => {
  if (!courseAKey || !courseBKey || courseAKey === courseBKey) return [];

  const courseA = parsed.courses.find((c) => c.key === courseAKey);
  const courseB = parsed.courses.find((c) => c.key === courseBKey);

  if (!courseA || !courseB) return [];

  const studentsA = new Set(Array.from(courseA.students || []));
  const studentsB = new Set(Array.from(courseB.students || []));

  return Array.from(studentsA)
    .filter((studentId) => studentsB.has(studentId))
    .map((studentId) => {
      const info = preciseStudentInfoMap.get(studentId);

      return {
        id: studentId,
        name: info?.name || "بدون اسم",
        department: info?.department || "-",
        major: info?.major || "-",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ar") || a.id.localeCompare(b.id, "ar"));
}, [courseAKey, courseBKey, parsed.courses, preciseStudentInfoMap]);
  

const selectedCourseA = useMemo(
  () => parsed.courses.find((c) => c.key === courseAKey) || null,
  [parsed.courses, courseAKey]
);

const selectedCourseB = useMemo(
  () => parsed.courses.find((c) => c.key === courseBKey) || null,
  [parsed.courses, courseBKey]
);


  const generalCourses = useMemo(() => parsed.courses.filter((course) => isGeneralStudiesCourse(course)), [parsed.courses]);

  const generalStudiesInvigilatorsSet = useMemo(() => {
    const set = new Set();

    generalCourses.forEach((course) => {
      String(course.trainerText || "")
        .split("/")
        .map((name) => name.trim())
        .filter(Boolean)
        .forEach((name) => set.add(normalizeArabic(name)));
    });

    return set;
  }, [generalCourses]);

  const specializedCourses = useMemo(() => {
    const keys = new Set(generalCourses.map((c) => c.key));
    return parsed.courses.filter((course) => !keys.has(course.key));
  }, [parsed.courses, generalCourses]);

  const specializedVisibleDepartmentTrainerNames = useMemo(() => {
    return Array.from(
      new Set(
        specializedCourses
          .flatMap((course) =>
            String(course.trainerText || "")
              .split("/")
              .map((name) => name.trim())
              .filter(Boolean)
          )
          .map((name) => String(name || "").trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, "ar"));
  }, [specializedCourses]);

  const specializedVisibleDepartmentTrainerNameSet = useMemo(() => {
    return new Set(
      specializedVisibleDepartmentTrainerNames.map((name) => normalizeArabic(name))
    );
  }, [specializedVisibleDepartmentTrainerNames]);

  const excludedInvigilatorsForSelectedDepartments = useMemo(() => {
    if (includeAllDepartmentsAndMajors) return new Set();

    const names = generalCourses.flatMap((course) =>
      String(course.trainerText || "")
        .split("/")
        .map((name) => name.trim())
        .filter(Boolean)
    );

    return new Set(names.map((name) => normalizeArabic(name)));
  }, [includeAllDepartmentsAndMajors, generalCourses]);

  const parsedPeriods = useMemo(() => parsePeriodsText(periodsText), [periodsText]);
  const invalidPeriods = parsedPeriods.filter((p) => !p.valid);

  const slots = useMemo(
    () => buildSlots({ startDate, numberOfDays, selectedDays, parsedPeriods }),
    [startDate, numberOfDays, selectedDays, parsedPeriods]
  );

  const editableScheduleSlots = useMemo(
    () =>
      slots.map((slot) => ({
        ...slot,
        items: (schedule || []).filter((item) => item.id === slot.id),
      })),
    [slots, schedule]
  );


  const activeDraggedManualCourse = useMemo(() => {
    if (draggingScheduleItemId) {
      return schedule.find((item) => item.instanceId === draggingScheduleItemId) || null;
    }
    if (draggingUnscheduledCourseKey) {
      return parsed.courses.find((item) => item.key === draggingUnscheduledCourseKey) || unscheduled.find((item) => item.key === draggingUnscheduledCourseKey) || null;
    }
    return null;
  }, [draggingScheduleItemId, draggingUnscheduledCourseKey, schedule, parsed.courses, unscheduled]);

  const manualDropSlotStatusMap = useMemo(() => {
    const map = new Map();
    if (!activeDraggedManualCourse) return map;

    editableScheduleSlots.forEach((slot) => {
      const ignoredInstanceId = draggingScheduleItemId || "";
      const conflicts = getManualMoveConflictItems(activeDraggedManualCourse, slot.id, ignoredInstanceId);
      map.set(slot.id, {
        canDrop: conflicts.length === 0,
        conflictCount: conflicts.reduce((sum, item) => sum + item.sharedCount, 0),
      });
    });

    return map;
  }, [activeDraggedManualCourse, editableScheduleSlots, draggingScheduleItemId, schedule]);

  const allCourseOptions = useMemo(() => {
    if (!rows.length) return [];

    const map = new Map();

    rows.forEach((row) => {
      const courseCode = String(row["المقرر"] ?? "").trim();
      const courseName = String(row["اسم المقرر"] ?? "").trim();
      if (!courseCode && !courseName) return;

      const key = [normalizeArabic(courseCode), normalizeArabic(courseName)].join("|");
      if (!map.has(key)) map.set(key, { key, label: `${courseName} - ${courseCode}` });
    });

    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "ar"));
  }, [rows]);

  const courseConstraintOptions = useMemo(
    () =>
      parsed.courses.map((course) => ({
        key: course.key,
        label: `${course.courseName} - ${course.courseCode}`,
      })),
    [parsed.courses]
  );

  const selectedCourseConstraint = selectedConstraintCourseKey
    ? courseConstraints[selectedConstraintCourseKey] || getCourseConstraintDefaults()
    : getCourseConstraintDefaults();

  const selectedCourseHallConstraint = selectedHallConstraintCourseKey
    ? courseHallConstraints[selectedHallConstraintCourseKey] || getCourseHallConstraintDefaults()
    : getCourseHallConstraintDefaults();

  const selectedDepartmentHallConstraint = selectedHallConstraintDepartmentKey
    ? departmentHallConstraints[normalizeArabic(selectedHallConstraintDepartmentKey)] || getDepartmentHallConstraintDefaults()
    : getDepartmentHallConstraintDefaults();

  const selectedCourseInvigilatorConstraint = selectedInvigilatorConstraintCourseKey
    ? courseInvigilatorConstraints[selectedInvigilatorConstraintCourseKey] || getCourseInvigilatorConstraintDefaults()
    : getCourseInvigilatorConstraintDefaults();

  const visibleCourseConstraintOptions = courseConstraintOptions.filter(
    (course) => !selectedConstraintCourseKeys.includes(course.key)
  );
  const hallConstraintOptions = courseConstraintOptions.filter(
    (course) => !selectedHallConstraintCourseKeys.includes(course.key)
  );
  const hallConstraintDepartmentOptions = availableDepartments.filter(
    (department) => !selectedHallConstraintDepartmentKeys.includes(normalizeArabic(department))
  );
  const visibleInvigilatorConstraintOptions = courseConstraintOptions.filter(
    (course) => !selectedInvigilatorConstraintCourseKeys.includes(course.key)
  );
  const invigilatorConstraintOptions = courseConstraintOptions;

  const normalizedSamePeriodGroups = useMemo(() => {
    const validKeys = new Set(
      parsed.courses
        .map((course) => course.key)
        .filter((key) => !excludedCourses.includes(key))
    );

    return (samePeriodGroups || [])
      .map((group, index) => ({
        id: group.id || makeCourseGroupId(),
        title: String(group.title || `مجموعة ${index + 1}`).trim() || `مجموعة ${index + 1}`,
        courseKeys: Array.from(
          new Set((group.courseKeys || []).filter((key) => validKeys.has(key)))
        ),
      }))
      .filter((group) => group.courseKeys.length >= 2);
  }, [samePeriodGroups, parsed.courses, excludedCourses]);

  const samePeriodGroupedCourseKeys = useMemo(
    () => new Set(normalizedSamePeriodGroups.flatMap((group) => group.courseKeys)),
    [normalizedSamePeriodGroups]
  );

  const samePeriodUngroupedCourses = useMemo(
    () =>
      allCourseOptions.filter(
        (course) =>
          !excludedCourses.includes(course.key) &&
          !samePeriodGroupedCourseKeys.has(course.key)
      ),
    [allCourseOptions, excludedCourses, samePeriodGroupedCourseKeys]
  );

  const samePeriodGroupLookup = useMemo(() => {
    const map = new Map();

    normalizedSamePeriodGroups.forEach((group) => {
      group.courseKeys.forEach((courseKey) => {
        map.set(courseKey, group.id);
      });
    });

    return map;
  }, [normalizedSamePeriodGroups]);

  const samePeriodGroupSizeLookup = useMemo(() => {
    const map = new Map();

    normalizedSamePeriodGroups.forEach((group) => {
      group.courseKeys.forEach((courseKey) => {
        map.set(courseKey, group.courseKeys.length);
      });
    });

    return map;
  }, [normalizedSamePeriodGroups]);

  const unassignedLevelCourses = useMemo(
    () =>
      allCourseOptions.filter(
        (course) => !excludedCourses.includes(course.key) && !courseLevels[course.key]
      ),
    [allCourseOptions, courseLevels, excludedCourses]
  );

  useEffect(() => {
    if (!enableSamePeriodGroups && samePeriodGroups.length) {
      setSamePeriodGroups([]);
      return;
    }

    if (!enableSamePeriodGroups) return;

    const sanitized = (samePeriodGroups || [])
      .map((group, index) => ({
        id: group.id || makeCourseGroupId(),
        title: String(group.title || `مجموعة ${index + 1}`).trim() || `مجموعة ${index + 1}`,
        courseKeys: Array.from(
          new Set((group.courseKeys || []).filter((key) => !excludedCourses.includes(key)))
        ),
      }));

    const currentJson = JSON.stringify(samePeriodGroups || []);
    const nextJson = JSON.stringify(sanitized);

    if (currentJson !== nextJson) {
      setSamePeriodGroups(sanitized);
    }
  }, [enableSamePeriodGroups, samePeriodGroups, excludedCourses]);

  useEffect(() => {
    const validKeys = new Set(parsed.courses.map((course) => course.key));
    setSelectedConstraintCourseKeys((prev) => prev.filter((key) => validKeys.has(key)));
    setSelectedConstraintCourseKey((prev) => (prev && validKeys.has(prev) ? prev : ""));
  }, [parsed.courses]);

  useEffect(() => {
    const validKeys = parsed.courses.map((course) => course.key);
    const sanitized = sanitizeCourseConstraintsMap(courseConstraints, validKeys);
    const currentJson = JSON.stringify(courseConstraints || {});
    const nextJson = JSON.stringify(sanitized);

    if (currentJson !== nextJson) {
      setCourseConstraints(sanitized);
    }
  }, [courseConstraints, parsed.courses]);

  useEffect(() => {
    const validKeys = new Set(parsed.courses.map((course) => course.key));
    setSelectedHallConstraintCourseKeys((prev) => prev.filter((key) => validKeys.has(key)));
    setSelectedHallConstraintCourseKey((prev) => (prev && validKeys.has(prev) ? prev : ""));
  }, [parsed.courses]);

  useEffect(() => {
    const validKeys = parsed.courses.map((course) => course.key);
    const validHallNames = normalizedExamHalls.map((hall) => hall.name);
    const sanitized = sanitizeCourseHallConstraintsMap(courseHallConstraints, validKeys, validHallNames);
    const currentJson = JSON.stringify(courseHallConstraints || {});
    const nextJson = JSON.stringify(sanitized);

    if (currentJson !== nextJson) {
      setCourseHallConstraints(sanitized);
    }
  }, [courseHallConstraints, parsed.courses, normalizedExamHalls]);

  useEffect(() => {
    const validDepartments = new Set(availableDepartments.map((department) => normalizeArabic(department)));
    setSelectedHallConstraintDepartmentKeys((prev) => prev.filter((key) => validDepartments.has(normalizeArabic(key))));
    setSelectedHallConstraintDepartmentKey((prev) =>
      prev && validDepartments.has(normalizeArabic(prev)) ? prev : ""
    );
  }, [availableDepartments]);

  useEffect(() => {
    const validDepartmentKeys = availableDepartments.map((department) => normalizeArabic(department));
    const validHallNames = normalizedExamHalls.map((hall) => hall.name);
    const sanitized = sanitizeDepartmentHallConstraintsMap(
      departmentHallConstraints,
      validDepartmentKeys,
      validHallNames
    );
    const currentJson = JSON.stringify(departmentHallConstraints || {});
    const nextJson = JSON.stringify(sanitized);

    if (currentJson !== nextJson) {
      setDepartmentHallConstraints(sanitized);
    }
  }, [departmentHallConstraints, availableDepartments, normalizedExamHalls]);

  useEffect(() => {
    const validKeys = new Set(parsed.courses.map((course) => course.key));
    setSelectedInvigilatorConstraintCourseKeys((prev) => prev.filter((key) => validKeys.has(key)));
    setSelectedInvigilatorConstraintCourseKey((prev) => (prev && validKeys.has(prev) ? prev : ""));
  }, [parsed.courses]);

  useEffect(() => {
    const validKeys = parsed.courses.map((course) => course.key);
    const validInvigilatorNames = Array.from(
      new Set(
        (manualInvigilators
          ? manualInvigilators.split("\n").map((name) => name.trim()).filter(Boolean)
          : parsed.invigilators
        ).filter(Boolean)
      )
    );
    const sanitized = sanitizeCourseInvigilatorConstraintsMap(
      courseInvigilatorConstraints,
      validKeys,
      validInvigilatorNames
    );
    const currentJson = JSON.stringify(courseInvigilatorConstraints || {});
    const nextJson = JSON.stringify(sanitized);

    if (currentJson !== nextJson) {
      setCourseInvigilatorConstraints(sanitized);
    }
  }, [courseInvigilatorConstraints, parsed.courses, parsed.invigilators, manualInvigilators]);

  const getRequiredInvigilatorsCount = (course) => {
    if (invigilationMode === "ratio") {
      const ratio = Math.max(1, Number(studentsPerInvigilator) || 20);
      return Math.max(1, Math.ceil((course.studentCount || 0) / ratio));
    }
    return Math.max(1, Number(invigilatorsPerPeriod) || 1);
  };

const resolveScheduledSlotId = (item) => item?.id || `${item?.dateISO}-${item?.period}`;

const generateScheduleForCourses = (coursesList, existingScheduled = []) => {
  if (!rows.length) {
    showSf01ImportFirstToast();
    return [];
  }

  if (parsed.missingColumns.length) {
    showToast("أعمدة ناقصة", `الملف ينقصه: ${parsed.missingColumns.join("، ")}`, "error");
    return [];
  }

  if (invalidPeriods.length) {
    showToast("أوقات غير صحيحة", periodOverlapWarning || "تحقق من إعداد الفترات وتأكد من عدم وجود تداخل بينها.", "error");
    return [];
  }

  if (!slots.length) {
    showToast("لا توجد فترات", "اختر تاريخ بداية وأيامًا وعدد أيام مناسبًا مع أوقات صحيحة.", "error");
    return [];
  }


const hallsPool = normalizedExamHalls;

  const baseInvigilators = manualInvigilators
    ? manualInvigilators.split("\n").map((name) => name.trim()).filter(Boolean)
    : parsed.invigilators;

  const invigilatorPool = [
    ...new Set(
      baseInvigilators.filter((name) => {
        const normalizedName = normalizeArabic(name);

        const manuallyExcluded = excludedInvigilators.some(
          (excluded) => normalizeArabic(excluded) === normalizedName
        );

        const excludedBecauseGeneralStudiesOnly =
          !includeAllDepartmentsAndMajors &&
          excludedInvigilatorsForSelectedDepartments.has(normalizedName);

        return !manuallyExcluded && !excludedBecauseGeneralStudiesOnly;
      })
    ),
  ];

  const scopedCourseTrainerNameSet = new Set(
    (restrictSpecializedInvigilationToVisibleDepartmentTrainers && !includeAllDepartmentsAndMajors
      ? coursesList
          .filter((course) => !isGeneralStudiesCourse(course))
          .flatMap((course) =>
            getStrictTrainerNamesForCourse(course, parsed.filteredRows, generalStudiesInvigilatorsSet)
          )
      : []
    ).map((name) => normalizeArabic(name))
  );

  const specializedScopedInvigilatorPool =
    restrictSpecializedInvigilationToVisibleDepartmentTrainers && !includeAllDepartmentsAndMajors
      ? invigilatorPool.filter((name) => scopedCourseTrainerNameSet.has(normalizeArabic(name)))
      : invigilatorPool;

  const generalStudiesScopedInvigilatorPool =
    restrictGeneralStudiesInvigilationToGeneralStudiesTrainers
      ? invigilatorPool.filter((name) => generalStudiesInvigilatorsSet.has(normalizeArabic(name)))
      : invigilatorPool;

  const studentSlotMap = new Map();
  const studentDayMap = new Map();
  const slotCoursesMap = new Map(slots.map((slot) => [slot.id, []]));
  const hallUsageMap = new Map();
  const invigilatorLoad = new Map(invigilatorPool.map((name) => [name, 0]));
  const invigilatorBusyPeriods = new Map(invigilatorPool.map((name) => [name, new Set()]));
  const invigilatorDayLoad = new Map(invigilatorPool.map((name) => [name, new Map()]));
  const scheduledTypeByDate = new Map();
  const orderedDateIndexMap = new Map(
    Array.from(new Set(slots.map((slot) => slot.dateISO))).map((dateISO, index) => [dateISO, index])
  );
  // نستخدم المقررات المجدولة سابقًا كأساس حتى لا يتكرر المراقب أو يتكرر المتدرب في نفس الفترة
  const basePlaced = [...existingScheduled];
  const newPlaced = [];
  const notPlaced = [];
  const hallWarningItems = [];

  basePlaced.forEach((item) => {
  const slotId = item.id || `${item.dateISO}-${item.period}`;
const periodKey = getSlotPeriodKey(item);
    (item.students || []).forEach((studentId) => {
      if (!studentSlotMap.has(studentId)) studentSlotMap.set(studentId, new Set());
      studentSlotMap.get(studentId).add(slotId);

      if (!studentDayMap.has(studentId)) studentDayMap.set(studentId, new Map());
      const dayMap = studentDayMap.get(studentId);
      dayMap.set(item.dateISO, (dayMap.get(item.dateISO) || 0) + 1);
    });

    if (!slotCoursesMap.has(slotId)) {
      slotCoursesMap.set(slotId, []);
    }
    slotCoursesMap.get(slotId).push(item.key);

    getScheduledItemHallAssignments(item).forEach((entry) => {
      const existingHall = hallsPool.find(
        (hall) => normalizeArabic(hall.name) === normalizeArabic(entry.hallName)
      );
      if (existingHall && Number(entry.seats) > 0) {
        reserveSeatsInHallForSlot(existingHall, item, hallUsageMap, entry.seats);
      }
    });

    (item.invigilators || []).forEach((name) => {
      if (!invigilatorLoad.has(name)) invigilatorLoad.set(name, 0);
if (!invigilatorBusyPeriods.has(name)) invigilatorBusyPeriods.set(name, new Set());
if (!invigilatorDayLoad.has(name)) invigilatorDayLoad.set(name, new Map());

invigilatorLoad.set(name, (invigilatorLoad.get(name) || 0) + 1);
invigilatorBusyPeriods.get(name).add(periodKey);
const dayLoadMap = invigilatorDayLoad.get(name);
dayLoadMap.set(item.dateISO, (dayLoadMap.get(item.dateISO) || 0) + 1);
    });

    const itemTypeKey = isGeneralStudiesCourse(item) ? "general" : "specialized";
    const currentDayTypeCounts = scheduledTypeByDate.get(item.dateISO) || { general: 0, specialized: 0 };
    currentDayTypeCounts[itemTypeKey] = (currentDayTypeCounts[itemTypeKey] || 0) + 1;
    scheduledTypeByDate.set(item.dateISO, currentDayTypeCounts);
  });



const getMinInvigilatorLoad = () => {
  const values = Array.from(invigilatorLoad.values());
  return values.length ? Math.min(...values) : 0;
};
const getInvigilatorDayLoadForDate = (name, dateISO) =>
  invigilatorDayLoad.get(name)?.get(dateISO) || 0;
const rankInvigilatorForFairness = (
  name,
  slot,
  preferTrainer = false,
  hardFairness = false
) => {
  const load = invigilatorLoad.get(name) || 0;
  const minLoad = getMinInvigilatorLoad();
  const dayLoad = slot ? getInvigilatorDayLoadForDate(name, slot.dateISO) : 0;

  const overloadPenalty = hardFairness
    ? (load > minLoad ? 100000 : 0)
    : (load > minLoad + 1 ? 1000 : 0);

  const sameDayPenalty = hardFairness
    ? (dayLoad > 0 ? 20 + dayLoad * 10 : 0)
    : (dayLoad > 0 ? 3 + dayLoad * 2 : 0);

  const trainerBonus = preferTrainer && !hardFairness ? -0.15 : 0;

  return load + overloadPenalty + sameDayPenalty + trainerBonus;
};

const pickInvigilators = (course, slot) => {
  if (!includeInvigilators) return [];

  const requiredCount = getRequiredInvigilatorsCount(course);
  const periodKey = getSlotPeriodKey(slot);
  const chosen = [];

  const courseTrainerNames = String(course.trainerText || "")
    .split("/")
    .map((name) => name.trim())
    .filter(Boolean);

  const normalizedTrainerSet = new Set(
    courseTrainerNames.map((name) => normalizeArabic(name))
  );

  const constraint =
    typeof getCourseInvigilatorConstraint === "function"
      ? getCourseInvigilatorConstraint(course)
      : { mode: "off", invigilatorNames: [] };

  const scopedPool = isGeneralStudiesCourse(course)
    ? (restrictGeneralStudiesInvigilationToGeneralStudiesTrainers
        ? generalStudiesScopedInvigilatorPool
        : invigilatorPool)
    : (restrictSpecializedInvigilationToVisibleDepartmentTrainers &&
      !includeAllDepartmentsAndMajors
        ? specializedScopedInvigilatorPool
        : invigilatorPool);

  const baseCandidates = scopedPool
    .filter(
      (name) =>
        !excludedInvigilators.some(
          (ex) => normalizeArabic(ex) === normalizeArabic(name)
        )
    )
    .filter((name) => !invigilatorBusyPeriods.get(name)?.has(periodKey));

  if (restrictSpecializedInvigilationToVisibleDepartmentTrainers && !includeAllDepartmentsAndMajors) {
    console.warn("INVIGILATOR_SCOPE_DEBUG", {
      courseName: course?.courseName,
      courseCode: course?.courseCode,
      department: course?.department,
      major: course?.major,
      scopedPoolCount: scopedPool.length,
      baseCandidatesCount: baseCandidates.length,
      scopedPool,
      baseCandidates,
    });
  }

  const normalizedManualSet = new Set(
    (constraint.invigilatorNames || []).map((name) => normalizeArabic(name))
  );

  const departmentTrainerSet = new Set(
    (
      (typeof getStrictTrainerNamesForCourse === "function"
        ? getStrictTrainerNamesForCourse(course, parsed.filteredRows, generalStudiesInvigilatorsSet)
        : []) || []
    ).map((name) => normalizeArabic(name))
  );

  let constrainedCandidates = [...baseCandidates];
  let strictOnlyMode = false;

  if (
    restrictSpecializedInvigilationToVisibleDepartmentTrainers &&
    !includeAllDepartmentsAndMajors &&
    !isGeneralStudiesCourse(course)
  ) {
    strictOnlyMode = true;
    constrainedCandidates = baseCandidates.filter((name) =>
      departmentTrainerSet.has(normalizeArabic(name))
    );
  }

  switch (constraint.mode) {
    case "only":
      strictOnlyMode = true;
      constrainedCandidates = baseCandidates.filter((name) =>
        normalizedManualSet.has(normalizeArabic(name))
      );
      break;

    case "avoid":
      constrainedCandidates = baseCandidates.filter(
        (name) => !normalizedManualSet.has(normalizeArabic(name))
      );
      break;

    case "only_department_trainers":
      strictOnlyMode = true;
      constrainedCandidates = baseCandidates.filter((name) =>
        departmentTrainerSet.has(normalizeArabic(name))
      );
      break;

    case "avoid_department_trainers":
      constrainedCandidates = baseCandidates.filter(
        (name) => !departmentTrainerSet.has(normalizeArabic(name))
      );
      break;

    case "prefer":
    default:
      constrainedCandidates = baseCandidates;
      break;
  }

  const hardFairnessForThisCourse =
    (restrictSpecializedInvigilationToVisibleDepartmentTrainers &&
      !includeAllDepartmentsAndMajors &&
      !isGeneralStudiesCourse(course)) ||
    (restrictGeneralStudiesInvigilationToGeneralStudiesTrainers &&
      isGeneralStudiesCourse(course));

  const sortCandidates = (candidates) =>
    [...candidates].sort((a, b) => {
      const aScore = rankInvigilatorForFairness(
        a,
        slot,
        preferCourseTrainerInvigilation &&
          normalizedTrainerSet.has(normalizeArabic(a)),
        hardFairnessForThisCourse
      );
      const bScore = rankInvigilatorForFairness(
        b,
        slot,
        preferCourseTrainerInvigilation &&
          normalizedTrainerSet.has(normalizeArabic(b)),
        hardFairnessForThisCourse
      );

      return aScore - bScore || a.localeCompare(b, "ar");
    });

  while (chosen.length < requiredCount) {
    const minLoad = getMinInvigilatorLoad();

    const fairCandidates = sortCandidates(
      constrainedCandidates
        .filter((name) => !chosen.includes(name))
        .filter((name) =>
          (invigilatorLoad.get(name) || 0) <=
          (hardFairnessForThisCourse ? minLoad : minLoad + 1)
        )
    );

    if (!fairCandidates.length) break;
    chosen.push(fairCandidates[0]);
  }

  if (chosen.length < requiredCount) {
    const minLoad = getMinInvigilatorLoad();
    const nearFairCandidates = sortCandidates(
      constrainedCandidates
        .filter((name) => !chosen.includes(name))
        .filter((name) =>
          (invigilatorLoad.get(name) || 0) <=
          (hardFairnessForThisCourse ? minLoad + 1 : minLoad + 2)
        )
    );

    for (const name of nearFairCandidates) {
      if (chosen.length >= requiredCount) break;
      chosen.push(name);
    }
  }

  if (!hardFairnessForThisCourse && chosen.length < requiredCount) {
    const fallbackCandidates = sortCandidates(
      constrainedCandidates.filter((name) => !chosen.includes(name))
    );

    for (const name of fallbackCandidates) {
      if (chosen.length >= requiredCount) break;
      chosen.push(name);
    }
  }

  chosen.forEach((name) => {
    if (!invigilatorBusyPeriods.has(name)) {
      invigilatorBusyPeriods.set(name, new Set());
    }
    if (!invigilatorDayLoad.has(name)) {
      invigilatorDayLoad.set(name, new Map());
    }

    invigilatorLoad.set(name, (invigilatorLoad.get(name) || 0) + 1);
    invigilatorBusyPeriods.get(name).add(periodKey);
    const dayLoadMap = invigilatorDayLoad.get(name);
    dayLoadMap.set(slot.dateISO, (dayLoadMap.get(slot.dateISO) || 0) + 1);
  });

  return chosen;
};
  
  const diagnoseUnscheduledCourse = (course) => {
    const diagnosis = {
      totalSlots: slots.length,
      studentConflict: 0,
      dailyLimit: 0,
      levelConflict: 0,
      hallUnavailable: 0,
      hallOnlyBlock: 0,
      invigilatorShortage: 0,
      avoidedConstraint: 0,
      studentConflictSlots: [],
      dailyLimitSlots: [],
      levelConflictSlots: [],
      hallUnavailableSlots: [],
      invigilatorShortageSlots: [],
      avoidedConstraintSlots: [],
    };

    const courseConstraint = courseConstraints[course.key] || getCourseConstraintDefaults();
    const courseLevel = courseLevels[course.key] || "";
    const sameDayLimit = Math.max(1, Number(maxExamsPerStudentPerDay) || 2);
    const requiredInvigilators = includeInvigilators ? getRequiredInvigilatorsCount(course) : 0;

    slots.forEach((slot) => {
      let slotStudentConflict = false;
      let slotDailyLimit = false;
      let slotLevelConflict = false;
      let slotInvigilatorShortage = false;
      let slotAvoidedConstraint = false;
      const slotBlockingStudents = [];
      const slotBlockingStudentIds = new Set();

      course.students.forEach((studentId) => {
        const usedSlots = studentSlotMap.get(studentId) || new Set();
        if (usedSlots.has(slot.id)) {
          slotStudentConflict = true;
          if (!slotBlockingStudentIds.has(studentId)) {
            slotBlockingStudentIds.add(studentId);
            slotBlockingStudents.push(
              preciseStudentInfoMap.get(studentId) || {
                id: studentId,
                name: 'بدون اسم',
                department: '-',
                major: '-',
              }
            );
          }
        }

        const dayMap = studentDayMap.get(studentId) || new Map();
        const sameDayCount = dayMap.get(slot.dateISO) || 0;
        if (sameDayCount >= sameDayLimit) slotDailyLimit = true;
      });

      if (slotStudentConflict) {
        diagnosis.studentConflict += 1;
        diagnosis.studentConflictSlots.push({
          slotId: slot.id,
          dateISO: slot.dateISO,
          dayName: slot.dayName,
          period: slot.period,
          timeText: slot.timeText,
          blockingStudents: slotBlockingStudents
            .slice()
            .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'ar') || String(a?.id || '').localeCompare(String(b?.id || ''), 'ar')),
        });
      }
      if (slotDailyLimit) {
        diagnosis.dailyLimit += 1;
        diagnosis.dailyLimitSlots.push({
          slotId: slot.id,
          dateISO: slot.dateISO,
          dayName: slot.dayName,
          period: slot.period,
          timeText: slot.timeText,
        });
      }

      if (!slotStudentConflict && !slotDailyLimit && avoidSameLevelSameDay && courseLevel) {
        const sameDateSameLevelExists = [...basePlaced, ...newPlaced].some(
          (item) => item.dateISO === slot.dateISO && courseLevels[item.key] === courseLevel
        );
        if (sameDateSameLevelExists) {
          diagnosis.levelConflict += 1;
          diagnosis.levelConflictSlots.push({
            slotId: slot.id,
            dateISO: slot.dateISO,
            dayName: slot.dayName,
            period: slot.period,
            timeText: slot.timeText,
          });
          slotLevelConflict = true;
        }
      }

      const constrainedHallNames = new Set(
        getConstrainedHallsForCourse(hallsPool, course).map((hall) => normalizeArabic(hall.name))
      );
      const matchingHallDetails = hallsPool.map((hall) => {
        const effectiveRemaining = getEffectiveAssignableHallCapacityForSlot(
          hall,
          course,
          slot,
          hallUsageMap
        );
        const canAssign = canAssignHallToCourseInSlot(hall, course, slot, hallUsageMap);

        return {
          hall: hall.name,
          hallId: hall.id || null,
          allowSharedAssignments: hall.allowSharedAssignments,
          allowedForCourse: isHallAllowedForCourse(hall, course),
          passesConstraint: constrainedHallNames.has(normalizeArabic(hall.name)),
          capacity: Number(hall.capacity) || 0,
          used: hallUsageMap.get(getHallUsageKey(slot, hall)) || 0,
          remainingBeforeConstraint: getRemainingHallCapacityForSlot(hall, slot, hallUsageMap),
          effectiveRemaining,
          canFitSingleHall: effectiveRemaining >= (Number(course.studentCount) || 0),
          canAssign,
        };
      });

      const matchingHallCount = canAssignCourseToSlotWithSplit(hallsPool, course, slot, hallUsageMap) ? 1 : 0;

      if (!matchingHallCount) {
        diagnosis.hallUnavailable += 1;
        diagnosis.hallUnavailableSlots.push({
          slotId: slot.id,
          dateISO: slot.dateISO,
          dayName: slot.dayName,
          period: slot.period,
          timeText: slot.timeText,
        });
      }

      if (includeInvigilators) {
        const periodKey = getSlotPeriodKey(slot);
        const availableInvigilatorsCount = invigilatorPool.filter(
          (name) => !invigilatorBusyPeriods.get(name)?.has(periodKey)
        ).length;
        if (availableInvigilatorsCount < requiredInvigilators) {
          diagnosis.invigilatorShortage += 1;
          diagnosis.invigilatorShortageSlots.push({
            slotId: slot.id,
            dateISO: slot.dateISO,
            dayName: slot.dayName,
            period: slot.period,
            timeText: slot.timeText,
          });
          slotInvigilatorShortage = true;
        }
      }

      if (
        courseConstraint.avoidedDays.includes(slot.dayName) ||
        courseConstraint.avoidedPeriods.includes(slot.period)
      ) {
        diagnosis.avoidedConstraint += 1;
        diagnosis.avoidedConstraintSlots.push({
          slotId: slot.id,
          dateISO: slot.dateISO,
          dayName: slot.dayName,
          period: slot.period,
          timeText: slot.timeText,
        });
        slotAvoidedConstraint = true;
      }

      if (
        !slotStudentConflict &&
        !slotDailyLimit &&
        !slotLevelConflict &&
        !slotInvigilatorShortage &&
        !slotAvoidedConstraint &&
        !matchingHallCount
      ) {
        diagnosis.hallOnlyBlock += 1;
      }
    });

const requiredSeats = Number(course.studentCount) || 0;
    const maxAvailable = getMaxAllowedHallCapacity(hallsPool, course);

    const hallConstraintSummary = getEffectiveHallConstraintSummary(course);
    const maxRemainingAcrossSlots = diagnosis.totalSlots
      ? slots.reduce((best, slot) => {
          return Math.max(
            best,
            getMaxAssignableCapacityForSlotIncludingSplit(hallsPool, course, slot, hallUsageMap)
          );
        }, 0)
      : 0;

    const hasAnyFittableHallInAnySlot = maxRemainingAcrossSlots >= requiredSeats;
    const reasonParts = [];

    if ((Number(maxAvailable) || 0) <= 0) {
      return {
        shortLabel: "لا توجد قاعة مناسبة",
        detail:
          `لا توجد قاعة مناسبة لهذا المقرر ضمن القاعات المتاحة أصلًا. ` +
          `يحتاج ${requiredSeats} مقعدًا، ` +
          `وأكبر سعة مسموحة هي ${Number(maxAvailable) || 0}.`,
      };
    }

    if (!hasAnyFittableHallInAnySlot) {
        return {
        shortLabel: "لا توجد قاعة مناسبة",
        detail:
          hallConstraintSummary.mode === "only"
            ? `لا توجد قاعة مناسبة لهذا المقرر بعد تطبيق قيد القاعات الفعّال. ${hallConstraintSummary.label}. يحتاج ${requiredSeats} مقعدًا، وأكبر سعة قابلة للإسناد فعليًا بعد تطبيق القيد واحتساب التقسيم والمقاعد المشغولة هي ${Number.isFinite(Number(maxRemainingAcrossSlots)) ? Number(maxRemainingAcrossSlots) : 0}.`
            : `لا توجد قاعة مناسبة لهذا المقرر في الفترات الحالية. يحتاج ${requiredSeats} مقعدًا، وأكبر سعة قابلة للإسناد فعليًا بعد احتساب التقسيم والمقاعد المشغولة وتطبيق القيود هي ${Number.isFinite(Number(maxRemainingAcrossSlots)) ? Number(maxRemainingAcrossSlots) : 0}.`,
      };
    }

    if (diagnosis.studentConflict) {
      reasonParts.push(`تعارض متدربين في ${diagnosis.studentConflict} فترة`);
    }
    if (diagnosis.dailyLimit) {
      reasonParts.push(`بلوغ الحد اليومي للمتدربين في ${diagnosis.dailyLimit} فترة`);
    }
    if (diagnosis.levelConflict) {
      reasonParts.push(`تعارض مستوى في ${diagnosis.levelConflict} فترة`);
    }
    if (diagnosis.hallUnavailable) {
      reasonParts.push(`عدم توفر قاعة مناسبة في ${diagnosis.hallUnavailable} فترة`);
    }
    if (diagnosis.invigilatorShortage) {
      reasonParts.push(`عدم كفاية المراقبين في ${diagnosis.invigilatorShortage} فترة`);
    }
    if (diagnosis.avoidedConstraint) {
      reasonParts.push(`وجود قيود تفضيل/تجنب على ${diagnosis.avoidedConstraint} فترة`);
    }

    if (!reasonParts.length) {
      return {
        shortLabel: "تعذر الجدولة",
        detail: "تعذر العثور على فترة مناسبة لهذا المقرر ضمن الإعدادات الحالية.",
      };
    }

    const rankedReason = diagnosis.hallOnlyBlock
      ? ["لا توجد قاعة مناسبة", diagnosis.hallOnlyBlock]
      : [
          ["لا توجد قاعة مناسبة", diagnosis.hallUnavailable],
          ["تعارض متدربين", diagnosis.studentConflict + diagnosis.dailyLimit],
          ["لا يوجد مراقبون كافيون", diagnosis.invigilatorShortage],
          ["قيود الجدولة", diagnosis.levelConflict + diagnosis.avoidedConstraint],
        ].sort((a, b) => b[1] - a[1])[0];

    return {
      shortLabel: rankedReason?.[0] || "تعذر الجدولة",
      detail: `تعذر جدولة هذا المقرر بعد فحص ${diagnosis.totalSlots} فترة متاحة: ${reasonParts.join("، ")}.`,
      details: {
        studentConflictSlots: diagnosis.studentConflictSlots,
        dailyLimitSlots: diagnosis.dailyLimitSlots,
        hallUnavailableSlots: diagnosis.hallUnavailableSlots,
        levelConflictSlots: diagnosis.levelConflictSlots,
        invigilatorShortageSlots: diagnosis.invigilatorShortageSlots,
        avoidedConstraintSlots: diagnosis.avoidedConstraintSlots,
      },
    };
  };

  const scoreSlot = (course, slot) => {
    let hardConflict = false;
    let sameDayPenalty = 0;
    const courseLevel = courseLevels[course.key] || "";
    const slotLoadPenalty = (slotCoursesMap.get(slot.id)?.length || 0) * 6;
    const periodKey = getSlotPeriodKey(slot);
    const requiredInvigilators = includeInvigilators ? getRequiredInvigilatorsCount(course) : 0;
    const samePeriodGroupId = enableSamePeriodGroups ? samePeriodGroupLookup.get(course.key) : "";

    course.students.forEach((studentId) => {
      const usedSlots = studentSlotMap.get(studentId) || new Set();
      if (usedSlots.has(slot.id)) hardConflict = true;

      const dayMap = studentDayMap.get(studentId) || new Map();
      const sameDayCount = dayMap.get(slot.dateISO) || 0;
      const sameDayLimit = Math.max(1, Number(maxExamsPerStudentPerDay) || 2);

      if (sameDayCount >= sameDayLimit) hardConflict = true;
      if (sameDayCount >= 1) sameDayPenalty += sameDayCount * 4;
    });

    if (!hardConflict && avoidSameLevelSameDay && courseLevel) {
      const sameDateSameLevelExists = [...basePlaced, ...newPlaced].some(
        (item) => item.dateISO === slot.dateISO && courseLevels[item.key] === courseLevel
      );
      if (sameDateSameLevelExists) hardConflict = true;
    }

    if (hardConflict) return Number.POSITIVE_INFINITY;

    let score = slotLoadPenalty + sameDayPenalty;

    const courseConstraint = courseConstraints[course.key] || getCourseConstraintDefaults();

    if (courseConstraint.preferredDays.includes(slot.dayName)) score -= 40;
    if (courseConstraint.preferredPeriods.includes(slot.period)) score -= 35;
    if (courseConstraint.avoidedDays.includes(slot.dayName)) score += 70;
    if (courseConstraint.avoidedPeriods.includes(slot.period)) score += 55;

    if (includeInvigilators) {
      const availableInvigilatorsCount = invigilatorPool.filter(
        (name) => !invigilatorBusyPeriods.get(name)?.has(periodKey)
      ).length;

      if (availableInvigilatorsCount < requiredInvigilators) {
        score += (requiredInvigilators - availableInvigilatorsCount) * 50;
      }
    }

    const matchingHallCount = canAssignCourseToSlotWithSplit(hallsPool, course, slot, hallUsageMap) ? 1 : 0;

    if (!matchingHallCount) {
      return Number.POSITIVE_INFINITY;
    }

    if (samePeriodGroupId) {
      const placedGroupMates = [...basePlaced, ...newPlaced].filter(
        (item) =>
          item.key !== course.key &&
          samePeriodGroupLookup.get(item.key) === samePeriodGroupId
      );

      if (placedGroupMates.length) {
        const sameSlotMatches = placedGroupMates.filter(
          (item) => item.dateISO === slot.dateISO && item.period === slot.period
        ).length;

        if (sameSlotMatches > 0) {
          score -= sameSlotMatches * 1000;
        } else {
          score += placedGroupMates.length * 180;
        }
      }
    }

    if (generalSpecializedDaySeparationMode !== "off") {
      const currentTypeKey = isGeneralStudiesCourse(course) ? "general" : "specialized";
      const oppositeTypeKey = currentTypeKey === "general" ? "specialized" : "general";
      const dayTypeCounts = scheduledTypeByDate.get(slot.dateISO) || { general: 0, specialized: 0 };
      const sameTypeCount = dayTypeCounts[currentTypeKey] || 0;
      const oppositeTypeCount = dayTypeCounts[oppositeTypeKey] || 0;
      const strongMode = generalSpecializedDaySeparationMode === "strong";
      const dateIndex = orderedDateIndexMap.get(slot.dateISO) || 0;
      const preferredParity = currentTypeKey === "general" ? 0 : 1;
      const matchesPreferredDayTrack = dateIndex % 2 === preferredParity;

      if (matchesPreferredDayTrack) {
        score -= strongMode ? 180 : 70;
      } else {
        score += strongMode ? 260 : 95;
      }

      if (sameTypeCount > 0) {
        score -= strongMode ? sameTypeCount * 110 : sameTypeCount * 45;
      }
      if (oppositeTypeCount > 0) {
        score += strongMode ? oppositeTypeCount * 260 : oppositeTypeCount * 95;
      }
    }

    return score;
  };

  const sortedCoursesForInvigilation = [...coursesList].sort((a, b) => {
  const aNeed = getRequiredInvigilatorsCount(a);
  const bNeed = getRequiredInvigilatorsCount(b);

  const aGrouped = enableSamePeriodGroups && samePeriodGroupLookup.has(a.key);
  const bGrouped = enableSamePeriodGroups && samePeriodGroupLookup.has(b.key);
  const aGroupSize = samePeriodGroupSizeLookup.get(a.key) || 0;
  const bGroupSize = samePeriodGroupSizeLookup.get(b.key) || 0;

  return (
    Number(bGrouped) - Number(aGrouped) ||
    bGroupSize - aGroupSize ||
    bNeed - aNeed ||
    b.studentCount - a.studentCount ||
    b.conflictDegree - a.conflictDegree
  );
});

sortedCoursesForInvigilation.forEach((course) => {
    let bestSlot = null;
    let bestScore = Number.POSITIVE_INFINITY;

    slots.forEach((slot) => {
      const score = scoreSlot(course, slot);
      if (score < bestScore) {
        bestScore = score;
        bestSlot = slot;
      }
    });

  
      if (!bestSlot || !Number.isFinite(bestScore)) {
  const maxRemainingAcrossSlots = slots.length
    ? slots.reduce((best, slot) => {
        return Math.max(
          best,
          getMaxAssignableCapacityForSlotIncludingSplit(hallsPool, course, slot, hallUsageMap)
        );
      }, 0)
    : 0;

  if ((Number(course.studentCount) || 0) > 0) {
    hallWarningItems.push({
      courseName: course.courseName || course.courseCode || "مقرر بدون اسم",
      required: Number(course.studentCount) || 0,
      maxAvailable: Number.isFinite(Number(maxRemainingAcrossSlots)) ? Number(maxRemainingAcrossSlots) : 0,
    });
  }
  const diagnosis = diagnoseUnscheduledCourse(course);
  notPlaced.push({
    ...course,
    unscheduledReason: diagnosis.detail,
    unscheduledShortLabel: diagnosis.shortLabel,
    unscheduledReasonDetails: diagnosis.details || null,
  });
  return;
}

    course.students.forEach((studentId) => {
      if (!studentSlotMap.has(studentId)) studentSlotMap.set(studentId, new Set());
      studentSlotMap.get(studentId).add(bestSlot.id);

      if (!studentDayMap.has(studentId)) studentDayMap.set(studentId, new Map());
      const dayMap = studentDayMap.get(studentId);
      dayMap.set(bestSlot.dateISO, (dayMap.get(bestSlot.dateISO) || 0) + 1);
    });

    const hallConstraintSummary = getEffectiveHallConstraintSummary(course);
    const fittingHalls = getAssignableConstrainedHallsForSlot(
      hallsPool,
      course,
      bestSlot,
      hallUsageMap
    ).sort((a, b) => {
      const aPreferred = hallConstraintSummary.mode === "prefer" && hallConstraintSummary.hallNames.some((name) => normalizeArabic(name) === normalizeArabic(a.name)) ? 1 : 0;
      const bPreferred = hallConstraintSummary.mode === "prefer" && hallConstraintSummary.hallNames.some((name) => normalizeArabic(name) === normalizeArabic(b.name)) ? 1 : 0;
      if (aPreferred !== bPreferred) return bPreferred - aPreferred;
      const aRemaining = getRemainingHallCapacityForSlot(a, bestSlot, hallUsageMap);
      const bRemaining = getRemainingHallCapacityForSlot(b, bestSlot, hallUsageMap);
      return aRemaining - bRemaining || Number(a.capacity) - Number(b.capacity);
    });

    let assignedHall = null;
    let assignedHallObj = null;
    let assignedHallAssignments = [];

    if (fittingHalls.length) {
      assignedHallObj = fittingHalls[0];
      assignedHall = assignedHallObj.name;
      assignedHallAssignments = [
        {
          hallName: assignedHallObj.name,
          seats: Number(course.studentCount) || 0,
        },
      ];
      reserveHallForCourseInSlot(assignedHallObj, course, bestSlot, hallUsageMap);
    } else {
      const splitAssignments = getSplitAssignableHallCombinationForSlot(
        hallsPool,
        course,
        bestSlot,
        hallUsageMap
      );

      if (splitAssignments.length) {
        assignedHallAssignments = splitAssignments.map((entry) => ({
          hallName: entry.hall.name,
          seats: entry.seats,
        }));
        assignedHall = assignedHallAssignments.map((entry) => entry.hallName).join(" + ");
        splitAssignments.forEach((entry) => {
          reserveSeatsInHallForSlot(entry.hall, bestSlot, hallUsageMap, entry.seats);
        });
      } else {
 
  const constrainedHallNames = new Set(
    getConstrainedHallsForCourse(hallsPool, course).map((hall) => normalizeArabic(hall.name))
  );
  const hallDebugSnapshot = hallsPool.map((hall) => ({
    hall: hall.name,
    hallId: hall.id || null,
    allowSharedAssignments: hall.allowSharedAssignments,
    allowedForCourse: isHallAllowedForCourse(hall, course),
    passesConstraint: constrainedHallNames.has(normalizeArabic(hall.name)),
    capacity: Number(hall.capacity) || 0,
    used: hallUsageMap.get(getHallUsageKey(bestSlot, hall)) || 0,
    rawRemaining: (Number(hall.capacity) || 0) - (hallUsageMap.get(getHallUsageKey(bestSlot, hall)) || 0),
    remainingBeforeConstraint: getRemainingHallCapacityForSlot(hall, bestSlot, hallUsageMap),
    computedRemaining: getEffectiveAssignableHallCapacityForSlot(hall, course, bestSlot, hallUsageMap),
    canFitSingleHall: getEffectiveAssignableHallCapacityForSlot(hall, course, bestSlot, hallUsageMap) >= (Number(course.studentCount) || 0),
    canAssign: canAssignHallToCourseInSlot(hall, course, bestSlot, hallUsageMap),
  }));

  const maxRemaining = getMaxRemainingConstrainedHallCapacityForSlot(
    hallsPool,
    course,
    bestSlot,
    hallUsageMap
  );

  hallWarningItems.push({
    courseKey: course.key,
    courseName: course.courseName || course.courseCode || "مقرر بدون اسم",
    courseCode: course.courseCode || "",
    department: course.department || "",
    major: course.major || "",
    departmentRoots: Array.isArray(course.departmentRoots) ? [...course.departmentRoots] : [],
    required: Number(course.studentCount) || 0,
    maxAvailable: maxRemaining,
  });

  notPlaced.push({
    ...course,
    unscheduledReason:
      hallConstraintSummary.mode === "only"
        ? `لا توجد قاعة مناسبة لهذا المقرر بعد تطبيق قيد القاعات الفعّال في هذه الفترة. ${hallConstraintSummary.label}. يحتاج ${Number(course.studentCount) || 0} مقعدًا، وأكبر سعة متبقية فعلية بعد تطبيق القيد هي ${Number(maxRemaining) || 0}.`
        : `لا توجد قاعة مناسبة لهذا المقرر ضمن القاعات المتاحة في هذه الفترة. يحتاج ${Number(course.studentCount) || 0} مقعدًا، وأكبر سعة متبقية فعلية بعد تطبيق القيود هي ${Number(maxRemaining) || 0}.`,
    unscheduledShortLabel: "لا توجد قاعة مناسبة",
    unscheduledReasonDetails: {
      hallUnavailableSlots: [
        {
          slotId: bestSlot?.id || null,
          dateISO: bestSlot?.dateISO || "",
          dayName: bestSlot?.dayName || "",
          period: bestSlot?.period || null,
          timeText: bestSlot?.timeText || "",
          summary: hallConstraintSummary.mode === "only"
            ? `تم فحص أفضل فترة ممكنة بعد تطبيق قيد القاعات: ${hallConstraintSummary.label || "قيد فعّال"}.`
            : "تم فحص أفضل فترة ممكنة لكن لم تتوفر سعة كافية في القاعات المتاحة.",
          reason: hallConstraintSummary.mode === "only"
            ? `القاعات المقيدة للمقرر لم توفر سعة كافية. المطلوب ${Number(course.studentCount) || 0} مقعدًا، وأكبر سعة متبقية فعلية هي ${Number(maxRemaining) || 0}.`
            : `القاعات المتاحة في هذه الفترة لم توفر سعة كافية. المطلوب ${Number(course.studentCount) || 0} مقعدًا، وأكبر سعة متبقية فعلية هي ${Number(maxRemaining) || 0}.`,
          hallMessages: hallDebugSnapshot.map((hall) => {
            const allowedText = hall.allowedForCourse ? "مسموح للمقرر" : "غير مسموح للمقرر";
            const constraintText = hall.passesConstraint ? "داخل القيد" : "خارج القيد";
            const usedSeats = Number(hall.used) || 0;
            const remainingSeats = Number.isFinite(Number(hall.computedRemaining)) ? Number(hall.computedRemaining) : 0;
            return `${hall.hall}: السعة ${Number(hall.capacity) || 0}، المشغول ${usedSeats}، المتاح فعليًا ${remainingSeats}، ${allowedText}، ${constraintText}`;
          }),
        },
      ],
    },
  });

  return;
}
    }
  
    slotCoursesMap.get(bestSlot.id).push(course.key);
const pickedInvigilators = pickInvigilators(course, bestSlot);
const requiredInvigilatorsCount = includeInvigilators ? getRequiredInvigilatorsCount(course) : 0;

if (includeInvigilators && pickedInvigilators.length < requiredInvigilatorsCount) {
  notPlaced.push({
    ...course,
    unscheduledReason: `${isGeneralStudiesCourse(course) && restrictGeneralStudiesInvigilationToGeneralStudiesTrainers
      ? `لا يوجد عدد كافٍ من مدربي مقررات الدراسات العامة لهذا المقرر في هذه الفترة. المطلوب ${requiredInvigilatorsCount}، والمتاح فعليًا ${pickedInvigilators.length}.`
      : (!isGeneralStudiesCourse(course) && restrictSpecializedInvigilationToVisibleDepartmentTrainers && !includeAllDepartmentsAndMajors)
        ? `لا يوجد عدد كافٍ من مدربي مقررات القسم/التخصص المحدد لهذا المقرر في هذه الفترة. المطلوب ${requiredInvigilatorsCount}، والمتاح فعليًا ${pickedInvigilators.length}.`
        : `لا يوجد عدد كافٍ من المراقبين لهذا المقرر في هذه الفترة. المطلوب ${requiredInvigilatorsCount}، والمتاح فعليًا ${pickedInvigilators.length}.`}`,
    unscheduledShortLabel: "لا يوجد مراقبون كافيون",
    unscheduledReasonDetails: {
      invigilatorShortageSlots: [
        {
          slotId: bestSlot?.id || null,
          dateISO: bestSlot?.dateISO || "",
          dayName: bestSlot?.dayName || "",
          period: bestSlot?.period || null,
          timeText: bestSlot?.timeText || "",
          reason: `المطلوب ${requiredInvigilatorsCount} مراقب/مراقبين، والمتاح فعليًا ${pickedInvigilators.length}.`,
          summary: `${isGeneralStudiesCourse(course) && restrictGeneralStudiesInvigilationToGeneralStudiesTrainers
            ? "تم اختيار الفترة مبدئيًا، لكن عدد مدربي مقررات الدراسات العامة المتاحين فيها لا يكفي لإسناد هذا المقرر."
            : (!isGeneralStudiesCourse(course) && restrictSpecializedInvigilationToVisibleDepartmentTrainers && !includeAllDepartmentsAndMajors)
              ? "تم اختيار الفترة مبدئيًا، لكن عدد مدربي مقررات القسم/التخصص المحدد المتاحين فيها لا يكفي لإسناد هذا المقرر."
              : "تم اختيار الفترة مبدئيًا، لكن المراقبين المتاحين فيها لا يكفون لإسناد هذا المقرر."}`,
          requiredInvigilatorsCount,
          availableInvigilatorsCount: pickedInvigilators.length,
          availableInvigilators: pickedInvigilators,
        },
      ],
    },
  });
  return;
}

const placedItem = {
  ...course,
  ...bestSlot,
  instanceId: makeScheduledInstanceId(),
  students: Array.from(course.students || []),
  trainers: Array.from(course.trainers || []),
  departments: Array.from(course.departments || []),
  majors: Array.from(course.majors || []),
  sectionNames: Array.from(course.sectionNames || []),
  scheduleTypes: Array.from(course.scheduleTypes || []),
  departmentRoots: Array.from(course.departmentRoots || []),
  examHall: assignedHall,
  examHallAssignments: assignedHallAssignments,
  invigilators: pickedInvigilators,
  manualEdited: false,
  isPinned: false,
};
newPlaced.push(placedItem);
const placedTypeKey = isGeneralStudiesCourse(placedItem) ? "general" : "specialized";
const placedDayTypeCounts = scheduledTypeByDate.get(bestSlot.dateISO) || { general: 0, specialized: 0 };
placedDayTypeCounts[placedTypeKey] = (placedDayTypeCounts[placedTypeKey] || 0) + 1;
scheduledTypeByDate.set(bestSlot.dateISO, placedDayTypeCounts);
  });

  newPlaced.sort((a, b) => a.dateISO.localeCompare(b.dateISO) || a.period - b.period || b.studentCount - a.studentCount);

  const underCoveredCoursesCount = 0;

  setPreviewPage(0);
  return { placed: newPlaced, notPlaced, hallWarnings: hallWarningItems };
};

const generateGeneralSchedule = () => {
  if (!hasImportedSf01) {
    showSf01ImportFirstToast();
    return;
  }

  const { placed, notPlaced, hallWarnings: nextHallWarnings } = generateScheduleForCourses(generalCourses, []);
  const sortedPlaced = [...placed].sort(
    (a, b) => a.dateISO.localeCompare(b.dateISO) || a.period - b.period || b.studentCount - a.studentCount
  );
  setGeneralSchedule(sortedPlaced);
  setSchedule(sortedPlaced);
  setSpecializedSchedule([]);
  setUnscheduled(notPlaced || []);
  setHallWarnings(nextHallWarnings || []);
  setPreviewTab("schedule");
  if (notPlaced.length) {
    showToast(
      "تم توزيع مقررات الدراسات العامة مع ملاحظات",
      `تم توزيع ${formatCourseCountLabel(placed.length)}. ${buildUnscheduledSummaryText(notPlaced)}`,
      "warning",
      {
        persistent: true,
        actions: [
          {
            label: "عرض غير المجدول",
            onClick: () => openUnscheduledCoursesPreview(true),
          },
        ],
      }
    );
  } else {
    showToast("تم توزيع مقررات الدراسات العامة", `تم توزيع ${formatCourseCountLabel(placed.length)}.`, "success");
  }
  setCurrentStep(6);
};

const generateSpecializedSchedule = () => {
  if (!hasImportedSf01) {
    showSf01ImportFirstToast();
    return;
  }

  const shouldWarnAboutMissingImportedSession = !hasImportedSessionFile && !(generalSchedule || []).length;
  const { placed, notPlaced, hallWarnings: nextHallWarnings } = generateScheduleForCourses(specializedCourses, generalSchedule);
  setSpecializedSchedule(placed);
  setHallWarnings((prev) => {
    const combined = [...(prev || []), ...(nextHallWarnings || [])];
    const map = new Map();
    combined.forEach((item) => {
      const key = `${item?.courseName || ""}__${item?.required || 0}__${item?.maxAvailable || 0}`;
      if (!map.has(key)) {
        map.set(key, item);
      }
    });
    return Array.from(map.values());
  });
  setPreviewTab("schedule");

  const merged = [...generalSchedule, ...placed].sort(
    (a, b) => a.dateISO.localeCompare(b.dateISO) || a.period - b.period || b.studentCount - a.studentCount
  );

  setSchedule(merged);
  setUnscheduled((prev) => {
    const combined = [...(prev || []), ...(notPlaced || [])];
    const map = new Map();
    combined.forEach((course) => {
      if (course?.key && !map.has(course.key)) {
        map.set(course.key, course);
      }
    });
    return Array.from(map.values());
  });
  if (notPlaced.length || shouldWarnAboutMissingImportedSession) {
    const messageParts = [`تم توزيع ${formatCourseCountLabel(placed.length)}.`];

    if (notPlaced.length) {
      messageParts.push(buildUnscheduledSummaryText(notPlaced));
    }

    if (shouldWarnAboutMissingImportedSession) {
      messageParts.push("تنبيه: تم توزيع مقررات التخصص بدون استيراد ملف الجلسة، لذا قد لا تكون مقررات الدراسات العامة أو البيانات المستوردة السابقة مضافة إلى هذا الجدول.");
    }

    showToast(
      shouldWarnAboutMissingImportedSession ? "تم توزيع مقررات التخصص مع تنبيه" : "تم توزيع مقررات التخصص مع ملاحظات",
      messageParts.join(" ").trim(),
      "warning",
      {
        persistent: true,
        actions: [
          {
            label: "عرض غير المجدول",
            onClick: () => openUnscheduledCoursesPreview(true),
          },
        ],
      }
    );
  } else {
    showToast("تم توزيع مقررات التخصص", `تم توزيع ${formatCourseCountLabel(placed.length)}.`, "success");
  }
  setCurrentStep(7);
};

const filteredScheduleForPrint = useMemo(() => {
  return schedule.filter((item) => {
    const departmentOk =
      printDepartmentFilter === "__all__" ||
      (() => {
        const target = normalizeArabic(printDepartmentFilter);
        const roots = item.departmentRoots || [];

        if (roots.includes(target)) return true;

        if (isGeneralStudiesCourse(item)) {
          return roots.some((r) => r.includes(target));
        }

        return false;
      })();

    const majorOk =
      printMajorFilter === "__all__" ||
      splitBySlash(item.major).some(
        (major) => normalizeArabic(major) === normalizeArabic(printMajorFilter)
      );

    return departmentOk && majorOk;
  });
}, [schedule, printDepartmentFilter, printMajorFilter]);
const filteredSortedCourses = useMemo(() => {
  return parsed.courses.filter((item) => {
    const departmentOk =
      printDepartmentFilter === "__all__" ||
      (item.departmentRoots || []).includes(normalizeArabic(printDepartmentFilter));

    const majorOk =
      printMajorFilter === "__all__" ||
      splitBySlash(item.major).some(
        (major) => normalizeArabic(major) === normalizeArabic(printMajorFilter)
      );

    return departmentOk && majorOk;
  });
}, [parsed.courses, printDepartmentFilter, printMajorFilter]);

const matchesPreviewFilters = (item) => {
  if (!item) return false;

  const selectedDepartmentNormalized =
    printDepartmentFilter === "__all__" ? "" : normalizeArabic(printDepartmentFilter);
  const selectedMajorNormalized =
    printMajorFilter === "__all__" ? "" : normalizeArabic(printMajorFilter);

  const departmentRoots = Array.isArray(item.departmentRoots)
    ? item.departmentRoots.map((root) => normalizeArabic(root)).filter(Boolean)
    : [];
  const departmentValues = [
    ...splitBySlash(item.department),
    ...splitBySlash(item.sectionName),
  ]
    .map((value) => normalizeArabic(value))
    .filter(Boolean);

  const majorValues = splitBySlash(item.major)
    .map((value) => normalizeArabic(value))
    .filter(Boolean);

  const departmentOk =
    printDepartmentFilter === "__all__" ||
    departmentRoots.includes(selectedDepartmentNormalized) ||
    departmentValues.includes(selectedDepartmentNormalized);

  const majorOk =
    printMajorFilter === "__all__" ||
    majorValues.includes(selectedMajorNormalized);

  return departmentOk && majorOk;
};

const filteredUnscheduledForPreview = useMemo(() => {
  return unscheduled.filter((item) => matchesPreviewFilters(item));
}, [unscheduled, printDepartmentFilter, printMajorFilter]);

const filteredHallWarningsForPreview = useMemo(() => {
  return hallWarnings.filter((item) => matchesPreviewFilters(item));
}, [hallWarnings, printDepartmentFilter, printMajorFilter]);

  const groupedSchedule = useMemo(() => {
    return filteredScheduleForPrint.reduce((acc, item) => {
      if (!acc[item.dateISO]) acc[item.dateISO] = [];
      acc[item.dateISO].push(item);
      return acc;
    }, {});
  }, [filteredScheduleForPrint]);

  const groupedScheduleEntries = useMemo(() => Object.entries(groupedSchedule), [groupedSchedule]);

  const daysPerPage = Math.max(1, groupedScheduleEntries.length || 1);
  const totalPreviewPages = 1;

  const paginatedGroupedSchedule = useMemo(() => {
    return groupedScheduleEntries;
  }, [groupedScheduleEntries]);


const studentOptionsForPrint = useMemo(() => {
  const combinedSchedule =
    schedule.length
      ? schedule
      : [...generalSchedule, ...specializedSchedule];

  const scheduledStudentIds = new Set(
    combinedSchedule.flatMap((item) => getScheduleStudentIds(item))
  );

  const selectedDepartmentNormalized =
    printDepartmentFilter === "__all__" ? "" : normalizeArabic(printDepartmentFilter);
  const selectedMajorNormalized =
    printMajorFilter === "__all__" ? "" : normalizeArabic(printMajorFilter);

  const map = new Map();

  parsed.filteredRows.forEach((row) => {
    const studentId = String(row["رقم المتدرب"] ?? "").trim();
    if (!studentId) return;

    const registrationStatus = String(row["حالة تسجيل"] ?? "").trim();
    const isDeprivedRow = isDeprivationRegistrationStatus(registrationStatus);
    if (!scheduledStudentIds.has(studentId) && !isDeprivedRow) return;

    const departments = splitBySlash(String(row["القسم"] ?? "").trim());
    const majors = splitBySlash(String(row["التخصص"] ?? "").trim());

    const matchesDepartment =
      printDepartmentFilter === "__all__" ||
      departments.some((dep) => normalizeArabic(dep) === selectedDepartmentNormalized);

    const matchesMajor =
      printMajorFilter === "__all__" ||
      majors.some((major) => normalizeArabic(major) === selectedMajorNormalized);

    if (!matchesDepartment || !matchesMajor) return;

    const info = preciseStudentInfoMap.get(studentId) || {
      id: studentId,
      name: getStudentNameFromRow(row) || "بدون اسم",
      department: String(row["القسم"] ?? "").trim() || "-",
      major: String(row["التخصص"] ?? "").trim() || "-",
    };

    if (!map.has(studentId)) {
      map.set(studentId, {
        id: studentId,
        name: info.name,
        department: info.department,
        major: info.major,
        label: `${info.name || "بدون اسم"} - ${studentId}`,
      });
    }
  });

  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "ar"));
}, [
  parsed.filteredRows,
  schedule,
  generalSchedule,
  specializedSchedule,
  preciseStudentInfoMap,
  printDepartmentFilter,
  printMajorFilter,
]);


  useEffect(() => {
    setSelectedStudentIdForPrint("");
    setStudentSearchText("");
    setShowStudentSuggestions(false);
  }, [printDepartmentFilter, printMajorFilter]);

  const selectedStudentInfoForPrint = useMemo(
    () => studentOptionsForPrint.find((student) => student.id === selectedStudentIdForPrint) || null,
    [studentOptionsForPrint, selectedStudentIdForPrint]
  );




const selectedStudentScheduleForPrint = useMemo(() => {
  if (!selectedStudentIdForPrint) return [];

  const combinedSchedule =
    schedule.length
      ? schedule
      : [...generalSchedule, ...specializedSchedule];

  return buildStudentScheduleEntries({
    rows: parsed.filteredRows,
    combinedSchedule,
    studentId: selectedStudentIdForPrint,
    deprivationMap: deprivedCourseStudentStatusMap,
  });
}, [
  schedule,
  generalSchedule,
  specializedSchedule,
  parsed.filteredRows,
  selectedStudentIdForPrint,
  deprivedCourseStudentStatusMap,
]);

  const combinedScheduleForStudents = useMemo(() => (
    schedule.length ? schedule : [...generalSchedule, ...specializedSchedule]
  ), [schedule, generalSchedule, specializedSchedule]);

  const studentPortalOptions = useMemo(() => {
    const scheduledIds = new Set(
      combinedScheduleForStudents.flatMap((item) => getScheduleStudentIds(item))
    );

    const map = new Map();

    parsed.filteredRows.forEach((row) => {
      const studentId = String(row["رقم المتدرب"] ?? "").trim();
      if (!studentId) return;

      const registrationStatus = String(row["حالة تسجيل"] ?? "").trim();
      const isDeprivedRow = isDeprivationRegistrationStatus(registrationStatus);
      if (!scheduledIds.has(studentId) && !isDeprivedRow) return;

      const info = preciseStudentInfoMap.get(studentId) || {
        id: studentId,
        name: getStudentNameFromRow(row) || "بدون اسم",
        department: String(row["القسم"] ?? "").trim() || "-",
        major: String(row["التخصص"] ?? "").trim() || "-",
      };

      if (!map.has(studentId)) {
        map.set(studentId, {
          id: studentId,
          name: info.name,
          department: info.department,
          major: info.major,
          label: `${info.name || "بدون اسم"} - ${studentId}`,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "ar"));
  }, [combinedScheduleForStudents, parsed.filteredRows, preciseStudentInfoMap]);

  const selectedStudentInfoForPortal = useMemo(
    () => studentPortalOptions.find((student) => student.id === selectedStudentIdForPrint) || null,
    [studentPortalOptions, selectedStudentIdForPrint]
  );

  const selectedStudentScheduleForPortal = useMemo(() => {
    if (!selectedStudentIdForPrint) return [];

    return buildStudentScheduleEntries({
      rows: parsed.filteredRows,
      combinedSchedule: combinedScheduleForStudents,
      studentId: selectedStudentIdForPrint,
      deprivationMap: deprivedCourseStudentStatusMap,
    });
  }, [combinedScheduleForStudents, parsed.filteredRows, selectedStudentIdForPrint, deprivedCourseStudentStatusMap]);

const invigilatorTable = useMemo(() => {
  const table = new Map();

  filteredScheduleForPrint.forEach((item) => {
    const resolvedExamHall =
      String(item.examHall || "").trim() ||
      (Array.isArray(item.examHallAssignments) && item.examHallAssignments.length
        ? item.examHallAssignments
            .map((entry) => entry.hallName || entry.name || "")
            .filter(Boolean)
            .join(" + ")
        : "");

    (item.invigilators || []).forEach((name) => {
      if (!table.has(name)) table.set(name, []);
      table.get(name).push({
        dateISO: item.dateISO,
        dayName: item.dayName,
        period: item.period,
        timeText: item.timeText,
        courseName: item.courseName,
        courseCode: item.courseCode,
        gregorian: item.gregorian,
        examHall: resolvedExamHall,
      });
    });
  });

  return Array.from(table.entries())
    .map(([name, items]) => ({
      name,
      periodsCount: items.length,
      items: items.sort((a, b) => a.dateISO.localeCompare(b.dateISO) || a.period - b.period),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
}, [filteredScheduleForPrint]);

  const availableInvigilators = useMemo(() => {
    const baseInvigilators = manualInvigilators
      ? manualInvigilators.split("\n").map((name) => name.trim()).filter(Boolean)
      : parsed.invigilators;

    return Array.from(
      new Set(
        baseInvigilators.filter((name) => {
          const normalizedName = normalizeArabic(name);

          if (
            !includeAllDepartmentsAndMajors &&
            excludedInvigilatorsForSelectedDepartments.has(normalizedName)
          ) {
            return false;
          }

          return true;
        })
      )
    ).sort((a, b) => a.localeCompare(b, "ar"));
  }, [
    manualInvigilators,
    parsed.invigilators,
    includeAllDepartmentsAndMajors,
    excludedInvigilatorsForSelectedDepartments,
  ]);

  const departmentTrainerNamesByCourseKey = useMemo(() => {
    const splitTrainerNames = (trainerText) =>
      String(trainerText || "")
        .split("/")
        .map((name) => name.trim())
        .filter(Boolean);

    const normalizeTokens = (value) =>
      splitBySlash(String(value || "").trim())
        .map((item) => normalizeArabic(item))
        .filter(Boolean);

    const normalizedAvailableInvigilators = new Set(
      availableInvigilators.map((name) => normalizeArabic(name))
    );

    const generalCourseKeys = new Set(
      parsed.courses.filter((course) => isGeneralStudiesCourse(course)).map((course) => course.key)
    );

    const generalStudiesTrainerNames = Array.from(
      new Set(
        (parsed.filteredRows || [])
          .filter((row) => {
            const rowKey = [
              normalizeArabic(String(row["المقرر"] ?? "").trim()),
              normalizeArabic(String(row["اسم المقرر"] ?? "").trim()),
            ].join("|");
            return generalCourseKeys.has(rowKey);
          })
          .flatMap((row) => splitTrainerNames(row["المدرب"]))
      )
    );

    const result = {};

    parsed.courses.forEach((course) => {
      let trainerNames = [];

      if (isGeneralStudiesCourse(course)) {
        trainerNames = generalStudiesTrainerNames;
      } else {
        const courseDepartments = new Set(
          normalizeTokens(course.department).filter(
            (token) => token !== normalizeArabic("الدراسات العامة")
          )
        );
        const courseMajors = new Set(normalizeTokens(course.major));

        trainerNames = Array.from(
          new Set(
            (parsed.filteredRows || [])
              .filter((row) => {
                const rowDepartments = normalizeTokens(row["القسم"]);
                const rowMajors = normalizeTokens(row["التخصص"]);

                const departmentMatches = rowDepartments.some((dep) => courseDepartments.has(dep));
                if (!departmentMatches) return false;

                if (!courseMajors.size) return true;
                return rowMajors.some((major) => courseMajors.has(major));
              })
              .flatMap((row) => splitTrainerNames(row["المدرب"]))
          )
        );
      }

      result[course.key] = trainerNames.filter((name) =>
        normalizedAvailableInvigilators.has(normalizeArabic(name))
      );
    });

    return result;
  }, [parsed.courses, parsed.filteredRows, availableInvigilators]);

  const availableDepartmentsForPrint = useMemo(() => {
    const map = new Map();

    schedule
      .filter((item) => !isGeneralStudiesCourse(item))
      .forEach((item) => {
        splitBySlash(item.department).forEach((department) => {
          const clean = String(department || "").trim();
          const normalized = normalizeArabic(clean);

          if (!clean) return;
          if (normalized === normalizeArabic("الدراسات العامة")) return;

          if (!map.has(normalized)) {
            map.set(normalized, clean);
          }
        });
      });

    return Array.from(map.values()).sort((a, b) => a.localeCompare(b, "ar"));
  }, [schedule]);
const availableMajorsForPrint = useMemo(() => {
  const map = new Map();
  const targetDepartment = normalizeArabic(printDepartmentFilter);

  parsed.filteredRows.forEach((row) => {
    const departments = splitBySlash(String(row["القسم"] ?? "").trim());
    const majors = splitBySlash(String(row["التخصص"] ?? "").trim());

    const departmentMatches =
      printDepartmentFilter === "__all__" ||
      departments.some((department) => normalizeArabic(department) === targetDepartment);

    if (!departmentMatches) return;

    majors.forEach((major) => {
      const clean = String(major || "").trim();
      const normalized = normalizeArabic(clean);

      if (!clean) return;
      if (normalized === normalizeArabic("الدراسات العامة")) return;

      if (!map.has(normalized)) {
        map.set(normalized, clean);
      }
    });
  });

  return Array.from(map.values()).sort((a, b) => a.localeCompare(b, "ar"));
}, [parsed.filteredRows, printDepartmentFilter]);
  
  const toggleExcludedInvigilator = (name) => {
    setExcludedInvigilators((prev) =>
      prev.some((item) => normalizeArabic(item) === normalizeArabic(name))
        ? prev.filter((item) => normalizeArabic(item) !== normalizeArabic(name))
        : [...prev, name]
    );
  };

  const toggleExcludedCourse = (courseKey) => {
    setExcludedCourses((prev) => {
      const nextExcluded = prev.includes(courseKey)
        ? prev.filter((item) => item !== courseKey)
        : [...prev, courseKey];
      return nextExcluded;
    });

    setCourseLevels((prev) => {
      const next = { ...prev };
      delete next[courseKey];
      return next;
    });
  };

  const setCourseLevel = (courseKey, level) => {
    setCourseLevels((prev) => ({ ...prev, [courseKey]: level }));
  };

  const clearCourseLevel = (courseKey) => {
    setCourseLevels((prev) => {
      const next = { ...prev };
      delete next[courseKey];
      return next;
    });
  };

  const exportMainSchedule = () => {
    if (!filteredScheduleForPrint.length) {
      return showToast("لا يوجد جدول", "أنشئ الجدول أولًا أو غيّر فلتر القسم ثم أعد المحاولة.", "error");
    }

    const exportRows = filteredScheduleForPrint.map((item) => ({
      الوحدة: parsed.collegeName,
      القسم: item.department,
      التخصص: item.major,
      الشعبة: item.sectionName,
      التاريخ_الميلادي: item.gregorian,
      التاريخ_الهجري: item.hijri,
      اليوم: item.dayName,
      الفترة: item.period,
      الوقت: item.timeText,
      المقرر: item.courseCode,
      اسم_المقرر: item.courseName,
      مقر_الاختبار: item.examHall,
      المدربون: item.trainerText,
      عدد_المتدربين: item.studentCount,
      المراقبون: (item.invigilators || []).join(" | "),
    }));

    const suffix =
      printDepartmentFilter === "__all__"
        ? "all-departments"
        : normalizeArabic(printDepartmentFilter).replace(/\s+/g, "-");

    const collegeLabel = sanitizeDownloadFilename(collegeNameInput || "الكلية التقنية", "الكلية التقنية");
    const dateStamp = getTodayFileStamp();

    downloadFile(
      `ملف الاختبارات النهائية - ${collegeLabel} - ${dateStamp}.csv`,
      rowsToCsv(exportRows),
      "text/csv;charset=utf-8"
    );

    showToast("تم التصدير", "تم تنزيل جدول الاختبارات حسب القسم المختار.", "success");
  };

  const exportInvigilatorsTable = () => {
    if (!invigilatorTable.length) {
      return showToast("لا يوجد توزيع", "أنشئ الجدول أولًا أو غيّر فلتر القسم ثم أعد المحاولة.", "error");
    }

    const rowsToExport = invigilatorTable.flatMap((inv) =>
      inv.items.map((item) => ({
        المراقب: inv.name,
        التاريخ_الميلادي: item.gregorian,
        اليوم: item.dayName,
        الفترة: item.period,
        الوقت: item.timeText,
        المقرر: item.courseName,
        رمز_المقرر: item.courseCode,
      }))
    );

    downloadFile("invigilators-periods.csv", rowsToCsv(rowsToExport), "text/csv;charset=utf-8");
    showToast("تم التصدير", "تم تنزيل جدول المراقبين والفترات.", "success");
  };


const floatingBtn = ({ danger = false } = {}) => ({
  background: danger ? COLORS.danger : COLORS.primaryDark,
  color: "#fff",
  border: "none",
  borderRadius: 999,
  padding: "10px 14px",
  fontWeight: 800,
  cursor: "pointer",
  boxShadow: "0 8px 20px rgba(0,0,0,0.2)",
});

  const stats = {
    rows: rows.length,
    students: parsed.studentsCount,
    courses: parsed.courses.length,
    generalCourses: generalCourses.length,
    specializedCourses: specializedCourses.length,
    invigilators: parsed.invigilators.length,
  };
const headerBtn = (danger = false) => ({
  padding: "8px 14px",
  borderRadius: 10,
  border: "none",
  background: danger ? "#DC2626" : "rgba(255,255,255,0.15)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  backdropFilter: "blur(6px)",
  transition: "0.2s",
});
  return (
    <div
      ref={topRef}
      style={{
        minHeight: "100vh",
        background: `linear-gradient(135deg, ${COLORS.bg1} 0%, ${COLORS.bg2} 35%, ${COLORS.bg3} 100%)`,
        padding: "24px 16px 60px",
        direction: "rtl",
        fontFamily: "Cairo, Tahoma, Arial, sans-serif",
        color: COLORS.text,
      }}
    >
      <Toast
        item={toast}
        onClose={() => {
          if (toast?.action === "restore_session") {
            pendingRestoreRef.current = null;
            setPendingRestore(null);
            setDidRestore(true);
          }
          setToast(null);
        }}
        onRestore={restoreSavedSession}
      />

{/* الهيدر*/}

      <div
  style={{
    position: "relative",
    overflow: "hidden",
    borderRadius: 32,
    boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
    border: "1px solid rgba(168,221,218,0.9)",
    marginBottom: 10,
    background: "#fff",
  }}
>
  {/* ===== الشريط العلوي ===== */}
  <div
    style={{
      background: "#0E2730",
      color: "#D7F6F1",
      padding: "10px 18px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      flexWrap: "wrap",
      fontSize: 13,
    }}
  >
    <span>📅 {new Date().toLocaleDateString("ar-SA")}</span>
    <span>المؤسسة العامة للتدريب التقني والمهني</span>
    <span>لوحة التحكم</span>
  </div>

  {/* ===== الهيدر الرئيسي ===== */}
  <div
    style={{
      position: "relative",
      padding: "32px 28px",
      background: "linear-gradient(135deg, #0F5F68 0%, #148C93 40%, #1FA7A8 72%, #74D3CB 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 24,
      flexWrap: "wrap",
      flexDirection: "row-reverse",
    }}
  >
    {/* Glow */}
    <div
      style={{
        position: "absolute",
        inset: 0,
        background:
          "radial-gradient(circle at top left, rgba(255,255,255,0.18), transparent 20%), radial-gradient(circle at bottom right, rgba(255,255,255,0.10), transparent 26%)",
        pointerEvents: "none",
      }}
    />

    {/* ===== الشعار ===== */}
    <div
      style={{
        width: 150,
        height: 150,
        borderRadius: 30,
        background: "rgba(255,255,255,0.15)",
        border: "1px solid rgba(255,255,255,0.25)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(10px)",
        flexShrink: 0,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15)",
        position: "relative",
        zIndex: 1,
      }}
    >    
      <img
        src={LOGO_SRC}
        alt="TVTC Logo"
        style={{ width: 130, height: 130, objectFit: "contain" }}
      />
    </div>

    {/* التعرف التلقائي
   <div
  style={{
    maxWidth: 150,
    minWidth: 150,
    minHeight: 150,
    display: "inline",
    background: "rgba(255,255,255,0.15)",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
  }}
>

    
  {effectiveCollegeLocation ? (
    <div style={{ color: COLORS.success, fontWeight: 700, marginBottom: 8 }}>
      تم التعرف على الوحدة: {effectiveCollegeLocation}
      {effectiveCollegeSlug ? ` (${effectiveCollegeSlug})` : ""}
    </div>
  ) : (
    <div style={{ color: COLORS.warning, fontWeight: 700, marginBottom: 8 }}>
      تعذر التعرف على الوحدة تلقائيًا. اختر المدينة يدويًا.
    </div>
  )}

  {!detectedCollegeLocation && (
    <select
      value={manualCollegeLocation}
      onChange={(e) => setManualCollegeLocation(e.target.value)}
      style={fieldStyle()}
    >
      <option value="">اختر المدينة</option>
      {allCollegeLocations.map((location) => (
        <option key={location} value={location}>
          {location}
        </option>
      ))}
    </select>
  )}

  {detectedCollegeLocation && (
    <div style={{ marginTop: 10 }}>
      <button
        type="button"
        onClick={() => setManualCollegeLocation("")}
        style={cardButtonStyle()}
      >
        استخدام التعرف التلقائي
      </button>
    </div>
  )}
</div>
 */}
    
    {/* ===== النص ===== */}
    <div
      style={{
        flex: 1,
        minWidth: 260,
        position: "relative",
        zIndex: 1,
        textAlign: "right",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 16px",
          borderRadius: 999,
          background: "rgba(255,255,255,0.15)",
          color: "#fff",
          fontSize: 13,
          fontWeight: 700,
          marginBottom: 14,
          border: "1px solid rgba(255,255,255,0.2)",
        }}
      >
        <span>لوحة التحكم</span>
        <span style={{ opacity: 0.7 }}>•</span>
        <span>إدارة الاختبارات النهائية</span>
      </div>

      <h1
        style={{
          margin: 0,
          color: "#fff",
          fontSize: "clamp(30px, 4vw, 42px)",
          fontWeight: 900,
        }}
      >
         منصة إدارة جداول الاختبارات النهائية
      </h1>

      <p
        style={{
          marginTop: 10,
          color: "rgba(255,255,255,0.95)",
          fontSize: 15,
          lineHeight: 1.9,
          maxWidth: 720,
        }}
      >
        نظام احترافي لإنشاء جداول الاختبارات النهائية وتوزيع القاعات
        والمراقبين، مع أدوات متقدمة للمعاينة والطباعة والتصدير.
      </p>
    </div>

    {/* ===== الأزرار (Premium) ===== */}
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        maxWidth: 200,
        alignItems: "stretch",
        position: "relative",
        zIndex: 1,
      }}
    >
      <button
        onClick={exportSavedSession}
        style={{
          padding: "10px 14px",
          borderRadius: 12,
          border: "none",
          fontWeight: 700,
          cursor: "pointer",
          background: "#ffffff",
          color: "#0F5F68",
        }}
      >
         تصدير البيانات
      </button>

      <button
        onClick={() => importSessionRef.current?.click()}
        style={{
          padding: "10px 14px",
          borderRadius: 12,
          border: "none",
          fontWeight: 700,
          cursor: "pointer",
          background: "rgba(255,255,255,0.2)",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.3)",
        }}
      >
         استيراد البيانات
      </button>

      <button
        onClick={clearSavedState}
        style={{
          padding: "10px 14px",
          borderRadius: 12,
          border: "none",
          fontWeight: 700,
          cursor: "pointer",
          background: "rgba(0,0,0,0.25)",
          color: "#fff",
        }}
      >
         حذف البيانات المحلية
      </button>
    </div>
  </div>
</div>

  {/* input مخفي */}
  <input
    ref={importSessionRef}
    type="file"
    accept=".json,application/json"
    style={{ display: "none" }}
    onChange={(e) => importSavedSession(e.target.files?.[0])}
  />


            <div
          style={{
          display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, max-content))",
            flexWrap: "wrap",
          
    gap: 20,
            padding: 25,
    marginTop: 10,
    
           
          }}
        >
          <StatBox label="السجلات" value={stats.rows} />
          <StatBox label="عدد المتدربين" value={stats.students} />
          <StatBox label="عدد المقررات" value={stats.courses} />
          <StatBox label="الدراسات العامة" value={stats.generalCourses} />
          <StatBox label="مقررات التخصص" value={stats.specializedCourses} />
          <StatBox label="المراقبون" value={stats.invigilators} />
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10, marginBottom: 20 }}>
          {[
  { id: 1, label: "1. رفع الملف والتفضيلات" },
  { id: 2, label: "2. الخصائص العامة" },
  { id: 3, label: "3. المقررات" },
  { id: 4, label: "4. المراقبون" },
  { id: 5, label: "5. مقررات الدراسات العامة" },
  { id: 6, label: "6. مقررات التخصص" },
  { id: 7, label: "7. تحليل تعارض مقررين" },
  { id: 8, label: "8. التعديل اليدوي" },
  { id: 9, label: "9. المعاينة" },
  { id: 10, label: "10. الطباعة" },
  { id: 11, label: "11. التصدير وبوابة المتدربين" },
].map((step) => {
            const isLockedGeneralStudies = step.id === 5 && lockGeneralStudiesStep;

            return (
              <StepButton
                key={step.id}
                active={currentStep === step.id}
                done={currentStep > step.id}
                onClick={() => {
                  if (isLockedGeneralStudies) return;
                  setCurrentStep(step.id);
                }}
              >
                {isLockedGeneralStudies ? `${step.label} 🔒` : step.label}
              </StepButton>
            );
          })}
        </div>
        <div
          style={{
            opacity: pageVisible ? 1 : 0,
            transform: pageVisible ? "translateY(0)" : "translateY(10px)",
            transition: "opacity 220ms ease, transform 220ms ease",
          }}
        >
        {currentStep === 1 && (
          <Card>
            <SectionHeader
              title="رفع الملف والتفضيلات"
              description="ارفع تقرير SF01 أولًا، ثم فعّل فقط التفضيلات العامة التي تحتاجها. عند إلغاء أي خيار سيتم إخفاء إعداداته التفصيلية من الصفحات التالية لتبقى الواجهة أخف وأوضح."
            />

            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                handleUpload(e.dataTransfer.files?.[0]);
              }}
              style={{
                marginTop: 4,
                borderRadius: 26,
                border: `2px dashed ${dragActive ? COLORS.primaryDark : COLORS.primaryBorder}`,
                background: dragActive ? "linear-gradient(135deg, #E7F8F7 0%, #F7FBFB 100%)" : "linear-gradient(135deg, #FCFFFF 0%, #F7FBFB 100%)",
                minHeight: 160,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                textAlign: "center",
                cursor: "pointer",
                padding: "28px 20px",
                boxShadow: dragActive ? "0 16px 36px rgba(20,123,131,0.10)" : "inset 0 1px 0 rgba(255,255,255,0.7)",
                transition: "all 180ms ease",
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: "none" }}
                onChange={(e) => handleUpload(e.target.files?.[0])}
              />
              <div style={{ fontSize: 22, fontWeight: 900, color: COLORS.charcoal }}>
                رفع تقرير SF01
              </div>
              <div style={{ marginTop: 8, fontSize: 14, color: COLORS.muted, lineHeight: 1.9, maxWidth: 620 }}>
                اسحب التقرير هنا أو اضغط للاختيار من جهازك. يدعم النظام ملفات CSV ويقرأ بيانات الوحدة تلقائيًا عند توفرها.
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16, justifyContent: "center" }}>
                <span style={{ background: "#fff", border: `1px solid ${COLORS.border}`, color: COLORS.charcoalSoft, padding: "8px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700 }}>
                  CSV فقط
                </span>
                <span style={{ background: "#fff", border: `1px solid ${COLORS.border}`, color: COLORS.charcoalSoft, padding: "8px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700 }}>
                  سحب وإفلات أو اختيار يدوي
                </span>
              </div>
              {fileName ? (
                <div style={{ marginTop: 16, background: COLORS.primaryDark, color: "#fff", padding: "10px 16px", borderRadius: 999, fontWeight: 800, maxWidth: "100%", wordBreak: "break-word" }}>
                  الملف الحالي: {fileName}
                </div>
              ) : null}
            </div>

            {parsed.missingColumns.length ? (
              <div style={{ marginTop: 14, borderRadius: 18, padding: 14, background: COLORS.dangerBg, border: "1px solid #FECACA", color: COLORS.danger }}>
                الأعمدة الناقصة: {parsed.missingColumns.join("، ")}
              </div>
            ) : null}

            <div style={{ marginTop: 22 }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: COLORS.charcoal, marginBottom: 8 }}>التفضيلات العامة للمستخدم</div>
              <div style={{ color: COLORS.muted, lineHeight: 1.9, marginBottom: 14 }}>
                فعّل فقط الخصائص التي تحتاجها. عند إلغاء أي خيار سيتم إخفاء بطاقته التفصيلية من الصفحات التالية حتى لا تتكدس الواجهة على المستخدم.
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(490px, 1fr))",
                  gap: 12,
                  width: "100%",
                  maxWidth: 920,
                }}
              >
                {[
                  {
                    key: "hall",
                    title: "تفضيل أو قصر القاعات لمقرر أو قسم معيّن / تفعيل أو إلغاء تقسيم المقرر بين أكثر من قاعة",
                    tooltip: "يُظهر إعدادات تخصيص القاعات على مستوى المقرر أو القسم، وكذلك خيار تقسيم المقرر بين أكثر من قاعة عند الحاجة.",
                    checked: showHallConstraintPreferences,
                    onChange: setShowHallConstraintPreferences,
                  },
                  {
                    key: "exclude",
                    title: "استبعاد مقررات من الجدول",
                    tooltip: "يُظهر بطاقة استبعاد المقررات من الجدول. المقررات العملية مستبعدة افتراضيًا حسب منطق النظام الحالي إن كانت معرفة في البيانات.",
                    checked: showCourseExclusionsPreference,
                    onChange: setShowCourseExclusionsPreference,
                  },
                  {
                    key: "sep",
                    title: "فصل أيام الدراسات العامة عن التخصص",
                    tooltip: "يُظهر إعدادات الفصل بين أيام مقررات الدراسات العامة وأيام مقررات التخصص لتخفيف الضغط على المتدربين.",
                    checked: showGeneralSpecializedSeparationPreference,
                    onChange: setShowGeneralSpecializedSeparationPreference,
                  },
                  {
                    key: "same",
                    title: "محاولة إدراج مقررات محددة في نفس الفترة",
                    tooltip: "يُظهر بطاقة ربط بعض المقررات في نفس الفترة حسب الإمكان مع مراعاة التعارضات والقيود الأخرى.",
                    checked: showSamePeriodPreference,
                    onChange: setShowSamePeriodPreference,
                  },
                  {
                    key: "time",
                    title: "تفضيل/تجنب يوم أو فترة للمقرر (حسب الإمكان)",
                    tooltip: "يُظهر بطاقة تحديد الأيام أو الفترات المفضلة أو غير المفضلة لبعض المقررات، ويطبقها النظام بمرونة قدر الإمكان.",
                    checked: showCourseTimePreference,
                    onChange: setShowCourseTimePreference,
                  },
                  {
                    key: "level",
                    title: "تجنب وضع مقررات من المستوى نفسه في نفس اليوم",
                    tooltip: "يُظهر إعدادات تحديد مستويات المقررات حتى يحاول النظام عدم جمع مقررات المستوى نفسه في يوم واحد.",
                    checked: showAvoidSameLevelSameDayPreference,
                    onChange: setShowAvoidSameLevelSameDayPreference,
                  },
                  {
                    key: "inv",
                    title: "تفضيل / منع / قصر مراقبين لمقرر معيّن",
                    tooltip: "يُظهر بطاقة تخصيص المراقبين على مستوى المقرر، سواء بالتفضيل أو المنع أو القصر على أسماء محددة.",
                    checked: showInvigilatorConstraintPreference,
                    onChange: setShowInvigilatorConstraintPreference,
                  },
                ].map((item) => (
                  <div
                    key={item.key}
                    style={{
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 20,
                      padding: 16,
                      background: "#fff",
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      gap: 14,
                      alignItems: "center",
                    }}
                  >
                    <div style={{ minWidth: 0, display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 800, color: COLORS.charcoal, lineHeight: 1.9, wordBreak: "break-word" }}>
                          {item.title}
                        </div>
                      </div>
                      <TooltipIcon text={item.tooltip} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, justifySelf: "end" }}>
                      <span style={{ color: item.checked ? COLORS.primaryDark : COLORS.muted, fontWeight: 800, minWidth: 44 }}>
                        {item.checked ? "مفعّل" : "معطّل"}
                      </span>
                      <Switch checked={item.checked} onChange={item.onChange} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
              <button onClick={() => setCurrentStep(2)} disabled={!rows.length} style={cardButtonStyle({ active: true, disabled: !rows.length })}>
                التالي: الخصائص العامة
              </button>
            </div>
          </Card>
        )}

        {currentStep === 2 && (
          <Card>
            <SectionHeader
              title="الخصائص العامة"
              description="هذه الصفحة مخصصة للإعدادات العامة الأساسية للجدولة مثل البيانات العامة والفترات والقاعات."
            />


            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 14,
                marginTop: 18,
              }}
            >
              <div>
                <div style={{ marginBottom: 8, fontWeight: 800 }}>اسم الوحدة (يمكن تعديله)</div>
                <input
                  value={collegeNameInput}
                  onChange={(e) => setCollegeNameInput(e.target.value)}
                  style={fieldStyle()}
                  placeholder="اكتب اسم الوحدة"
                />
              </div>

              <div>
                <div style={{ marginBottom: 8, fontWeight: 800 }}>تاريخ البداية</div>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={fieldStyle()} />
              </div>

              <div>
                <div style={{ marginBottom: 8, fontWeight: 800 }}>عدد أيام الاختبارات</div>
                <input
                  type="number"
                  min="1"
                  max="15"
                  value={numberOfDays}
                  onChange={(e) => setNumberOfDays(safeNum(e.target.value, 8))}
                  style={fieldStyle()}
                />
              </div>

              <div>
                <div style={{ marginBottom: 8, fontWeight: 800 }}>الحد الأقصى لاختبارات المتدرب في اليوم</div>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={maxExamsPerStudentPerDay}
                  onChange={(e) => setMaxExamsPerStudentPerDay(Math.max(1, safeNum(e.target.value, 2)))}
                  style={fieldStyle()}
                />
              </div>
            </div>


                        <div style={{ marginTop: 18 }}>
              <div style={{ marginBottom: 10, fontWeight: 800 }}>فترات الاختبار</div>
              <div style={{ display: "grid", gap: 10, maxWidth: 640 }}>
                {periodConfigs.map((periodConfig, index) => {
                  const startMinutes = parseTimeToMinutes(periodConfig.start);
                  const endText =
                    periodConfig.enabled === false || startMinutes === null
                      ? "--:--"
                      : minutesToTimeText(startMinutes + Number(periodConfig.duration || 0));
                  const isRequired = index === 0;

                  return (
                    <div
                      key={`period-config-${index}`}
                      style={{
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: 14,
                        padding: 10,
                        background: periodConfig.enabled ? "#fff" : COLORS.bg2,
                        display: "grid",
                        gridTemplateColumns: "120px minmax(110px, 150px) minmax(110px, 150px) minmax(90px, 120px)",
                        gap: 8,
                        alignItems: "end",
                        maxWidth: 640,
                        opacity: periodConfig.enabled ? 1 : 0.78,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800, color: COLORS.charcoal, marginBottom: 8 }}>
                          الفترة {index + 1}
                        </div>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: isRequired ? COLORS.muted : COLORS.text }}>
                          <input
                            type="checkbox"
                            checked={isRequired ? true : periodConfig.enabled !== false}
                            disabled={isRequired}
                            onChange={(e) => updatePeriodConfig(index, { enabled: e.target.checked })}
                          />
                          {isRequired ? "إلزامية" : "تفعيل الفترة"}
                        </label>
                      </div>

                      <div>
                        <div style={{ marginBottom: 6, fontWeight: 700, fontSize: 13 }}>البداية</div>
                        <select
                          value={periodConfig.start}
                          disabled={periodConfig.enabled === false}
                          onChange={(e) => updatePeriodConfig(index, { start: e.target.value })}
                          style={{ ...fieldStyle(), padding: "10px 12px", borderRadius: 12, fontSize: 14 }}
                        >
                          {PERIOD_TIME_OPTIONS.map((timeValue) => (
                            <option key={timeValue} value={timeValue}>
                              {timeValue}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <div style={{ marginBottom: 6, fontWeight: 700, fontSize: 13 }}>المدة</div>
                        <select
                          value={periodConfig.duration}
                          disabled={periodConfig.enabled === false}
                          onChange={(e) => updatePeriodConfig(index, { duration: Number(e.target.value) })}
                          style={{ ...fieldStyle(), padding: "10px 12px", borderRadius: 12, fontSize: 14 }}
                        >
                          {PERIOD_DURATION_OPTIONS.map((durationValue) => (
                            <option key={durationValue} value={durationValue}>
                              {durationValue} د
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <div style={{ marginBottom: 6, fontWeight: 700, fontSize: 13 }}>النهاية</div>
                        <div
                          style={{
                            ...fieldStyle(),
                            padding: "10px 12px",
                            borderRadius: 12,
                            background: COLORS.bg2,
                            fontWeight: 800,
                            color: COLORS.primaryDark,
                            fontSize: 14,
                            textAlign: "center",
                          }}
                        >
                          {endText}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: 8, color: COLORS.muted, fontSize: 13, maxWidth: 640 }}>
                الفترة الأولى إلزامية، ويمكنك إيقاف الفترة الثانية أو الثالثة عند عدم الحاجة. المدة المسموحة من ساعة إلى ثلاث ساعات.
              </div>

              {periodOverlapWarning ? (
                <div
                  style={{
                    marginTop: 10,
                    border: `1px solid #FECACA`,
                    background: COLORS.dangerBg,
                    color: COLORS.danger,
                    borderRadius: 14,
                    padding: "10px 12px",
                    fontWeight: 700,
                  }}
                >
                  {periodOverlapWarning}
                </div>
              ) : null}
            </div>

            <div style={{ marginTop: 18, maxWidth: 640 }}>
            <Card style={{maxWidth: 640 }}>
  <SectionHeader
    title="قاعات الاختبار"
    description="أضف القاعات وحدد الأقسام المسموح لها لكل قاعة. ويمكنك تفعيل خيار مشاركة القاعة لبعض القاعات فقط إذا كانت سعتها تسمح بأكثر من مقرر في نفس الفترة، علمًا بأنه لا يمكن توزيع المقررات دون إضافة قاعات."
  />

  <div style={{ display: "grid", gap: 14 }}>
    {examHalls.map((hall, index) => (
      <div
        key={hall.id}
        style={{
          border: `1px solid ${COLORS.border}`,
          borderRadius: 18,
          padding: 14,
          background: "#fff",
          maxWidth: 640,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontWeight: 900, color: COLORS.charcoal }}>
            القاعة {index + 1}
          </div>

         
        </div>

        <div
          style={{
            display: "flex",
            gridTemplateColumns: "1fr 110px",
            gap: 12,
          }}
        >
          <input
            value={hall.name}
            onChange={(e) => updateExamHall(hall.id, { name: e.target.value })}
            placeholder="اسم القاعة"
                      style={{
            ...fieldStyle(),
            width: "100%",
            fontWeight: 600,maxWidth: 310,}}
          />

          <input
            type="number"
            min="1"
            value={hall.capacity}
            onChange={(e) =>
              updateExamHall(hall.id, { capacity: e.target.value })
            }
            placeholder="السعة"
             style={{
            ...fieldStyle(),
            width: "100%",
            textAlign: "center",
            fontWeight: 800,
              maxWidth: 110,
          }}
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <button
            type="button"
            onClick={() => removeExamHall(hall.id)}
            style={{
              ...cardButtonStyle({ danger: true }),
              marginInlineStart: 0,
            }}
          >
            حذف القاعة
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontWeight: 800,
                color: COLORS.charcoal,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={!!hall.allowSharedAssignments}
                onChange={(e) =>
                  updateExamHall(hall.id, {
                    allowSharedAssignments: e.target.checked,
                  })
                }
              />
              السماح بإسناد أكثر من مقرر لهذه القاعة
            </label>

            <div
              title="عند تفعيل هذا الخيار يمكن إسناد أكثر من مقرر لنفس القاعة في نفس الفترة، بشرط أن يكون مجموع عدد المتدربين أقل من سعة القاعة. مثال: قاعة سعتها 100 يمكن أن تحتوي مقررين عددهم 40 و50."
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "#EEF6F6",
                border: "1px solid #A8DDDA",
                color: "#0E2730",
                fontWeight: 900,
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "help",
                userSelect: "none",
              }}
            >
              ?
            </div>
          </div>
        </div>

      </div>
    ))}

    <div>
      <button
        type="button"
        onClick={addExamHall}
        style={cardButtonStyle({ active: true })}
      >
        + إضافة قاعة
      </button>
    </div>
  </div>
</Card>
            </div>

            {showHallConstraintPreferences ? (
            <div style={{ marginTop: 18, maxWidth: 640 }}>
              <Card>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>تفضيل أو قصر القاعات لمقرر أو قسم معيّن</div>
                <div style={{ color: COLORS.muted, lineHeight: 1.9, marginBottom: 14 }}>
                  يمكنك هنا تحديد قاعات مفضلة لمقرر أو قسم معيّن، أو قصره على قاعات محددة فقط. هذا الخيار اختياري ويطبّق أثناء اختيار القاعة للمقرر أو القسم.
                </div>

                <div style={{ display: "grid", gap: 16, marginBottom: 14 }}>
                  <div
                    style={{
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 18,
                      padding: 14,
                      background: "#fff",
                    }}
                  >
                    <div style={{ fontWeight: 800, marginBottom: 10 }}>إضافة تخصيص على مستوى المقرر</div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <div style={{ flex: "0 1 340px", minWidth: 200 }}>
                        <select
                          value={hallConstraintOptions.some((course) => course.key === selectedHallConstraintCourseKey) ? selectedHallConstraintCourseKey : ""}
                          onChange={(e) => setSelectedHallConstraintCourseKey(e.target.value)}
                          style={{ ...fieldStyle(), maxWidth: 340 }}
                        >
                          <option value="">اختر المقرر</option>
                          {hallConstraintOptions.map((course) => (
                            <option key={course.key} value={course.key}>
                              {course.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        type="button"
                        onClick={() => addHallConstraintCourseToList(selectedHallConstraintCourseKey)}
                        style={cardButtonStyle({ disabled: !selectedHallConstraintCourseKey })}
                        disabled={!selectedHallConstraintCourseKey}
                      >
                        إضافة المقرر
                      </button>
                    </div>
                  </div>

 
                {/*start*/}
                <div
                  style={{
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 18,
                    padding: 14,
                    background: "#FCFEFE",
                    marginBottom: 14,
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 10 }}>بطاقة تخصيص على مستوى المقرر</div>

                  {selectedHallConstraintCourseKeys.length ? (
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                      {selectedHallConstraintCourseKeys.map((courseKey) => {
                        const option = courseConstraintOptions.find((item) => item.key === courseKey);
                        if (!option) return null;
                        return (
                          <div
                            key={courseKey}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 8,
                              border: `1px solid ${selectedHallConstraintCourseKey === courseKey ? COLORS.primaryDark : COLORS.border}`,
                              background: selectedHallConstraintCourseKey === courseKey ? COLORS.primaryLight : "#fff",
                              color: COLORS.charcoal,
                              borderRadius: 14,
                              padding: "6px 8px 6px 12px",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => setSelectedHallConstraintCourseKey(courseKey)}
                              style={{
                                border: "none",
                                background: "transparent",
                                color: "inherit",
                                fontWeight: 800,
                                cursor: "pointer",
                                padding: 0,
                              }}
                            >
                              {option.label}
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                removeHallConstraintCourseFromList(courseKey);
                              }}
                              style={{
                                border: "none",
                                background: "transparent",
                                cursor: "pointer",
                                color: COLORS.danger,
                                fontWeight: 900,
                                fontSize: 16,
                                lineHeight: 1,
                                padding: 0,
                              }}
                              aria-label={`حذف ${option.label}`}
                              title="حذف المقرر"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  
                  {/* end*/}
               
                  
                  {selectedHallConstraintCourseKey ? (
                    <div
                      style={{
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: 18,
                        padding: 16,
                        background: "#fff",
                      }}
                    >
                      <div style={{ fontWeight: 900, marginBottom: 8 }}>
                        تخصيص القاعات للمقرر:{" "}
                        {courseConstraintOptions.find((item) => item.key === selectedHallConstraintCourseKey)?.label || selectedHallConstraintCourseKey}
                      </div>

                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                        {[
                          { value: "off", label: "بدون تخصيص" },
                          { value: "prefer", label: "تفضيل قاعات محددة" },
                          { value: "only", label: "قصر على قاعات محددة" },
                        ].map((option) => {
                          const active = selectedCourseHallConstraint.mode === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => updateCourseHallConstraint(selectedHallConstraintCourseKey, { mode: option.value })}
                              style={cardButtonStyle({ active })}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>

                      <div style={{ fontWeight: 800, marginBottom: 8 }}>القاعات</div>
                      {normalizedExamHalls.length ? (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                          {normalizedExamHalls.map((hall) => {
                            const checked = selectedCourseHallConstraint.hallNames.includes(hall.name);
                            return (
                              <label
                                key={`course-hall-${hall.id}`}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  border: `1px solid ${checked ? COLORS.primaryBorder : COLORS.border}`,
                                  background: checked ? COLORS.primaryLight : "#fff",
                                  borderRadius: 12,
                                  padding: "10px 12px",
                                  cursor: "pointer",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleCourseHallConstraintValue(selectedHallConstraintCourseKey, hall.name)}
                                />
                                <span>{hall.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ color: COLORS.muted }}>أضف القاعات أولًا حتى تتمكن من تخصيصها للمقررات.</div>
                      )}


                      <div
                        style={{
                          marginTop: 14,
                          border: `1px solid ${COLORS.border}`,
                          borderRadius: 14,
                          padding: 14,
                          background: COLORS.bg2,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                          <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={Boolean(selectedCourseHallConstraint.splitEnabled)}
                              onChange={(e) =>
                                updateCourseHallConstraint(selectedHallConstraintCourseKey, {
                                  splitEnabled: e.target.checked,
                                })
                              }
                            />
                            <span>تفعيل/إلغاء تقسيم المقرر</span>
                          </label>

                          <span
                            title="إذا لم تكفِ قاعة واحدة لهذا المقرر، فسيحاول النظام جمع أكثر من قاعة من القاعات المختارة هنا لنفس الفترة، مثل: قاعة 1 + قاعة 2. هذا الخيار لا يعمل إلا عند تفعيله واختيار قاعتين على الأقل."
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 999,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: COLORS.primaryLight,
                              color: COLORS.primaryDark,
                              border: `1px solid ${COLORS.primaryBorder}`,
                              fontWeight: 900,
                              cursor: "help",
                            }}
                          >
                            ؟
                          </span>
                        </div>

                        <div style={{ color: COLORS.muted, lineHeight: 1.8, marginBottom: 10 }}>
                          اختر القاعات التي يمكن للنظام أن يجمع بينها لهذا المقرر عند الحاجة.
                        </div>

                        {normalizedExamHalls.length ? (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                            {normalizedExamHalls.map((hall) => {
                              const checked = (selectedCourseHallConstraint.splitHallNames || []).includes(hall.name);
                              return (
                                <label
                                  key={`course-split-hall-${hall.id}`}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    border: `1px solid ${checked ? COLORS.primaryBorder : COLORS.border}`,
                                    background: checked ? COLORS.primaryLight : "#fff",
                                    borderRadius: 12,
                                    padding: "10px 12px",
                                    cursor: selectedCourseHallConstraint.splitEnabled ? "pointer" : "not-allowed",
                                    opacity: selectedCourseHallConstraint.splitEnabled ? 1 : 0.65,
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={!selectedCourseHallConstraint.splitEnabled}
                                    onChange={() => {
                                      const currentSplitHallNames = Array.isArray(selectedCourseHallConstraint.splitHallNames)
                                        ? selectedCourseHallConstraint.splitHallNames
                                        : [];
                                      const nextSplitHallNames = currentSplitHallNames.includes(hall.name)
                                        ? currentSplitHallNames.filter((name) => name !== hall.name)
                                        : [...currentSplitHallNames, hall.name];

                                      updateCourseHallConstraint(selectedHallConstraintCourseKey, {
                                        splitHallNames: nextSplitHallNames,
                                      });
                                    }}
                                  />
                                  <span>{hall.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>

                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
                        <button
                          type="button"
                          onClick={() => clearCourseHallConstraint(selectedHallConstraintCourseKey)}
                          style={cardButtonStyle({ danger: true })}
                        >
                          مسح تخصيص المقرر
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
                  
                  <div
                    style={{
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 18,
                      padding: 14,
                      background: "#fff",
                    }}
                  >
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>إضافة تخصيص على مستوى القسم أو التخصص</div>
                    <div style={{ color: COLORS.muted, lineHeight: 1.8, marginBottom: 10 }}>
                      بدلًا من تحديد كل مقرر على حدة، يمكنك تطبيق نفس تفضيل/قصر القاعات على جميع مقررات القسم أو التخصص.
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <div style={{ flex: "0 1 340px", minWidth: 200 }}>
                        <select
                          value={selectedHallConstraintDepartmentKey}
                          onChange={(e) => setSelectedHallConstraintDepartmentKey(e.target.value)}
                          style={{ ...fieldStyle(), maxWidth: 340 }}
                        >
                          <option value="">اختر القسم/التخصص</option>
                          {hallConstraintDepartmentOptions.map((department) => (
                            <option key={department} value={department}>
                              {department}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        type="button"
                        onClick={() => addHallConstraintDepartmentToList(selectedHallConstraintDepartmentKey)}
                        style={cardButtonStyle({ disabled: !selectedHallConstraintDepartmentKey })}
                        disabled={!selectedHallConstraintDepartmentKey}
                      >
                        إضافة القسم/التخصص
                      </button>
                    </div>
                  </div>
                </div>

               


                <div
                  style={{
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 18,
                    padding: 14,
                    background: "#FCFEFE",
                    marginBottom: 14,
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 10 }}>بطاقة تخصيص على مستوى القسم/التخصص</div>

                  {selectedHallConstraintDepartmentKeys.length ? (
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                      {selectedHallConstraintDepartmentKeys.map((departmentKey) => {
                        const label = availableDepartments.find(
                          (item) => normalizeArabic(item) === normalizeArabic(departmentKey)
                        ) || departmentKey;
                        return (
                          <div
                            key={departmentKey}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 8,
                              border: `1px solid ${normalizeArabic(selectedHallConstraintDepartmentKey) === normalizeArabic(departmentKey) ? COLORS.primaryDark : COLORS.border}`,
                              background:
                                normalizeArabic(selectedHallConstraintDepartmentKey) === normalizeArabic(departmentKey)
                                  ? COLORS.primaryLight
                                  : "#fff",
                              color: COLORS.charcoal,
                              borderRadius: 14,
                              padding: "6px 8px 6px 12px",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => setSelectedHallConstraintDepartmentKey(label)}
                              style={{
                                border: "none",
                                background: "transparent",
                                color: "inherit",
                                fontWeight: 800,
                                cursor: "pointer",
                                padding: 0,
                              }}
                            >
                              {label}
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                removeHallConstraintDepartmentFromList(departmentKey);
                              }}
                              style={{
                                border: "none",
                                background: "transparent",
                                cursor: "pointer",
                                color: COLORS.danger,
                                fontWeight: 900,
                                fontSize: 16,
                                lineHeight: 1,
                                padding: 0,
                              }}
                              aria-label={`حذف ${label}`}
                              title="حذف القسم/التخصص"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  {selectedHallConstraintDepartmentKey ? (
                    <div
                      style={{
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: 18,
                        padding: 16,
                        background: "#fff",
                        marginBottom: 14,
                      }}
                    >
                      <div style={{ fontWeight: 900, marginBottom: 8 }}>
                        تخصيص القاعات للقسم/التخصص: {selectedHallConstraintDepartmentKey}
                      </div>

                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                        {[
                          { value: "off", label: "بدون تخصيص" },
                          { value: "prefer", label: "تفضيل قاعات محددة" },
                          { value: "only", label: "قصر على قاعات محددة" },
                        ].map((option) => {
                          const active = selectedDepartmentHallConstraint.mode === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => updateDepartmentHallConstraint(selectedHallConstraintDepartmentKey, { mode: option.value })}
                              style={cardButtonStyle({ active })}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>

                      <div style={{ fontWeight: 800, marginBottom: 8 }}>القاعات</div>
                      {normalizedExamHalls.length ? (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                          {normalizedExamHalls.map((hall) => {
                            const checked = selectedDepartmentHallConstraint.hallNames.includes(hall.name);
                            return (
                              <label
                                key={`department-hall-${hall.id}`}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  border: `1px solid ${checked ? COLORS.primaryBorder : COLORS.border}`,
                                  background: checked ? COLORS.primaryLight : "#fff",
                                  borderRadius: 12,
                                  padding: "10px 12px",
                                  cursor: "pointer",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleDepartmentHallConstraintValue(selectedHallConstraintDepartmentKey, hall.name)}
                                />
                                <span>{hall.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ color: COLORS.muted }}>أضف القاعات أولًا حتى تتمكن من تخصيصها للأقسام أو التخصصات.</div>
                      )}


                      <div
                        style={{
                          marginTop: 14,
                          border: `1px solid ${COLORS.border}`,
                          borderRadius: 14,
                          padding: 14,
                          background: COLORS.bg2,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                          <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={Boolean(selectedCourseHallConstraint.splitEnabled)}
                              onChange={(e) =>
                                updateCourseHallConstraint(selectedHallConstraintCourseKey, {
                                  splitEnabled: e.target.checked,
                                })
                              }
                            />
                            <span>تفعيل/إلغاء تقسيم المقرر</span>
                          </label>

                          <span
                            title="إذا لم تكفِ قاعة واحدة لهذا المقرر، فسيحاول النظام جمع أكثر من قاعة من القاعات المختارة هنا لنفس الفترة، مثل: قاعة 1 + قاعة 2. هذا الخيار لا يعمل إلا عند تفعيله واختيار قاعتين على الأقل."
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 999,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: COLORS.primaryLight,
                              color: COLORS.primaryDark,
                              border: `1px solid ${COLORS.primaryBorder}`,
                              fontWeight: 900,
                              cursor: "help",
                            }}
                          >
                            ؟
                          </span>
                        </div>

                        <div style={{ color: COLORS.muted, lineHeight: 1.8, marginBottom: 10 }}>
                          اختر القاعات التي يمكن للنظام أن يجمع بينها لهذا المقرر عند الحاجة.
                        </div>

                        {normalizedExamHalls.length ? (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                            {normalizedExamHalls.map((hall) => {
                              const checked = (selectedCourseHallConstraint.splitHallNames || []).includes(hall.name);
                              return (
                                <label
                                  key={`course-split-hall-${hall.id}`}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    border: `1px solid ${checked ? COLORS.primaryBorder : COLORS.border}`,
                                    background: checked ? COLORS.primaryLight : "#fff",
                                    borderRadius: 12,
                                    padding: "10px 12px",
                                    cursor: selectedCourseHallConstraint.splitEnabled ? "pointer" : "not-allowed",
                                    opacity: selectedCourseHallConstraint.splitEnabled ? 1 : 0.65,
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={!selectedCourseHallConstraint.splitEnabled}
                                    onChange={() => {
                                      const currentSplitHallNames = Array.isArray(selectedCourseHallConstraint.splitHallNames)
                                        ? selectedCourseHallConstraint.splitHallNames
                                        : [];
                                      const nextSplitHallNames = currentSplitHallNames.includes(hall.name)
                                        ? currentSplitHallNames.filter((name) => name !== hall.name)
                                        : [...currentSplitHallNames, hall.name];

                                      updateCourseHallConstraint(selectedHallConstraintCourseKey, {
                                        splitHallNames: nextSplitHallNames,
                                      });
                                    }}
                                  />
                                  <span>{hall.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>

                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
                        <button
                          type="button"
                          onClick={() => clearDepartmentHallConstraint(selectedHallConstraintDepartmentKey)}
                          style={cardButtonStyle({ danger: true })}
                        >
                          مسح تخصيص القسم/التخصص
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>

              </Card>
            </div>
            ) : null}

            <div style={{ marginTop: 18 }}>
              <div style={{ marginBottom: 10, fontWeight: 800 }}>أيام الاختبارات</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {DAY_OPTIONS.map((day) => {
                  const active = selectedDays.includes(day);
                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDays((prev) => toggleDay(prev, day))}
                      style={{
                        border: `1px solid ${active ? COLORS.primaryDark : COLORS.border}`,
                        background: active ? COLORS.primaryDark : "#fff",
                        color: active ? "#fff" : COLORS.charcoalSoft,
                        borderRadius: 999,
                        padding: "10px 16px",
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ marginTop: 18, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 18,
                  padding: 14,
                }}
              >
                <input type="checkbox" checked={excludeInactive} onChange={(e) => setExcludeInactive(e.target.checked)} />
                استبعاد المنسحبين والمطوي قيدهم
              </label>
            </div>
 <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
              <button onClick={() => setCurrentStep(1)} style={cardButtonStyle()}>
                السابق
              </button>
              <button onClick={() => setCurrentStep(3)}  style={cardButtonStyle({ active: true })}>
                التالي: تعديل المقررات
              </button>
            </div>
          </Card>
        )}

        {currentStep === 3 && (
          <Card>
            <SectionHeader
              title="تعديل المقررات"
              description="استبعد المقررات التي لا تريد إدخالها في الجدولة، ويمكنك أيضًا تحديد مستويات المقررات لمنع مقررات المستوى الواحد من الجدولة في نفس اليوم (الخصائص مخفية افتراضيًا ويمكن تفعيلها في صفحة التفضيلات)."
            />

          
            {showCourseExclusionsPreference ? (
            <div style={{ marginTop: 18, border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 14 }}>
              <div style={{ fontWeight: 800, marginBottom: 10 }}>استبعاد مقررات من الجدول</div>
              <div style={{ color: COLORS.muted, fontSize: 14, marginBottom: 10 }}>
                اختر أي مقرر لا تريد إدخاله في الجدولة.
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, maxHeight: 320, overflow: "auto" }}>
                {rows.length ? (
                  allCourseOptions.map((course) => {
                    const excluded = excludedCourses.includes(course.key);
                    return (
                      <button
                        key={course.key}
                        onClick={() => toggleExcludedCourse(course.key)}
                        style={{
                          border: `1px solid ${excluded ? COLORS.danger : COLORS.border}`,
                          background: excluded ? COLORS.dangerBg : "#fff",
                          color: excluded ? COLORS.danger : COLORS.charcoalSoft,
                          borderRadius: 999,
                          padding: "8px 14px",
                          cursor: "pointer",
                          fontWeight: 700,
                        }}
                      >
                        {excluded ? `مستبعد: ${course.label}` : course.label}
                      </button>
                    );
                  })
                ) : (
                  <span style={{ color: "#94A3B8" }}>ارفع الملف أولًا</span>
                )}
              </div>
            </div>
            ) : null}

            {showGeneralSpecializedSeparationPreference ? (
            <div style={{ marginTop: 18, border: `1px solid ${COLORS.border}`, borderRadius: 22, padding: 16, background: "#F8FEFE" }}>
              <div style={{ fontWeight: 800, marginBottom: 10 }}>فصل أيام الدراسات العامة عن التخصص</div>
              <div style={{ color: COLORS.muted, fontSize: 14, lineHeight: 1.9, marginBottom: 12 }}>
                عند تفعيل هذا الخيار سيحاول النظام توزيع مقررات الدراسات العامة في أيام مختلفة عن أيام مقررات التخصص. مثال توضيحي: الدراسات العامة يمكن أن تتجه إلى الأحد والثلاثاء والخميس ثم الاثنين القادم، بينما تتجه مقررات التخصص إلى الاثنين والأربعاء ثم الأحد القادم والثلاثاء القادم، وذلك حسب الإمكان دون كسر القيود الأساسية.
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {[
                  { value: "off", label: "بدون فصل إضافي" },
                  { value: "soft", label: "فصل مرن (تفضيل بسيط)" },
                  { value: "strong", label: "فصل كامل (يفضل بقوة)" },
                ].map((option) => {
                  const active = generalSpecializedDaySeparationMode === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setGeneralSpecializedDaySeparationMode(option.value)}
                      style={cardButtonStyle({ active })}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            ) : null}

            {showSamePeriodPreference ? (
            <div style={{ marginTop: 18, border: `1px solid ${COLORS.border}`, borderRadius: 22, padding: 16, background: "#F8FEFE" }}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 10,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 18,
                    padding: 14,
                    background: "#fff",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={enableSamePeriodGroups}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setEnableSamePeriodGroups(checked);
                      if (checked && !samePeriodGroups.length) {
                        setSamePeriodGroups([
                          {
                            id: makeCourseGroupId(),
                            title: "مجموعة 1",
                            courseKeys: [],
                          },
                        ]);
                      }
                    }}
                  />
                  محاولة إدراج مقررات محددة في نفس الفترة
                </label>

                {enableSamePeriodGroups ? (
                  <button
                    type="button"
                    onClick={addSamePeriodGroup}
                    style={cardButtonStyle()}
                  >
                    إضافة مجموعة جديدة
                  </button>
                ) : null}
              </div>

              <div
                style={{
                  display: "inline-flex",
                  marginTop: 12,
                  background: "#fff",
                  border: `1px solid ${COLORS.primaryBorder}`,
                  borderRadius: 16,
                  padding: "12px 14px",
                  color: COLORS.muted,
                  lineHeight: 1.9,
                  fontSize: 14,
                }}
              >
                فعّل هذا الخيار إذا كنت تريد أن يحاول النظام وضع مقررات معينة في نفس الفترة. اسحب المقررات من القائمة إلى المربعات في الأسفل، وسيتم تطبيق ذلك حسب الإمكان مع مراعاة التعارضات وسعة القاعات وتوفر المراقبين.
              </div>

              {enableSamePeriodGroups ? (
                <div style={{ marginTop: 16 }}>
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggingSamePeriodCourseKey) {
                        removeCourseFromSamePeriodGroups(draggingSamePeriodCourseKey);
                        setDraggingSamePeriodCourseKey("");
                      }
                    }}
                    style={{
                      border: `1px dashed ${COLORS.primaryBorder}`,
                      borderRadius: 18,
                      padding: 14,
                      background: "#fff",
                      marginBottom: 16,
                    }}
                  >
                    <div style={{ fontWeight: 800, marginBottom: 10 }}>المقررات غير المضافة لأي مجموعة</div>
                    <div style={{ color: COLORS.muted, fontSize: 14, marginBottom: 10 }}>
                      اسحب أي مقرر إلى إحدى المجموعات في الأسفل. ويمكنك أيضًا سحبه إلى هنا لإزالته من المجموعة.
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, maxHeight: 220, overflow: "auto" }}>
                      {samePeriodUngroupedCourses.length ? (
                        samePeriodUngroupedCourses.map((course) => (
                          <button
                            key={course.key}
                            type="button"
                            draggable
                            onDragStart={() => setDraggingSamePeriodCourseKey(course.key)}
                            onDragEnd={() => setDraggingSamePeriodCourseKey("")}
                            style={{
                              border: `1px solid ${COLORS.border}`,
                              background: "#fff",
                              color: COLORS.charcoalSoft,
                              borderRadius: 999,
                              padding: "8px 14px",
                              cursor: "grab",
                              fontWeight: 700,
                            }}
                          >
                            {course.label}
                          </button>
                        ))
                      ) : (
                        <span style={{ color: "#94A3B8" }}>لا توجد مقررات متاحة حاليًا</span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
                    {samePeriodGroups.map((group, index) => {
                      const groupCourses = group.courseKeys
                        .map((courseKey) => allCourseOptions.find((course) => course.key === courseKey))
                        .filter(Boolean);

                      return (
                        <div
                          key={group.id}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (draggingSamePeriodCourseKey) {
                              assignCourseToSamePeriodGroup(draggingSamePeriodCourseKey, group.id);
                              setDraggingSamePeriodCourseKey("");
                            }
                          }}
                          style={{
                            border: `1px solid ${COLORS.primaryBorder}`,
                            borderRadius: 20,
                            padding: 14,
                            background: "#fff",
                            minHeight: 180,
                          }}
                        >
                          <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                            <input
                              value={group.title}
                              onChange={(e) => updateSamePeriodGroupTitle(group.id, e.target.value)}
                              placeholder={`مجموعة ${index + 1}`}
                              style={{ ...fieldStyle(), maxWidth: 180, padding: "10px 12px" }}
                            />

                            <button
                              type="button"
                              onClick={() => removeSamePeriodGroup(group.id)}
                              style={cardButtonStyle({ danger: true })}
                            >
                              حذف
                            </button>
                          </div>

                          <div style={{ color: COLORS.muted, fontSize: 13, marginBottom: 10, lineHeight: 1.8 }}>
                            ضع هنا المقررات التي تريد أن يحاول النظام جدولتها في نفس الفترة.
                          </div>

                          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                            {groupCourses.length ? (
                              groupCourses.map((course) => (
                                <button
                                  key={course.key}
                                  type="button"
                                  draggable
                                  onDragStart={() => setDraggingSamePeriodCourseKey(course.key)}
                                  onDragEnd={() => setDraggingSamePeriodCourseKey("")}
                                  onClick={() => removeCourseFromSamePeriodGroups(course.key)}
                                  style={{
                                    border: `1px solid ${COLORS.primaryBorder}`,
                                    background: COLORS.primaryLight,
                                    color: COLORS.primaryDark,
                                    borderRadius: 999,
                                    padding: "8px 14px",
                                    cursor: "grab",
                                    fontWeight: 800,
                                  }}
                                >
                                  {course.label}
                                </button>
                              ))
                            ) : (
                              <span style={{ color: "#94A3B8" }}>اسحب المقررات إلى هذا المربع</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
            ) : null}

            {showCourseTimePreference ? (
            <div
              style={{
                marginTop: 18,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 22,
                padding: 16,
                background: "#F8FEFE",
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 8 }}>تفضيل/تجنب يوم أو فترة للمقرر (حسب الإمكان)</div>
              <div style={{ color: COLORS.muted, marginBottom: 14, lineHeight: 1.8 }}>
                هذه الخيارات ليست مؤكدة؛ سيحاول النظام مراعاتها قدر الإمكان أثناء التوزيع الآلي.
              </div>

              <div style={{ maxWidth: 700, marginBottom: 14 }}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ flex: "1 1 320px" }}>
                    <select
                      value={selectedConstraintCourseKey}
                      onChange={(e) => setSelectedConstraintCourseKey(e.target.value)}
                      style={fieldStyle()}
                    >
                      <option value="">اختر المقرر</option>
                      {visibleCourseConstraintOptions.map((course) => (
                        <option key={course.key} value={course.key}>
                          {course.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
  type="button"
  onClick={() => {
    addConstraintCourseToList(selectedConstraintCourseKey);
    setSelectedConstraintCourseKey("");  
  }}
  style={cardButtonStyle({ disabled: !selectedConstraintCourseKey })}
  disabled={!selectedConstraintCourseKey}
>
  إضافة المقرر
</button>
                </div>
              </div>

              {selectedConstraintCourseKeys.length ? (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                  {selectedConstraintCourseKeys.map((courseKey) => {
                    const course = courseConstraintOptions.find((item) => item.key === courseKey);
                    if (!course) return null;

                    return (
                      <div
                        key={courseKey}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          border: `1px solid ${selectedConstraintCourseKey === courseKey ? COLORS.primaryDark : COLORS.border}`,
                          background: selectedConstraintCourseKey === courseKey ? COLORS.primaryLight : "#fff",
                          borderRadius: 999,
                          padding: "8px 12px",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedConstraintCourseKey(courseKey)}
                          style={{ border: "none", background: "transparent", cursor: "pointer", fontWeight: 800, color: COLORS.charcoal }}
                        >
                          {course.label}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeConstraintCourseFromList(courseKey)}
                          style={{ border: "none", background: "transparent", cursor: "pointer", color: COLORS.danger, fontWeight: 900 }}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                  </div>
              ) : null}

              {selectedConstraintCourseKey ? (
                <div>
                  <div
                    style={{
                      fontWeight: 900,
                      marginBottom: 12,
                      color: COLORS.charcoal,
                    }}
                  >
                    تفضيلات المقرر: {courseConstraintOptions.find((item) => item.key === selectedConstraintCourseKey)?.label || selectedConstraintCourseKey}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
                  <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 14, background: "#fff" }}>
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>تفضيل اليوم</div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {DAY_OPTIONS.map((day) => (
                        <label key={day} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input
                            type="checkbox"
                            checked={selectedCourseConstraint.preferredDays.includes(day)}
                            onChange={() => toggleCourseConstraintValue(selectedConstraintCourseKey, "preferredDays", day)}
                          />
                          {day}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 14, background: "#fff" }}>
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>تفضيل الفترة</div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {parsedPeriods.filter((p) => p.valid).map((period, index) => (
                        <label key={`pref-${index + 1}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input
                            type="checkbox"
                            checked={selectedCourseConstraint.preferredPeriods.includes(index + 1)}
                            onChange={() => toggleCourseConstraintValue(selectedConstraintCourseKey, "preferredPeriods", index + 1)}
                          />
                          الفترة {index + 1}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 14, background: "#fff" }}>
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>تجنب اليوم</div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {DAY_OPTIONS.map((day) => (
                        <label key={`avoid-day-${day}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input
                            type="checkbox"
                            checked={selectedCourseConstraint.avoidedDays.includes(day)}
                            onChange={() => toggleCourseConstraintValue(selectedConstraintCourseKey, "avoidedDays", day)}
                          />
                          {day}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 14, background: "#fff" }}>
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>تجنب الفترة</div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {parsedPeriods.filter((p) => p.valid).map((period, index) => (
                        <label key={`avoid-period-${index + 1}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input
                            type="checkbox"
                            checked={selectedCourseConstraint.avoidedPeriods.includes(index + 1)}
                            onChange={() => toggleCourseConstraintValue(selectedConstraintCourseKey, "avoidedPeriods", index + 1)}
                          />
                          الفترة {index + 1}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                </div>
              ) : null}

              {selectedConstraintCourseKey ? (
                <div style={{ marginTop: 14 }}>
                  <button type="button" onClick={() => clearCourseConstraint(selectedConstraintCourseKey)} style={cardButtonStyle({ danger: true })}>
                    مسح تفضيلات هذا المقرر
                  </button>
                </div>
              ) : null}
            </div>
            ) : null}

            {showAvoidSameLevelSameDayPreference ? (
            <>
            <div style={{ marginTop: 18 }}>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 18,
                  padding: 14,
                  background: "#fff",
                }}
              >
                <input
                  type="checkbox"
                  checked={avoidSameLevelSameDay}
                  onChange={(e) => setAvoidSameLevelSameDay(e.target.checked)}
                />
                تجنب وضع مقررات من المستوى نفسه في نفس اليوم
              </label>
            </div>

            {avoidSameLevelSameDay ? (
              <div
                style={{
                  marginTop: 18,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 22,
                  padding: 16,
                  background: "#F8FEFE",
                }}
              >
                <div style={{ fontWeight: 900, marginBottom: 8 }}>تحديد مستويات المقررات</div>
                <div style={{ color: COLORS.muted, marginBottom: 14, lineHeight: 1.8 }}>
                  اسحب المقرر إلى مربع المستوى المناسب في الأسفل. ويمكنك أيضًا إعادة المقرر إلى قائمة المقررات غير المصنفة.
                </div>

                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggingCourseKey) clearCourseLevel(draggingCourseKey);
                    setDraggingCourseKey("");
                  }}
                  style={{
                    border: `1px dashed ${COLORS.primaryBorder}`,
                    borderRadius: 18,
                    padding: 14,
                    background: "#fff",
                    marginBottom: 16,
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 10 }}>مقررات غير مصنفة</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {unassignedLevelCourses.length ? (
                      unassignedLevelCourses.map((course) => (
                        <div
                          key={course.key}
                          draggable
                          onDragStart={() => setDraggingCourseKey(course.key)}
                          onDragEnd={() => setDraggingCourseKey("")}
                          style={{
                            border: `1px solid ${COLORS.border}`,
                            background: "#fff",
                            color: COLORS.charcoal,
                            borderRadius: 999,
                            padding: "8px 14px",
                            cursor: "grab",
                            fontWeight: 700,
                          }}
                        >
                          {course.label}
                        </div>
                      ))
                    ) : (
                      <span style={{ color: COLORS.muted }}>لا توجد مقررات غير مصنفة.</span>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 14,
                  }}
                >
                  {LEVEL_OPTIONS.map((level) => {
                    const levelCourses = allCourseOptions.filter(
                      (course) => !excludedCourses.includes(course.key) && courseLevels[course.key] === level.value
                    );

                    return (
                      <div
                        key={level.value}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (draggingCourseKey) setCourseLevel(draggingCourseKey, level.value);
                          setDraggingCourseKey("");
                        }}
                        style={{
                          border: `1px dashed ${COLORS.primaryDark}`,
                          borderRadius: 18,
                          padding: 14,
                          minHeight: 150,
                          background: "#fff",
                        }}
                      >
                        <div style={{ fontWeight: 900, color: COLORS.primaryDark, marginBottom: 10 }}>{level.label}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {levelCourses.length ? (
                            levelCourses.map((course) => (
                              <div
                                key={course.key}
                                draggable
                                onDragStart={() => setDraggingCourseKey(course.key)}
                                onDragEnd={() => setDraggingCourseKey("")}
                                style={{
                                  border: `1px solid ${COLORS.primaryBorder}`,
                                  background: COLORS.primaryLight,
                                  color: COLORS.primaryDark,
                                  borderRadius: 999,
                                  padding: "8px 12px",
                                  cursor: "grab",
                                  fontWeight: 700,
                                }}
                              >
                                {course.label}
                              </div>
                            ))
                          ) : (
                            <span style={{ color: COLORS.muted }}>اسحب المقررات إلى هنا</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            </>
            ) : null}

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
              <button onClick={() => setCurrentStep(2)} style={cardButtonStyle()}>
                السابق
              </button>
              <button onClick={() => setCurrentStep(4)} style={cardButtonStyle({ active: true })}>
                التالي: المراقبون
              </button>
            </div>
          </Card>
        )}

  {currentStep === 4 && (
  <Card>
    <SectionHeader
      title="المراقبون"
      description="حدّد طريقة توزيع المراقبين قبل إنشاء الجدول."
    />

    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        marginTop: 18,
      }}
    >
      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 18,
          padding: 14,
        }}
      >
        <input
          type="checkbox"
          checked={includeInvigilators}
          onChange={(e) => setIncludeInvigilators(e.target.checked)}
        />
        إضافة المراقبين تلقائيًا
      </label>

      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 18,
          padding: 14,
          position: "relative",
        }}
      >
        <input
          type="checkbox"
          checked={preferCourseTrainerInvigilation}
          onChange={(e) => setPreferCourseTrainerInvigilation(e.target.checked)}
        />

        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          إعطاء أولوية لمدرب المقرر كمراقب أساسي

          <span
            onMouseEnter={() => setShowTrainerHint(true)}
            onMouseLeave={() => setShowTrainerHint(false)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: COLORS.warningBg,
              color: COLORS.warning,
              fontWeight: 900,
              fontSize: 13,
              cursor: "help",
              border: `1px solid ${COLORS.border}`,
            }}
          >
            !
          </span>
        </span>

        {showTrainerHint && (
          <div
            style={{
              position: "absolute",
              bottom: "110%",
              right: 10,
              background: "#111827",
              color: "#fff",
              padding: "10px 12px",
              borderRadius: 10,
              fontSize: 13,
              lineHeight: 1.6,
              width: 260,
              boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
              zIndex: 9999,
              transition: "opacity 0.2s ease, transform 0.2s ease",
            }}
          >
            سيتم إعطاء أولوية لمدرب المقرر عند التوزيع حسب الإمكان،
            مع محاولة الحفاظ على عدالة توزيع المراقبة بين جميع المراقبين.
          </div>
        )}
      </label>
    </div>

    {includeInvigilators ? (
      <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
        {!includeAllDepartmentsAndMajors ? (
          <div
            style={{
              border: `1px solid ${COLORS.border}`,
              borderRadius: 18,
              padding: 14,
              background: COLORS.warningBg,
              color: COLORS.warning,
              lineHeight: 1.8,
              fontSize: 14,
            }}
          >
            عند اختيار قسم/تخصص محدد، يتم استبعاد مدربي مقررات الدراسات العامة من قائمة
            المراقبين حتى لا يؤثروا على عدالة توزيع المراقبين الخاصة بمقررات التخصص.
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(240px, 300px) minmax(320px, 460px)",
            justifyContent: "space-between",
            alignItems: "start",
            gap: 14,
          }}
        >
          <div style={{ display: "grid", gap: 12, width: "100%" }}>
            <div style={{ width: "100%", textAlign: "right" }}>
              <div style={{ marginBottom: 8, fontWeight: 800 }}>طريقة توزيع المراقبين</div>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  justifyContent: "flex-start",
                  width: "100%",
                }}
              >
                <button
                  type="button"
                  onClick={() => setInvigilationMode("fixed")}
                  style={{
                    border: `1px solid ${
                      invigilationMode === "fixed" ? COLORS.primaryDark : COLORS.border
                    }`,
                    background: invigilationMode === "fixed" ? COLORS.primaryDark : "#fff",
                    color: invigilationMode === "fixed" ? "#fff" : COLORS.charcoalSoft,
                    borderRadius: 999,
                    padding: "10px 14px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  عدد ثابت
                </button>

                <button
                  type="button"
                  onClick={() => setInvigilationMode("ratio")}
                  style={{
                    border: `1px solid ${
                      invigilationMode === "ratio" ? COLORS.primaryDark : COLORS.border
                    }`,
                    background: invigilationMode === "ratio" ? COLORS.primaryDark : "#fff",
                    color: invigilationMode === "ratio" ? "#fff" : COLORS.charcoalSoft,
                    borderRadius: 999,
                    padding: "10px 14px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  حسب عدد المتدربين
                </button>
              </div>
            </div>

            {invigilationMode === "fixed" ? (
              <div style={{ width: "100%" }}>
                <div style={{ marginBottom: 8, fontWeight: 800 }}>عدد المراقبين لكل مقرر</div>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={invigilatorsPerPeriod}
                  onChange={(e) => setInvigilatorsPerPeriod(safeNum(e.target.value, 4))}
                  style={{ ...fieldStyle(), maxWidth: 80 }}
                />
              </div>
            ) : (
              <div style={{ width: "100%" }}>
                <div style={{ marginBottom: 8, fontWeight: 800 }}>عدد المتدربين لكل مراقب</div>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={studentsPerInvigilator}
                  onChange={(e) => setStudentsPerInvigilator(safeNum(e.target.value, 20))}
                  style={{ ...fieldStyle(), maxWidth: 80 }}
                />
              </div>
            )}
          

          <span style={{ width: "100%", maxWidth: 600, textAlign: "right" }}>
            <div style={{ marginBottom: 8, fontWeight: 800, textAlign: "right"}}>أسماء المراقبين</div>
            <textarea
              value={manualInvigilators}
              onChange={(e) => setManualInvigilators(e.target.value)}
              placeholder="اتركه فارغًا لسحب الأسماء تلقائيًا من عمود المدرب في التقرير، أو اكتب كل اسم في سطر مستقل"
              style={{ ...fieldStyle(), minHeight: 96, resize: "vertical" }}
            />  </span>
          </div>
      </div>

        <div
          style={{
            border: `1px solid ${COLORS.border}`,
            borderRadius: 18,
            padding: 14,
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 10 }}>استبعاد مراقبين من التوزيع</div>
          <div style={{ color: COLORS.muted, fontSize: 14, marginBottom: 10 }}>
            يتم جلب الأسماء تلقائيًا من التقرير، ويمكنك اختيار من لا يراقب.
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {availableInvigilators.length ? (
              availableInvigilators.map((name) => {
                const excluded = excludedInvigilators.some(
                  (item) => normalizeArabic(item) === normalizeArabic(name)
                );

                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleExcludedInvigilator(name)}
                    style={{
                      border: `1px solid ${excluded ? COLORS.danger : COLORS.border}`,
                      background: excluded ? COLORS.dangerBg : "#fff",
                      color: excluded ? COLORS.danger : COLORS.charcoalSoft,
                      borderRadius: 999,
                      padding: "8px 14px",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    {excluded ? `مستبعد: ${name}` : name}
                  </button>
                );
              })
            ) : (
              <span style={{ color: "#94A3B8" }}>لا توجد أسماء مراقبين بعد</span>
            )}
          </div>
        </div>


        {showInvigilatorConstraintPreference ? (
        <div
          style={{
            border: `1px solid ${COLORS.border}`,
            borderRadius: 18,
            padding: 14,
            background: "#F8FEFE",
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 8 }}>تفضيل / منع / قصر مراقبين لمقرر معيّن</div>
          <div style={{ color: COLORS.muted, marginBottom: 14, lineHeight: 1.8 }}>
            هذه الخيارات خاصة بكل مقرر، وسيحاول النظام مراعاتها أثناء التوزيع الآلي. عند اختيار "قصر"، لن يختار النظام إلا من الأسماء المحددة لهذا المقرر.
          </div>

          <div style={{ maxWidth: 700, marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ flex: "1 1 320px" }}>
                <select
                  value={selectedInvigilatorConstraintCourseKey}
                  onChange={(e) => setSelectedInvigilatorConstraintCourseKey(e.target.value)}
                  style={fieldStyle()}
                >
                  <option value="">اختر المقرر</option>
                  {visibleInvigilatorConstraintOptions.map((course) => (
                    <option key={course.key} value={course.key}>
                      {course.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => addInvigilatorConstraintCourseToList(selectedInvigilatorConstraintCourseKey)}
                style={cardButtonStyle({ disabled: !selectedInvigilatorConstraintCourseKey })}
                disabled={!selectedInvigilatorConstraintCourseKey}
              >
                إضافة المقرر
              </button>
            </div>
          </div>

          {selectedInvigilatorConstraintCourseKeys.length ? (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
              {selectedInvigilatorConstraintCourseKeys.map((courseKey) => {
                const option = invigilatorConstraintOptions.find((item) => item.key === courseKey);
                if (!option) return null;

                return (
                  <div
                    key={courseKey}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      border: `1px solid ${selectedInvigilatorConstraintCourseKey === courseKey ? COLORS.primaryDark : COLORS.border}`,
                      background: selectedInvigilatorConstraintCourseKey === courseKey ? COLORS.primaryLight : "#fff",
                      color: COLORS.charcoal,
                      borderRadius: 14,
                      padding: "6px 8px 6px 12px",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedInvigilatorConstraintCourseKey(courseKey)}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "inherit",
                        fontWeight: 800,
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      {option.label}
                    </button>

                    <button
                      type="button"
                      onClick={() => removeInvigilatorConstraintCourseFromList(courseKey)}
                      style={{
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        color: COLORS.danger,
                        fontWeight: 900,
                        fontSize: 16,
                        lineHeight: 1,
                        padding: 0,
                      }}
                      aria-label={`حذف ${option.label}`}
                      title="حذف المقرر"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}

          {selectedInvigilatorConstraintCourseKey ? (
            <div
              style={{
                border: `1px solid ${COLORS.border}`,
                borderRadius: 18,
                padding: 16,
                background: COLORS.bg2,
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 12, color: COLORS.charcoal }}>
                تخصيص المراقبين للمقرر: {invigilatorConstraintOptions.find((item) => item.key === selectedInvigilatorConstraintCourseKey)?.label || selectedInvigilatorConstraintCourseKey}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                {[
                  { value: "off", label: "بدون تخصيص" },
                  { value: "prefer", label: "تفضيل مراقبين محددين" },
                  { value: "avoid", label: "منع مراقبين محددين" },
                  { value: "only", label: "قصر على مراقبين محددين" },
                  { value: "avoid_department_trainers", label: "منع مدربي القسم" },
                  { value: "only_department_trainers", label: "قصر على مدربي القسم" },
                ].map((option) => {
                  const active = selectedCourseInvigilatorConstraint.mode === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        updateCourseInvigilatorConstraint(selectedInvigilatorConstraintCourseKey, {
                          mode: option.value,
                        })
                      }
                      style={cardButtonStyle({ active })}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              {selectedCourseInvigilatorConstraint.mode === "off" ? (
                <div style={{ color: COLORS.muted }}>لم يتم تفعيل تخصيص مراقبين لهذا المقرر.</div>
              ) : selectedCourseInvigilatorConstraint.mode === "only_department_trainers" ||
                selectedCourseInvigilatorConstraint.mode === "avoid_department_trainers" ? (
                <>
                  <div style={{ color: COLORS.muted, marginBottom: 12, lineHeight: 1.8 }}>
                    {selectedCourseInvigilatorConstraint.mode === "only_department_trainers"
                      ? "سيتم قصر المراقبة تلقائيًا على مدربي القسم لهذا المقرر. وإذا كان المقرر من الدراسات العامة فسيقتصر على جميع من أسند له أحد مقررات الدراسات العامة، حتى ولو كان المدرب يتبع قسمًا آخر."
                      : "سيتم منع مدربي القسم لهذا المقرر من المراقبة. وإذا كان المقرر من الدراسات العامة فسيتم منع على جميع من أسند له أحد مقررات الدراسات العامة، حتى ولو كان المدرب يتبع قسمًا آخر."}
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => clearCourseInvigilatorConstraint(selectedInvigilatorConstraintCourseKey)}
                      style={cardButtonStyle({ danger: true })}
                    >
                      حذف تخصيص هذا المقرر
                    </button>
                  </div>
                </>
              ) : availableInvigilators.length ? (
                <>
                  <div style={{ color: COLORS.muted, marginBottom: 12 }}>
                    اختر الأسماء التي تريد تطبيقها على هذا المقرر.
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                    {availableInvigilators.map((name) => {
                      const selected = selectedCourseInvigilatorConstraint.invigilatorNames.includes(name);

                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() =>
                            toggleCourseInvigilatorConstraintValue(selectedInvigilatorConstraintCourseKey, name)
                          }
                          style={{
                            border: `1px solid ${selected ? COLORS.primaryDark : COLORS.border}`,
                            background: selected ? COLORS.primaryLight : "#fff",
                            color: selected ? COLORS.primaryDark : COLORS.charcoalSoft,
                            borderRadius: 999,
                            padding: "8px 14px",
                            cursor: "pointer",
                            fontWeight: 700,
                          }}
                        >
                          {selected ? `✓ ${name}` : name}
                        </button>
                      );
                    })}
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => clearCourseInvigilatorConstraint(selectedInvigilatorConstraintCourseKey)}
                      style={cardButtonStyle({ danger: true })}
                    >
                      حذف تخصيص هذا المقرر
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ color: COLORS.muted }}>لا توجد أسماء مراقبين متاحة حاليًا.</div>
              )}
            </div>
          ) : null}
        </div>
        ) : null}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
          <button type="button" onClick={() => setCurrentStep(3)} style={cardButtonStyle()}>
            السابق
          </button>

          <button
            type="button"
            onClick={() => setCurrentStep(5)}
            style={cardButtonStyle({ active: true })}
          >
            التالي: الدراسات العامة
          </button>
        </div>
      </div>
    ) : (
      <div
        style={{
          marginTop: 18,
          border: `1px dashed ${COLORS.border}`,
          borderRadius: 18,
          padding: 18,
          color: COLORS.muted,
          background: "#F8FEFE",
        }}
      >
        تم إيقاف إضافة المراقبين تلقائيًا.
      </div>
    )}

  </Card>
)}

{currentStep === 5 && (
          <Card>
            <SectionHeader title="توزيع مقررات الدراسات العامة" description="يتم توزيع مقررات الدراسات العامة أولًا." />

            {lockGeneralStudiesStep ? (
              <div
                style={{
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 18,
                  padding: 18,
                  background: COLORS.warningBg,
                  color: COLORS.warning,
                  lineHeight: 1.9,
                }}
              >
                هذه الصفحة مقفلة لأنك اخترت توزيع قسم/تخصص محدد فقط.
                مقررات الدراسات العامة مستقلة، لذلك لا يمكن تعديلها في هذه النسخة المخصصة للأقسام.
              </div>
            ) : (
              <>
            <div style={{ marginBottom: 16, color: COLORS.charcoalSoft }}>
              عدد مقررات الدراسات العامة: <strong>{generalCourses.length}</strong>
            </div>

            <div
              style={{
                marginBottom: 16,
                border: `1px solid ${COLORS.primaryBorder}`,
                borderRadius: 16,
                padding: 14,
                background: COLORS.primaryLight,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, color: COLORS.charcoal, marginBottom: 6 }}>
                    حصر المراقبين على مدربي مقررات الدراسات العامة فقط
                  </div>
                  <div style={{ color: COLORS.muted, fontSize: 14, lineHeight: 1.8 }}>
                    عند التفعيل لن يتم إسناد مراقبة مقررات الدراسات العامة إلا إلى المدربين الذين أُسندت لهم مقررات دراسات عامة فعليًا. وإذا كان المدرب يدرّس دراسات عامة وتخصص فسيبقى ضمن الجهتين معًا.
                  </div>
                  <div style={{ marginTop: 8, color: COLORS.warning, fontSize: 13, lineHeight: 1.8, fontWeight: 700 }}>
                    ملاحظة: عند تفعيل هذا الخيار، إذا لم يكفِ عدد مدربي مقررات الدراسات العامة في فترة معيّنة فلن تتم جدولة المقرر في تلك الفترة، ولن يتم الاستعانة بمدربين من خارج الدراسات العامة.
                  </div>
                </div>
                <Switch
                  checked={restrictGeneralStudiesInvigilationToGeneralStudiesTrainers}
                  onChange={setRestrictGeneralStudiesInvigilationToGeneralStudiesTrainers}
                />
              </div>
            </div>
<div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16, }}>
              <button onClick={() => setCurrentStep(4)} style={cardButtonStyle()}>
                السابق
              </button>
              <button onClick={generateGeneralSchedule} style={cardButtonStyle({ active: true })}>
                توزيع مقررات الدراسات العامة
              </button>
              <button onClick={() => setCurrentStep(6)} style={cardButtonStyle()}>
                التالي
              </button>
            </div>
            <div style={{ overflowX: "auto", marginBottom: 18 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: COLORS.primaryLight }}>
                    {["المقرر", "الرمز", "المدرب", "عدد المتدربين"].map((h) => (
                      <th key={h} style={{ padding: 12, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {generalCourses.map((course) => (
                    <tr key={course.key}>
                      <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{course.courseName}</td>
                      <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{course.courseCode}</td>
                      <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{course.trainerText}</td>
                      <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{course.studentCount}</td>
                    </tr>
                  ))}
                  {!generalCourses.length ? (
                    <tr>
                      <td colSpan={4} style={{ padding: 20, textAlign: "center", color: "#94A3B8" }}>
                        لا توجد مقررات دراسات عامة حسب التصنيف الحالي.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            
              </>
            )}
          </Card>
        )}

        {currentStep === 6 && (
          <Card>
            <SectionHeader title="توزيع مقررات التخصص" description="بعد الانتهاء من توزيع مقررات الدراسات العامة، يمكنك مقررات التخصص." />

            <div style={{ marginTop: 4 }}>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 18,
                  padding: 14,
                  background: "#fff",
                }}
              >
                <input
                  type="checkbox"
                  checked={includeAllDepartmentsAndMajors}
                  onChange={(e) => handleIncludeAllDepartmentsAndMajorsChange(e.target.checked)}
                />
                توزيع جميع التخصصات والأقسام
              </label>
            </div>

            {!includeAllDepartmentsAndMajors ? (
              <div
                style={{
                  marginTop: 18,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 18,
                  padding: 14,
                  background: "#F8FEFE",
                }}
              >
                <div
                  style={{
                    marginBottom: 12,
                    background: COLORS.warningBg,
                    color: COLORS.warning,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 14,
                    padding: 12,
                    lineHeight: 1.8,
                    fontSize: 14,
                  }}
                >
                  لن تظهر الدراسات العامة ضمن هذه القائمة لأنها مستقلة عن الأقسام والتخصصات.
                  وعند توزيع قسم محدد سيتم قفل صفحة الدراسات العامة حتى لا يتم تعديلها.
                </div>

                <div
                  style={{
                    marginBottom: 14,
                    border: `1px solid ${COLORS.primaryBorder}`,
                    borderRadius: 16,
                    padding: 14,
                    background: COLORS.primaryLight,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, color: COLORS.charcoal, marginBottom: 6 }}>
                        حصر المراقبات على مدربي الأقسام المحددة فقط
                      </div>
                      <div style={{ color: COLORS.muted, fontSize: 14, lineHeight: 1.8 }}>
                        عند التفعيل سيتم أولًا تحديد مقررات التخصص الداخلة في التوزيع بعد الاستبعاد، ثم حصر المراقبة على مدربي هذه المقررات فقط دون إدخال أي مدرب من خارجها.
                      </div>
                      <div style={{ marginTop: 8, color: COLORS.warning, fontSize: 13, lineHeight: 1.8, fontWeight: 700 }}>
                        ملاحظة: عند تفعيل هذا الخيار، إذا لم يكفِ عدد مدربي هذا النطاق في فترة معيّنة فلن تتم جدولة المقرر في تلك الفترة، ولن يتم الاستعانة بمدربين من خارج هذا النطاق.
                      </div>
                    </div>
                    <Switch
                      checked={restrictSpecializedInvigilationToVisibleDepartmentTrainers}
                      onChange={setRestrictSpecializedInvigilationToVisibleDepartmentTrainers}
                    />
                  </div>
                </div>

                <div style={{ fontWeight: 800, marginBottom: 10 }}>استبعاد أقسام / تخصصات من التوزيع</div>
                <div style={{ color: COLORS.muted, fontSize: 14, marginBottom: 10 }}>
                  اختر القسم أو التخصص الذي لا تريد دخوله في توزيع مقررات التخصص، ويمكنك الضغط مرة أخرى لإعادته.
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, maxHeight: 260, overflow: "auto" }}>
                  {departmentMajorOptions.length ? (
                    departmentMajorOptions.map((item) => {
                      const excluded = excludedDepartmentMajors.includes(item.key);
                      return (
                        <button
                          key={item.key}
                          onClick={() => toggleExcludedDepartmentMajor(item.key)}
                          style={{
                            border: `1px solid ${excluded ? COLORS.danger : COLORS.border}`,
                            background: excluded ? COLORS.dangerBg : "#fff",
                            color: excluded ? COLORS.danger : COLORS.charcoalSoft,
                            borderRadius: 999,
                            padding: "8px 14px",
                            cursor: "pointer",
                            fontWeight: 700,
                          }}
                        >
                          {excluded ? `مستبعد: ${item.label}` : item.label}
                        </button>
                      );
                    })
                  ) : (
                    <span style={{ color: "#94A3B8" }}>ارفع الملف أولًا</span>
                  )}
                </div>
              </div>
            ) : null}

            <div style={{ marginBottom: 16, marginTop: 16, color: COLORS.charcoalSoft }}>
              عدد مقررات التخصص: <strong>{specializedCourses.length}</strong>
            </div>
<div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              <button onClick={() => setCurrentStep(5)} style={cardButtonStyle()}>
                السابق
              </button>
              <button onClick={generateSpecializedSchedule} style={cardButtonStyle({ active: true })}>
                توزيع مقررات التخصص
              </button>
              <button onClick={() => setCurrentStep(7)} style={cardButtonStyle()}>
                التالي
              </button>
            </div>
            <div style={{ overflowX: "auto", marginBottom: 18 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: COLORS.primaryLight }}>
                    {["المقرر", "الرمز", "المدرب", "عدد المتدربين"].map((h) => (
                      <th key={h} style={{ padding: 12, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {specializedCourses.map((course) => (
                    <tr key={course.key}>
                      <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{course.courseName}</td>
                      <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{course.courseCode}</td>
                      <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{course.trainerText}</td>
                      <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{course.studentCount}</td>
                    </tr>
                  ))}
                  {!specializedCourses.length ? (
                    <tr>
                      <td colSpan={4} style={{ padding: 20, textAlign: "center", color: "#94A3B8" }}>
                        لا توجد مقررات تخصص حسب التصنيف الحالي.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            
          </Card>
        )}

{currentStep === 7 && (
  <Card>
    <SectionHeader
      title="تحليل تعارض مقررين محددين"
      description="اختر مقررين لعرض عدد المتدربين المشتركين بينهما مع تفاصيلهم."
    />

  <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 18,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
    
 <div
  style={{
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 14,
    marginBottom: 18,
    overflow: "visible",
  }}
>
  <div style={{ minWidth: 0, overflow: "visible" }}>
    <div style={{ marginBottom: 8, fontWeight: 800 }}>المقرر الأول</div>
    <select
      value={courseAKey}
      onChange={(e) => setCourseAKey(e.target.value)}
      style={{
        ...fieldStyle(),
        width: "100%", maxWidth: 310,
        position: "relative",
        zIndex: 2,
      }}
    >
      <option value="">اختر المقرر الأول</option>
      {parsed.courses.map((course) => (
        <option key={course.key} value={course.key}>
          {course.courseName} - {course.courseCode}
        </option>
      ))}
    </select>
  </div>

  <div style={{ minWidth: 0, overflow: "visible" }}>
    <div style={{ marginBottom: 8, fontWeight: 800 }}>المقرر الثاني</div>
    <select
      value={courseBKey}
      onChange={(e) => setCourseBKey(e.target.value)}
      style={{
        ...fieldStyle(),
        width: "100%", maxWidth: 310,
        position: "relative",
        zIndex: 2,
      }}
    >
      <option value="">اختر المقرر الثاني</option>
      {parsed.courses.map((course) => (
        <option key={course.key} value={course.key}>
          {course.courseName} - {course.courseCode}
        </option>
      ))}
    </select>
  </div>
</div>
    </div>



    {courseAKey && courseBKey && courseAKey === courseBKey ? (
      <div
        style={{
          background: COLORS.warningBg,
          color: COLORS.warning,
          border: `1px solid #FCD34D`,
          borderRadius: 16,
          padding: 14,
          fontWeight: 700,
          marginBottom: 12,
          display: "block",
          width: "fit-content",
        }}
      >
        اختر مقررين مختلفين.
      </div>
    ) : null}

    {selectedCourseA && selectedCourseB && courseAKey !== courseBKey ? (
      <>
        <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 18,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              background: "#fff",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 18,
              padding: 12,
              display: "inline-flex",
              flexDirection: "column",
              alignItems: "flex-start",
              width: "fit-content",
              maxWidth: "100%",
            }}
          >
            <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 6 }}>
              المقرر الأول
            </div>
            <div
              style={{
                fontWeight: 900,
                color: COLORS.charcoal,
                whiteSpace: "normal",
                wordBreak: "break-word",
              }}
            >
              {selectedCourseA.courseName}
            </div>
            <div style={{ marginTop: 4, color: COLORS.primaryDark, fontWeight: 700 }}>
              {selectedCourseA.courseCode}
            </div>
          </div>

          <div
            style={{
              background: "#fff",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 18,
              padding: 12,
              display: "inline-flex",
              flexDirection: "column",
              alignItems: "flex-start",
              width: "fit-content",
              maxWidth: "100%",
            }}
          >
            <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 6 }}>
              المقرر الثاني
            </div>
            <div
              style={{
                fontWeight: 900,
                color: COLORS.charcoal,
                whiteSpace: "normal",
                wordBreak: "break-word",
              }}
            >
              {selectedCourseB.courseName}
            </div>
            <div style={{ marginTop: 4, color: COLORS.primaryDark, fontWeight: 700 }}>
              {selectedCourseB.courseCode}
            </div>
          </div>

          <div
            style={{
              background: COLORS.primaryLight,
              border: `1px solid ${COLORS.primaryBorder}`,
              borderRadius: 18,
              padding: 16,
              display: "inline-flex",
              flexDirection: "column",
              alignItems: "flex-start",
              width: "fit-content",
              maxWidth: "100%",
            }}
          >
            <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 6 }}>
              عدد المتدربين المشتركين
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: COLORS.primaryDark }}>
              {getSelectedPairConflictStudents.length}
            </div>
          </div>
        </div>

        <div
  style={{
    background: COLORS.primaryLight,
    border: `1px solid ${COLORS.primaryBorder}`,
    borderRadius: 12,
    marginBottom: 10,
    padding: "12px 14px",
    fontWeight: 900,
    color: COLORS.primaryDark,
    textAlign: "right",
        display: "flex",
    width: "fit-content",
  }}
>
  تفاصيل المتدربين المتعارضين
</div>
        
        <div
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.border}`,
            borderRadius: 18,
            padding: 12,
                display: "flex",
    width: "fit-content",
           
          }}
        >
         

          {getSelectedPairConflictStudents.length === 0 ? (
            <div style={{ padding: 9, color: COLORS.muted }}>
              لا يوجد متدربون مشتركون بين هذين المقررين.
            </div>
          ) : (
            <div style={{ display: "flex", width: "fit-content",overflowX: "auto" }}>
              <table style={{  borderCollapse: "collapse"}}>
                <thead>
                  <tr style={{ background: "#E8E8E8" }}>
                    <th style={{ padding: 12, borderBottom: `1px solid ${COLORS.border}`, textAlign: "right" }}>م</th>
                    <th style={{ padding: 12, borderBottom: `1px solid ${COLORS.border}`, textAlign: "right" }}>رقم المتدرب</th>
                    <th style={{ padding: 12, borderBottom: `1px solid ${COLORS.border}`, textAlign: "right" }}>اسم المتدرب</th>
                    <th style={{ padding: 12, borderBottom: `1px solid ${COLORS.border}`, textAlign: "right" }}>القسم</th>
                    <th style={{ padding: 12, borderBottom: `1px solid ${COLORS.border}`, textAlign: "right" }}>التخصص</th>
                  </tr>
                </thead>
                <tbody>
                  {getSelectedPairConflictStudents.map((student, index) => {
                    const rowTheme = getTvtcRowTheme(index);

                    return (
                      <tr
                        key={`${student.id}-${index}`}
                        style={{
                          background: rowTheme.bg,
                          transition: "all 0.2s ease",
                          cursor: "default",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = "scale(1.01)";
                          e.currentTarget.style.boxShadow = "0 6px 14px rgba(0,0,0,0.08)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = "scale(1)";
                          e.currentTarget.style.boxShadow = "none";
                        }}
                      >
                        <td
                          style={{
                            padding: 12,
                            borderBottom: `1px solid ${COLORS.border}`,
                            background: rowTheme.bg,
                            fontWeight: 800,
                            color: rowTheme.text,
                            borderRight: `4px solid ${rowTheme.border}`,
                          }}
                        >
                          {index + 1}
                        </td>

                        <td
                          style={{
                            padding: 12,
                            borderBottom: `1px solid ${COLORS.border}`,
                            background: rowTheme.bg,
                            fontWeight: 800,
                            color: rowTheme.text,
                          }}
                        >
                          {student.id || "-"}
                        </td>

                        <td
                          style={{
                            padding: 12,
                            borderBottom: `1px solid ${COLORS.border}`,
                            background: rowTheme.bg,
                            fontWeight: 800,
                            color: rowTheme.text,
                          }}
                        >
                          {student.name || "-"}
                        </td>

                        <td
                          style={{
                            padding: 12,
                            borderBottom: `1px solid ${COLORS.border}`,
                            background: rowTheme.bg,
                            fontWeight: 800,
                            color: rowTheme.text,
                          }}
                        >
                          {student.department || "-"}
                        </td>

                        <td
                          style={{
                            padding: 12,
                            borderBottom: `1px solid ${COLORS.border}`,
                            background: rowTheme.bg,
                            fontWeight: 800,
                            color: rowTheme.text,
                          }}
                        >
                          {student.major || "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>
    ) : (
      <div
        style={{
          background: "#fff",
          border: `1px dashed ${COLORS.primaryBorder}`,
          borderRadius: 18,
          padding: 18,
          color: COLORS.muted,
          display: "block",
          width: "fit-content",
        }}
      >
        اختر مقررين لعرض التعارض بينهما.
      </div>
    )}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
      <button onClick={() => setCurrentStep(6)} style={cardButtonStyle()}>
        السابق
      </button>
      <button onClick={() => setCurrentStep(8)} style={cardButtonStyle({ active: true })}>
        التالي: التعديل اليدوي
      </button>
    </div>
  </Card>
)}
          
        {currentStep === 8 && (
          <div style={{ marginTop: 20 }}>
            <Card>
              <SectionHeader
                title="التعديل اليدوي للجدول"
                description="اسحب المقررات بين الفترات يدويًا، ويمكنك قفل الجدول أو تثبيت بعض المقررات حتى لا تتغير لاحقًا، (يمكن استعراض المقررات غير المجدولة في أسفل الصفحة)."
              />

              {isGeneralStudiesManualEditLocked ? (
                <div
                  style={{
                    marginBottom: 16,
                    border: `1px solid ${COLORS.warning}`,
                    background: COLORS.warningBg,
                    color: COLORS.warning,
                    borderRadius: 16,
                    padding: "12px 14px",
                    lineHeight: 1.8,
                    fontWeight: 700,
                  }}
                >
                  عند تفعيل توزيع التخصصات والأقسام بشكل مستقل، يتم قفل مقررات الدراسات العامة في التعديل اليدوي ولا يمكن نقلها أو تثبيتها أو إعادتها من غير المجدول.
                </div>
              ) : null}

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
                <button
                  type="button"
                  onClick={() => setManualScheduleLocked((prev) => !prev)}
                  style={cardButtonStyle({ active: manualScheduleLocked })}
                >
                  {manualScheduleLocked ? "🔒 الجدول مقفل" : "🔓 التعديل مفتوح"}
                </button>

                <button
                  type="button"
                  onClick={redistributeUnpinnedCourses}
                  style={cardButtonStyle({ disabled: manualScheduleLocked || !schedule.length })}
                  disabled={manualScheduleLocked || !schedule.length}
                >
                  إعادة توزيع غير المثبت فقط
                </button>

                <button
                  type="button"
                  onClick={clearAllPinnedCourses}
                  style={cardButtonStyle({ disabled: !schedule.some((item) => item.isPinned) })}
                  disabled={!schedule.some((item) => item.isPinned)}
                >
                  إلغاء تثبيت الكل
                </button>

            
              </div>

              {!schedule.length ? (
                <div
                  style={{
                    border: `2px dashed ${COLORS.border}`,
                    borderRadius: 22,
                    padding: 26,
                    textAlign: "center",
                    color: COLORS.muted,
                    background: "#F8FEFE",
                  }}
                >
                  أنشئ الجدول أولًا من الصفحات السابقة ثم عد إلى هنا للتعديل اليدوي.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 16 }}>
                  {editableScheduleSlots.map((slot) => (
                    <div
                      key={slot.id}
                      onDragOver={(e) => {
                        if (!manualScheduleLocked && activeDraggedManualCourse) {
                          e.preventDefault();
                          setActiveDropSlotId(slot.id);
                        }
                      }}
                      onDragLeave={() => {
                        if (activeDropSlotId === slot.id) setActiveDropSlotId("");
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggingScheduleItemId) {
                          moveScheduledCourseToSlot(draggingScheduleItemId, slot.id);
                          setDraggingScheduleItemId("");
                        } else if (draggingUnscheduledCourseKey) {
                          placeUnscheduledCourseInSlot(draggingUnscheduledCourseKey, slot.id);
                        }
                        setActiveDropSlotId("");
                      }}
                      style={{
                        border: activeDraggedManualCourse
                          ? manualDropSlotStatusMap.get(slot.id)?.canDrop
                            ? `2px solid ${COLORS.success}`
                            : `2px dashed ${COLORS.danger}`
                          : `1px solid ${COLORS.border}`,
                        borderRadius: 22,
                        overflow: "hidden",
                        background:
                          activeDropSlotId === slot.id
                            ? manualDropSlotStatusMap.get(slot.id)?.canDrop
                              ? "#F0FDF4"
                              : "#FEF2F2"
                            : activeDraggedManualCourse
                            ? manualDropSlotStatusMap.get(slot.id)?.canDrop
                              ? "#FAFFFC"
                              : "#FFF9F9"
                            : "#fff",
                        boxShadow:
                          activeDropSlotId === slot.id
                            ? manualDropSlotStatusMap.get(slot.id)?.canDrop
                              ? "0 0 0 4px rgba(6, 118, 71, 0.12)"
                              : "0 0 0 4px rgba(180, 35, 24, 0.12)"
                            : "none",
                        transition: "all 0.18s ease",
                      }}
                    >
                      <div style={{ background: COLORS.primaryLight, padding: 14, borderBottom: `1px solid ${COLORS.border}` }}>
                        <div style={{ fontWeight: 900, color: COLORS.charcoal }}>
                          {slot.gregorian} — الفترة {slot.period}
                        </div>
                        <div style={{ color: COLORS.muted, marginTop: 4 }}>{slot.timeText}</div>
                        {activeDraggedManualCourse ? (
                          <div
                            style={{
                              marginTop: 8,
                              fontWeight: 800,
                              color: manualDropSlotStatusMap.get(slot.id)?.canDrop ? COLORS.success : COLORS.danger,
                              fontSize: 13,
                            }}
                          >
                            {manualDropSlotStatusMap.get(slot.id)?.canDrop
                              ? "يمكن إسقاط المقرر هنا"
                              : `يوجد ${manualDropSlotStatusMap.get(slot.id)?.conflictCount || 0} ${formatTrainees(manualDropSlotStatusMap.get(slot.id)?.conflictCount || 0)} متعارضين`}
                          </div>
                        ) : null}
                      </div>

                      <div style={{ padding: 14, display: "flex", gap: 10, flexWrap: "wrap", minHeight: 82 }}>
                        {slot.items.length ? (
                          slot.items.map((item) => (
                            <div
                              key={item.instanceId}
                              draggable={!manualScheduleLocked && canEditManualCourse(item)}
                              onDragStart={() => {
                                setDraggingScheduleItemId(item.instanceId);
                                setDraggingUnscheduledCourseKey("");
                              }}
                              onDragEnd={() => {
                                setDraggingScheduleItemId("");
                                setActiveDropSlotId("");
                              }}
                              style={{
                                border: `1px solid ${item.isPinned ? COLORS.primaryDark : COLORS.primaryBorder}`,
                                background: item.isPinned ? "#DFF7F5" : COLORS.primaryLight,
                                color: COLORS.primaryDark,
                                borderRadius: 18,
                                padding: 12,
                                minWidth: 220,
                                cursor: manualScheduleLocked || !canEditManualCourse(item) ? "default" : "grab",
                                opacity: !canEditManualCourse(item) ? 0.72 : 1,
                              }}
                            >
                              <div style={{ fontWeight: 900 }}>{item.courseName}</div>
                              <div style={{ fontSize: 13, marginTop: 4 }}>{item.courseCode} — {item.examHall || "بدون قاعة"}</div>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
                                {!canEditManualCourse(item) ? (
                                  <span style={{ fontSize: 12, fontWeight: 800, color: COLORS.warning }}>مقرر دراسات عامة مقفل</span>
                                ) : null}
                                <button type="button" onClick={() => togglePinScheduledCourse(item.instanceId)} disabled={!canEditManualCourse(item)} style={{ ...cardButtonStyle({ active: !!item.isPinned, disabled: !canEditManualCourse(item) }), padding: "8px 12px", borderRadius: 12 }}>
                                  {item.isPinned ? "إلغاء التثبيت" : "تثبيت"}
                                </button>
                                <button type="button" onClick={() => unscheduleCourseManually(item.instanceId)} style={{ ...cardButtonStyle({ danger: true, disabled: manualScheduleLocked || !canEditManualCourse(item) }), padding: "8px 12px", borderRadius: 12 }} disabled={manualScheduleLocked || !canEditManualCourse(item)}>
                                  نقل إلى غير المجدول
                                </button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <span style={{ color: COLORS.muted }}>اسحب مقررًا إلى هذه الفترة</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div
                style={{
                  marginTop: 18,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 22,
                  padding: 16,
                  background: "#fff",
                }}
              >
                <div style={{ fontWeight: 900, marginBottom: 10 }}>مقررات غير مجدولة</div>
                <div style={{ color: COLORS.muted, marginBottom: 12 }}>يمكنك سحب المقرر غير المجدول وإفلاته فوق أي فترة. ستتلوّن الفترات المناسبة بالأخضر وغير المناسبة بالأحمر.</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {filteredUnscheduledForPreview.length ? (
                    unscheduled.map((course, index) => (
                      <div key={`${course.key}-${index}`} draggable={!manualScheduleLocked && canEditManualCourse(course)} onDragStart={() => {
                        setDraggingUnscheduledCourseKey(course.key);
                        setDraggingScheduleItemId("");
                      }} onDragEnd={() => {
                        setDraggingUnscheduledCourseKey("");
                        setActiveDropSlotId("");
                      }} style={{ border: draggingUnscheduledCourseKey === course.key ? `2px solid ${COLORS.primaryDark}` : `1px solid ${COLORS.border}`, borderRadius: 14, padding: 12, background: draggingUnscheduledCourseKey === course.key ? "#ECFDF5" : "#F8FEFE", minWidth: 220, cursor: manualScheduleLocked || !canEditManualCourse(course) ? "default" : "grab", opacity: !canEditManualCourse(course) ? 0.72 : (draggingUnscheduledCourseKey && draggingUnscheduledCourseKey !== course.key ? 0.7 : 1) }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ fontWeight: 800 }}>{course.courseName}</div>
                          <span
                            style={{
                              background: COLORS.warningBg,
                              border: "1px solid #FED7AA",
                              color: COLORS.warning,
                              borderRadius: 999,
                              padding: "3px 10px",
                              fontSize: 12,
                              fontWeight: 800,
                            }}
                          >
                            {normalizeUnscheduledReason(course).shortLabel}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 4, lineHeight: 1.8 }}>
                          {normalizeUnscheduledReason(course).detail}
                        </div>
                        {!canEditManualCourse(course) ? (
                          <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: COLORS.warning }}>مقرر دراسات عامة مقفل</div>
                        ) : null}
                        <div style={{ marginTop: 8 }}>
                          <button type="button" onClick={() => restoreUnscheduledCourse(course.key)} style={cardButtonStyle({ disabled: manualScheduleLocked || !canEditManualCourse(course) })} disabled={manualScheduleLocked || !canEditManualCourse(course)}>
                            محاولة إعادة الجدولة
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <span style={{ color: COLORS.muted }}>لا توجد مقررات غير مجدولة.</span>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
                <button onClick={() => setCurrentStep(7)} style={cardButtonStyle()}>
                  السابق
                </button>
                <button onClick={() => setCurrentStep(9)} style={cardButtonStyle({ active: true })}>
                  التالي: المعاينة
                </button>
              </div>
            </Card>
          </div>
        )}

        {currentStep === 9 && (
          <>
            <div style={{ marginTop: 20 }}>
              <Card>
                <SectionHeader
                  title="المعاينة"
                  description="اختر تبويب المعاينة المناسب، ويمكنك أيضًا تحديد القسم لتطبيقه على المعاينة والتصدير."
                />

                <div style={{ marginBottom: 12 }}>
                  <div style={{ marginBottom: 8, fontWeight: 800 }}>القسم المطلوب</div>
                  <select
                    value={printDepartmentFilter}
                    onChange={(e) => {
                      setPrintDepartmentFilter(e.target.value);
                      setPrintMajorFilter("__all__");
                      setPreviewPage(0);
                    }}
                    style={{ ...fieldStyle(), maxWidth: 420 }}
                  >
                    <option value="__all__">جميع الأقسام</option>
                    {availableDepartmentsForPrint.map((department) => (
                      <option key={department} value={department}>
                        {department}
                      </option>
                    ))}
                  </select>
                </div>
<div style={{ marginBottom: 12 }}>
  <div style={{ marginBottom: 8, fontWeight: 800 }}>التخصص المطلوب</div>
  <select
    value={printMajorFilter}
    onChange={(e) => {
      setPrintMajorFilter(e.target.value);
      setPreviewPage(0);
    }}
    style={{ ...fieldStyle(), maxWidth: 420 }}
  >
    <option value="__all__">جميع التخصصات</option>
    {availableMajorsForPrint.map((major) => (
      <option key={major} value={major}>
        {major}
      </option>
    ))}
  </select>
</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
                  <button
                    onClick={() => setPreviewTab("sortedCourses")}
                    style={cardButtonStyle({ active: previewTab === "sortedCourses" })}
                  >
                    تعارضات المقررات
                  </button>

                  <button
                    onClick={() => setPreviewTab("schedule")}
                    style={cardButtonStyle({ active: previewTab === "schedule" })}
                  >
                    معاينة جدول الاختبارات
                  </button>

                  <button
                    onClick={() => setPreviewTab("invigilators")}
                    style={cardButtonStyle({ active: previewTab === "invigilators" })}
                  >
                    معاينة جدول المراقبين
                  </button>

                </div>

                <div
                  style={{
                        display: "flex",
                    width: "fit-content",
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 16,
                    padding: 12,
                    background: "#F8FEFE",
                    color: COLORS.muted,
                    lineHeight: 1.9,
                  }}
                >
                  عند اختيار قسم رئيسي محدد، ستتم فلترة المعاينة والطباعة والتصدير وفق هذا القسم،
                  مع ضم مقررات الدراسات العامة المرتبطة به.
                </div>


                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
                  <button onClick={() => setCurrentStep(8)} style={cardButtonStyle()}>
                    السابق
                  </button>
                  <button onClick={() => setCurrentStep(10)} style={cardButtonStyle({ active: true })}>
                    التالي: الطباعة
                  </button>
                </div>
              </Card>
            </div>

            {previewTab === "sortedCourses" && (
              <div style={{ marginTop: 20 }}>
                <Card>
                  <SectionHeader
                    title="المقررات مرتبة حسب عدد المتدربين والتعارضات"
                    description="يعرض المقررات الأعلى من حيث عدد المتدربين وشدة التعارض."
                  />

                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: COLORS.primaryLight }}>
                          {["المقرر", "الرمز", "القسم / التخصص", "المدرب", "عدد المتدربين", "التعارضات"].map((label) => (
                            <th
                              key={label}
                              style={{
                                padding: 12,
                                borderBottom: `1px solid ${COLORS.border}`,
                                textAlign: "right",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSortedCourses.map((course) => (
                          <tr key={course.key}>
                            <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{course.courseName}</td>
                            <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{course.courseCode}</td>
                            <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{course.sectionName}</td>
                            <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{course.trainerText}</td>
                            <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{course.studentCount}</td>
                            <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}><span
  style={{
    cursor: "pointer",
    color: "#147B83",
    fontWeight: "bold",
    textDecoration: "underline",
  }}

  onClick={() =>
    setSelectedConflicts({
      sourceKey: course.key,
      name: `${course.courseName} - ${course.courseCode}`,
      list: getConflictsDetails(course.key),
    })
  }
>
  {course.conflictDegree}
</span></td>
                          </tr>
                        ))}
                        {!filteredSortedCourses.length ? (
                          <tr>
                            <td colSpan={6} style={{ padding: 20, textAlign: "center", color: COLORS.muted }}>
                              لا توجد مقررات مطابقة للقسم المختار.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            )}

            {previewTab === "schedule" && (
              <div style={{ marginTop: 20 }}>
                <Card>
                  <SectionHeader
                    title="جدول الاختبارات النهائي"
                    description="يتضمن التاريخ الميلادي والهجري والقاعات والأقسام والمراقبين لكل فترة."
                  />

                  {filteredScheduleForPrint.length ? (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        flexWrap: "wrap",
                        marginBottom: 16,
                      }}
                    >
                      <button
                        onClick={() => setPreviewPage((prev) => Math.max(prev - 1, 0))}
                        disabled={previewPage === 0}
                        style={cardButtonStyle({ disabled: previewPage === 0 })}
                      >
                        السابق
                      </button>

                      <div style={{ fontWeight: 800, color: COLORS.primaryDark }}>
                        الصفحة {previewPage + 1} من {totalPreviewPages}
                      </div>

                      <button
                        onClick={() => setPreviewPage((prev) => Math.min(prev + 1, totalPreviewPages - 1))}
                        disabled={previewPage >= totalPreviewPages - 1}
                        style={cardButtonStyle({ disabled: previewPage >= totalPreviewPages - 1 })}
                      >
                        التالي
                      </button>
                    </div>
                  ) : null}

                  {filteredHallWarningsForPreview.length ? (
                    <div
                      style={{
                        marginBottom: 18,
                        borderRadius: 18,
                        background: COLORS.dangerBg,
                        border: "1px solid #FECACA",
                        color: COLORS.danger,
                        padding: 14,
                      }}
                    >
                      <div style={{ fontWeight: 900, marginBottom: 8 }}>تنبيهات القاعات</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {filteredHallWarningsForPreview.map((item, index) => (
                          <span
                            key={`${item.courseName}-${index}`}
                            style={{
                              background: "#fff",
                              border: "1px solid #FECACA",
                              borderRadius: 999,
                              padding: "6px 12px",
                              fontSize: 13,
                            }}
                          >
                            {item.courseName} يحتاج قاعة بسعة {item.required}، أكبر سعة قابلة للإسناد فعليًا {item.maxAvailable}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {unscheduled.length ? (
                    <div
                      style={{
                        marginBottom: 18,
                        borderRadius: 18,
                        background: COLORS.warningBg,
                        border: "1px solid #FED7AA",
                        color: COLORS.warning,
                        padding: 14,
                      }}
                    >
                      <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                        <div style={{ fontWeight: 900 }}>مقررات لم يتم جدولة اختبارها</div>
                        <button
                          type="button"
                          onClick={() => setCurrentStep(8)}
                          style={{ ...cardButtonStyle(), padding: "8px 14px", borderRadius: 12 }}
                        >
                          فتح صفحة المعالجة اليدوية
                        </button>
                      </div>
                      <div style={{ color: COLORS.warning, opacity: 0.92, lineHeight: 1.8, marginBottom: 12 }}>
                        {buildUnscheduledSummaryText(filteredUnscheduledForPreview)}
                      </div>
                      <div style={{ display: "grid", gap: 10 }}>
                        {filteredUnscheduledForPreview.map((course) => {
                          const reasonInfo = normalizeUnscheduledReason(course);
                          const breakdownGroups = getUnscheduledReasonBreakdown(course);
                          return (
                            <div
                              key={course.key}
                              style={{
                                background: "#fff",
                                border: "1px solid #FED7AA",
                                borderRadius: 16,
                                padding: 12,
                              }}
                            >
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
                                <div style={{ fontWeight: 900, color: COLORS.text }}>
                                  {course.courseName} <span style={{ color: COLORS.muted, fontWeight: 700 }}>- {course.courseCode}</span>
                                </div>
                                <span
                                  style={{
                                    background: COLORS.warningBg,
                                    border: "1px solid #FED7AA",
                                    color: COLORS.warning,
                                    borderRadius: 999,
                                    padding: "4px 10px",
                                    fontSize: 12,
                                    fontWeight: 800,
                                  }}
                                >
                                  {reasonInfo.shortLabel}
                                </span>
                              </div>
                              <div
                                style={{
                                  marginTop: 8,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 10,
                                  direction: "ltr",
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => toggleExpandedUnscheduledCourse(course.key)}
                                  style={{
                                    border: `1px solid ${COLORS.primaryBorder}`,
                                    background: expandedUnscheduledCourseKeys.includes(course.key)
                                      ? COLORS.primaryLight
                                      : "#fff",
                                    color: COLORS.primaryDark,
                                    borderRadius: 12,
                                    padding: "8px 12px",
                                    fontWeight: 800,
                                    cursor: "pointer",
                                    flexShrink: 0,
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {expandedUnscheduledCourseKeys.includes(course.key)
                                    ? "إخفاء التفاصيل"
                                    : "عرض التفاصيل"}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => toggleExpandedUnscheduledCourse(course.key)}
                                  style={{
                                    background: "transparent",
                                    border: "none",
                                    padding: 0,
                                    color: COLORS.muted,
                                    lineHeight: 1.8,
                                    fontSize: 14,
                                    cursor: "pointer",
                                    textAlign: "right",
                                    width: "100%",
                                    direction: "rtl",
                                  }}
                                >
                                  {reasonInfo.detail}
                                </button>
                              </div>
                              {expandedUnscheduledCourseKeys.includes(course.key) && breakdownGroups.length ? (
                                <div
                                  style={{
                                    marginTop: 10,
                                    display: "grid",
                                    gap: 8,
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: 12,
                                      color: COLORS.muted,
                                      lineHeight: 1.8,
                                    }}
                                  >
                                    اضغط على أي بند لعرض التفاصيل الدقيقة في نافذة مستقلة.
                                  </div>
                                  {breakdownGroups.map((group) => (
                                    <button
                                      type="button"
                                      key={`${course.key}-${group.key}`}
                                      onClick={() => openUnscheduledReasonModal(course, group)}
                                      style={{
                                        width: "100%",
                                        background: "#fff",
                                        border: "1px solid #FED7AA",
                                        borderRadius: 14,
                                        padding: "10px 12px",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        gap: 10,
                                        cursor: "pointer",
                                        textAlign: "right",
                                      }}
                                    >
                                      <div style={{ display: "grid", gap: 4 }}>
                                        <div style={{ fontWeight: 800, color: COLORS.warning }}>
                                          {group.title}
                                        </div>
                                        <div style={{ fontSize: 12, color: COLORS.muted }}>
                                          اضغط لعرض التفاصيل الدقيقة
                                        </div>
                                      </div>
                                      <span
                                        style={{
                                          background: COLORS.warningBg,
                                          border: "1px solid #FED7AA",
                                          color: COLORS.warning,
                                          borderRadius: 999,
                                          padding: "4px 10px",
                                          fontSize: 12,
                                          fontWeight: 800,
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        {group.slots.length} {group.slots.length === 1 ? "فترة" : "فترات"}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {!filteredScheduleForPrint.length ? (
                    <div
                      style={{
                        border: `2px dashed ${COLORS.border}`,
                        borderRadius: 22,
                        padding: 30,
                        textAlign: "center",
                        color: COLORS.muted,
                        background: "#F8FEFE",
                      }}
                    >
                      لا توجد عناصر مطابقة للقسم المختار.
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 18 }}>
                      {paginatedGroupedSchedule.map(([dateISO, items]) => (
                        <div key={dateISO} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 22, overflow: "hidden" }}>
                          <div style={{ background: COLORS.primaryLight, padding: 16, borderBottom: `1px solid ${COLORS.border}` }}>
                            <div style={{ fontWeight: 900, fontSize: 18, color: COLORS.charcoal }}>{items[0].gregorian}</div>
                            <div style={{ marginTop: 4, color: COLORS.charcoalSoft }}>{items[0].hijri}</div>
                          </div>

                          <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <thead>
                                <tr style={{ background: "#fff" }}>
                                  {["الفترة", "الوقت", "اسم المقرر", "الرمز", "قاعة الاختبار", "القسم / التخصص", "المدرب", "عدد المتدربين", "المراقبون"].map((head) => (
                                    <th
                                      key={head}
                                      style={{
                                        padding: 12,
                                        textAlign: "right",
                                        borderBottom: `1px solid ${COLORS.border}`,
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {head}
                                    </th>
                                  ))}
                                </tr>
                              </thead>

                              <tbody>
                                {items.map((item) => {
                                  const periodTheme = getPeriodTheme(item.period);
                                  const cellStyle = {
                                    padding: 12,
                                    borderBottom: `1px solid ${periodTheme.border}`,
                                    background: periodTheme.bg,
                                  };

                                  return (
                                    <tr key={item.instanceId}>
                                      <td style={{ ...cellStyle, fontWeight: 800 }}>
                                        <span
                                          style={{
                                            display: "inline-block",
                                            minWidth: 74,
                                            textAlign: "center",
                                            padding: "6px 10px",
                                            borderRadius: 999,
                                            background: periodTheme.badgeBg,
                                            color: periodTheme.accent,
                                            fontWeight: 900,
                                          }}
                                        >
                                          الفترة {item.period}
                                        </span>
                                      </td>
                                      <td style={cellStyle}>{item.timeText}</td>
                                      <td style={{ ...cellStyle, fontWeight: 700 }}>{item.courseName}</td>
                                      <td style={cellStyle}>{item.courseCode}</td>
                                      <td style={cellStyle}>{item.examHall || "-"}</td>
                                      <td style={cellStyle}>{item.sectionName}</td>
                                      <td style={cellStyle}>{item.trainerText}</td>
                                      <td style={{ ...cellStyle, fontWeight: 800 }}>{item.studentCount}</td>
                                      <td style={cellStyle}>{(item.invigilators || []).join("، ") || "-"}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                </Card>
              </div>
            )}

            {previewTab === "invigilators" && (
              <div style={{ marginTop: 20 }}>
                <Card>
                  <SectionHeader
                    title="جدول المراقبين وفترات المراقبة"
                    description="يعرض كل مراقب والفترات المسندة له بشكل منفصل."
                  />

                  {!invigilatorTable.length ? (
                    <div
                      style={{
                        border: `2px dashed ${COLORS.border}`,
                        borderRadius: 22,
                        padding: 26,
                        textAlign: "center",
                        color: COLORS.muted,
                        background: "#F8FEFE",
                      }}
                    >
                      لا توجد عناصر مطابقة للقسم المختار.
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 16 }}>
                      {invigilatorTable.map((inv) => (
                        <div key={inv.name} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 22, overflow: "hidden" }}>
                          <div
                            style={{
                              background: COLORS.primaryLight,
                              padding: 16,
                              borderBottom: `1px solid ${COLORS.border}`,
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 12,
                              alignItems: "center",
                              flexWrap: "wrap",
                            }}
                          >
                            <div style={{ fontWeight: 900, fontSize: 18, color: COLORS.charcoal }}>{inv.name}</div>
                            <div style={{ color: COLORS.charcoalSoft }}>عدد الفترات: {inv.periodsCount}</div>
                          </div>

                          <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <thead>
                                <tr>
                                  {["التاريخ", "اليوم", "الفترة", "الوقت", "المقرر", "الرمز"].map((head) => (
                                    <th
                                      key={head}
                                      style={{
                                        padding: 12,
                                        textAlign: "right",
                                        borderBottom: `1px solid ${COLORS.border}`,
                                        background: "#fff",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {head}
                                    </th>
                                  ))}
                                </tr>
                              </thead>

                              <tbody>
                                {inv.items.map((item, index) => (
                                  <tr key={`${inv.name}-${index}`}>
                                    <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{item.gregorian}</td>
                                    <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{item.dayName}</td>
                                    <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9", fontWeight: 800 }}>{item.period}</td>
                                    <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{item.timeText}</td>
                                    <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{item.courseName}</td>
                                    <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{item.courseCode}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div
                    style={{
                      marginTop: 14,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 16,
                      padding: 12,
                      background: "#F8FEFE",
                      color: COLORS.muted,
                      lineHeight: 1.8,
                    }}
                  >
                     تظهر أسماء المراقبين يمين الجدول، والأعمدة تمثل الأيام، وتحت كل يوم تظهر الفترات المسندة للمراقب.
                  </div>

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
                    <button onClick={exportInvigilatorsTable} style={cardButtonStyle()}>
                      تصدير جدول المراقبين
                    </button>
                  </div>
                </Card>
              </div>    
            )}
          </>
        )}
        {currentStep === 10 && (
          <div style={{ marginTop: 20 }}>
            <Card>
              <SectionHeader
                title="الطباعة"
                description="اختر نوع الطباعة المناسب، ويمكنك طباعة جدول الاختبارات أو جدول المراقبين أو جدول متدرب واحد."
              />

              <div style={{ marginBottom: 12 }}>
                <div style={{ marginBottom: 8, fontWeight: 800 }}>القسم المطلوب</div>
                <select
                  value={printDepartmentFilter}
                  onChange={(e) => {
                    setPrintDepartmentFilter(e.target.value);
                    setPrintMajorFilter("__all__");
                    setPreviewPage(0);
                  }}
                  style={{ ...fieldStyle(), maxWidth: 420 }}
                >
                  <option value="__all__">جميع الأقسام</option>
                  {availableDepartmentsForPrint.map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ marginBottom: 8, fontWeight: 800 }}>التخصص المطلوب</div>
                <select
                  value={printMajorFilter}
                  onChange={(e) => {
                    setPrintMajorFilter(e.target.value);
                    setPreviewPage(0);
                  }}
                  style={{ ...fieldStyle(), maxWidth: 420 }}
                >
                  <option value="__all__">جميع التخصصات</option>
                  {availableMajorsForPrint.map((major) => (
                    <option key={major} value={major}>
                      {major}
                    </option>
                  ))}
                </select>
              </div>

              <div
                style={{
                       display: "flex",
                  width: "fit-content",
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 16,
                  padding: 12,
                  background: "#F8FEFE",
                  color: COLORS.muted,
                  lineHeight: 1.9,
                  marginBottom: 18,
                }}
              >
                عند اختيار قسم رئيسي محدد، ستتم فلترة الطباعة والتصدير وفق هذا القسم،
                مع ضم مقررات الدراسات العامة المرتبطة به.
              </div>

              <div
                style={{
                  marginBottom: 14,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 18,
                  padding: 14,
                  background: "#fff",
                }}
              >
                <div style={{ marginBottom: 8, fontWeight: 800 }}>طباعة جدول متدرب واحد</div>

                <div style={{ position: "relative" }}>
                  <input
                    value={studentSearchText}
                    onChange={(e) => {
                      const value = e.target.value;
                      setStudentSearchText(value);
                      setSelectedStudentIdForPrint("");
                      setShowStudentSuggestions(true);
                    }}
                    onFocus={() => {
                      if (studentSearchText.trim()) setShowStudentSuggestions(true);
                    }}
                    onBlur={() => {
                      window.setTimeout(() => setShowStudentSuggestions(false), 150);
                    }}
                    placeholder="ابحث باسم المتدرب أو رقمه"
                    style={fieldStyle()}
                  />

                  {showStudentSuggestions && studentSearchText.trim() && (
                    <div
                      style={{
                        position: "absolute",
                        top: "calc(100% + 6px)",
                        right: 0,
                        left: 0,
                        background: "#fff",
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: 16,
                        boxShadow: "0 12px 30px rgba(0,0,0,0.08)",
                        maxHeight: 260,
                        overflowY: "auto",
                        zIndex: 2000,
                      }}
                    >
                      {studentOptionsForPrint
                        .filter((student) => {
                          const q = normalizeArabic(studentSearchText.trim());
                          if (!q) return false;

                          const name = normalizeArabic(student.name || "");
                          const id = normalizeArabic(student.id || "");
                          const label = normalizeArabic(student.label || "");

                          return name.includes(q) || id.includes(q) || label.includes(q);
                        })
                        .slice(0, 12)
                        .map((student) => (
                          <button
                            key={student.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setStudentSearchText(student.label);
                              setSelectedStudentIdForPrint(student.id);
                              setShowStudentSuggestions(false);
                            }}
                            style={{
                              width: "100%",
                              textAlign: "right",
                              border: "none",
                              borderBottom: `1px solid ${COLORS.border}`,
                              background: "#fff",
                              padding: "12px 14px",
                              cursor: "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            <div style={{ fontWeight: 800, color: COLORS.text }}>{student.name}</div>
                            <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 4 }}>
                              {student.id} — {student.department} / {student.major}
                            </div>
                          </button>
                        ))}

                      {!studentOptionsForPrint.some((student) => {
                        const q = normalizeArabic(studentSearchText.trim());
                        if (!q) return false;

                        const name = normalizeArabic(student.name || "");
                        const id = normalizeArabic(student.id || "");
                        const label = normalizeArabic(student.label || "");

                        return name.includes(q) || id.includes(q) || label.includes(q);
                      }) && (
                        <div
                          style={{
                            padding: "12px 14px",
                            color: COLORS.muted,
                            textAlign: "right",
                          }}
                        >
                          لا توجد نتائج
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {selectedStudentInfoForPrint ? (
                  <div style={{ marginTop: 12, color: COLORS.charcoalSoft, lineHeight: 1.8 }}>
                    <strong>{selectedStudentInfoForPrint.name}</strong>
                    {" — "}
                    {selectedStudentInfoForPrint.id}
                    {" — "}
                    {selectedStudentInfoForPrint.department || "-"}
                    {" / "}
                    {selectedStudentInfoForPrint.major || "-"}
                  </div>
                ) : null}

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                  <button
                    onClick={() => {
                      if (!selectedStudentInfoForPrint || !selectedStudentScheduleForPrint.length) {
                        showToast("لا يوجد متدرب", "اختر متدربًا لديه جدول مطبوع.", "error");
                        return;
                      }

                      printSingleStudentSchedule({
                        collegeName: parsed.collegeName,
                        student: selectedStudentInfoForPrint,
                        items: selectedStudentScheduleForPrint,
                        compactMode: compactPrintMode,
                      });
                    }}
                    style={cardButtonStyle({ active: true, disabled: !selectedStudentIdForPrint })}
                    disabled={!selectedStudentIdForPrint}
                  >
                    طباعة جدول المتدرب
                  </button>
                </div>
              </div>

              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 14,
                  padding: "10px 12px",
                  background: "#fff",
                  marginBottom: 12,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={compactPrintMode}
                  onChange={(e) => setCompactPrintMode(e.target.checked)}
                />
                ضغط الطباعة في صفحة واحدة قدر الإمكان
              </label>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
                <button onClick={() => setCurrentStep(9)} style={cardButtonStyle()}>
                  السابق
                </button>

                <button onClick={exportMainSchedule} style={cardButtonStyle()}>
                  تصدير جدول الاختبارات
                </button>

                <button
                  onClick={() =>
                    printScheduleOnlyPdf({
                      collegeName: parsed.collegeName,
                      schedule: filteredScheduleForPrint,
                      periodLabels: parsedPeriods
                        .filter((p) => p.valid)
                        .map((p, index) => ({
                          period: index + 1,
                          label:
                            index === 0
                              ? "الفترة الأولى"
                              : index === 1
                              ? "الفترة الثانية"
                              : `الفترة ${index + 1}`,
                          timeText: p.timeText,
                        })),
                      defaultExamHall: examHalls[0]?.name || "غير محدد",
                      selectedDepartment: printDepartmentFilter,
                      selectedMajor: printMajorFilter,
                      compactMode: compactPrintMode,
                    })
                  }
                  style={cardButtonStyle()}
                >
                  طباعة جدول الاختبارات
                </button>

                <button
                  onClick={() =>
                    printInvigilatorsOnlyPdf({
                      collegeName: parsed.collegeName,
                      invigilatorTable,
                      compactMode: compactPrintMode,
                    })
                  }
                  style={cardButtonStyle()}
                >
                  طباعة جدول المراقبين
                </button>
                 <button onClick={() => setCurrentStep(11)} style={cardButtonStyle({ active: true })}>
        التالي: التصدير وبوابة المتدربين
      </button>
              </div>
            </Card>
          </div>
        )}

        </div>
  
{currentStep === 11 && (
  <Card>
    <SectionHeader
      title="تصدير البيانات العامة واستيرادها وإنشاء بوابة المتدربين"
      description="يمكنك هنا تصدير عملك وإرساله للزملاء، كما يمكن تصدير بيانات المتدربين لبوابة المتدربين الخاصة بالوحدة"
    />

    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 18,
        justifyItems: "start",
      }}
    >
      {/* تصدير واستيراد */}
      <div
        style={{
          ...stepNineCardStyle,
          border: `1px solid ${COLORS.primaryBorder}`,
          background: COLORS.primaryLight,
        }}
      >
        <div style={{ fontSize: 18 }}>📤</div>

        <div style={{ lineHeight: 1.9, width: "100%" }}>
          <strong>تصدير واستيراد البيانات</strong>

          <div>
            يمكن للمستخدم تصدير البيانات بالكامل واستخدامها في جهاز آخر أو إرسالها
            لزميل في الوحدة عن طريق الضغط على خيار تصدير البيانات، ولاستيرادها يتم
            الضغط على زر استيراد البيانات.
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              marginTop: 12,
            }}
          >
            <button style={cardButtonStyle()} onClick={exportSavedSession}>
              تصدير البيانات
            </button>

            <button
              style={cardButtonStyle()}
              onClick={() => importSessionRef.current?.click()}
            >
              استيراد البيانات
            </button>

            <button
              style={cardButtonStyle({ danger: true })}
              onClick={clearSavedState}
            >
              حذف البيانات المحلية
            </button>
          </div>
        </div>
      </div>

      
      {/* تفعيل بوابة المتدربين */}
      <div
        style={{
          ...stepNineCardStyle,
          border: `1px solid ${COLORS.primaryBorder}`,
          background: "#F0FDFB",
        }}
      >
        <div style={{ fontSize: 18 }}>🧭</div>

        <div style={{ lineHeight: 1.9, width: "100%" }}>
          <strong>تفعيل بوابة المتدربين</strong>

          <div>
            يجب التأكد من أن الوحدة الخاصة بك موجودة في المربع الخاص بالتعرف على
            الوحدة تلقائيًا، وفي حال عدم التعرف عليها يمكن اختيار مدينة الوحدة من
            القائمة المنسدلة في مربع تحديد الوحدة.
          </div>
        {/*
          <div style={{ marginTop: 12 }}>
            <select
              value={manualCollegeLocation || autoDetectedCollegeLocation || ""}
              onChange={(e) => setManualCollegeLocation(e.target.value)}
              style={{ ...fieldStyle(), maxWidth: 220 }}
            >
              <option value="">اختر المدينة</option>
              {allCollegeLocations.map((location) => (
                <option key={location} value={location}>
                  {location}
                </option>
              ))}
            </select>
          </div>
*/}
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              marginTop: 12,
            }}
          >
            <button
              type="button"
              onClick={() => {
                if (!effectiveCollegeLocation || !effectiveCollegeSlug) {
                  showToast(
                    "تعذر التصدير",
                    "اختر المدينة أولًا أو تأكد من اسم الوحدة.",
                    "error"
                  );
                  return;
                }

                exportCollegeDataFile({
                  slug: effectiveCollegeSlug,
                  collegeName:
                    parsed.collegeName || collegeNameInput || "الكلية التقنية",
                  schedule: schedule.map((item) => ({
                    ...item,
                    deprivedStudents: Array.from(
                      (Array.isArray(item.students) ? item.students : Array.from(item.students || []))
                        .filter((studentId) =>
                          Boolean(
                            getScheduleItemDeprivationStatus(
                              item,
                              studentId,
                              deprivedCourseStudentStatusMap
                            )
                          )
                        )
                    ),
                  })),
                  parsed,
                  studentInfoMap: preciseStudentInfoMap,
                  selectedDepartment: printDepartmentFilter,
                  selectedMajor: printMajorFilter,
                });

                showToast(
                  "تم التصدير",
                  "تم تصدير بيانات المتدربين بنجاح.",
                  "success"
                );
              }}
              style={cardButtonStyle()}
            >
              تصدير بيانات المتدربين
            </button>
<button
  type="button"
  onClick={() => {
    if (!effectiveCollegeLocation) {
      showToast("تعذر تحديد الوحدة", "اختر المدينة أولًا أو عدّل اسم الوحدة.", "error");
      return;
    }

    if (!baseLink) {
      showToast("تعذر إنشاء الرابط", "تعذر تحديد رمز الوحدة.", "error");
      return;
    }

    navigator.clipboard.writeText(baseLink);
    showToast("تم النسخ", "تم نسخ رابط بوابة المتدربين.", "success");
  }}
  style={cardButtonStyle()}
>
  نسخ رابط بوابة المتدربين
</button>
           
          </div>
        </div>
      </div>

{/* تحديد الوحدة */}
      <div
        style={{
          ...stepNineCardStyle,
          border: `1px solid ${COLORS.border}`,
          background: COLORS.bg2,
        }}
      >
        <div style={{ fontSize: 18 }}>🏫</div>

        <div style={{ width: "100%",  display: "flex", flexDirection: "column", gap: 6}}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>تحديد الوحدة</div>

          {effectiveCollegeLocation ? (
            <div
              style={{
                color: COLORS.success,
                fontWeight: 700,
                marginBottom: 8,
              }}
            >
              تم التعرف على الوحدة: {effectiveCollegeLocation}
              {effectiveCollegeSlug ? ` (${effectiveCollegeSlug})` : ""}
            </div>
          ) : (
            <div
              style={{
                color: COLORS.warning,
                fontWeight: 700,
                marginBottom: 8,
              }}
            >
              تعذر التعرف على الوحدة تلقائيًا. اختر المدينة يدويًا.
            </div>
          )}

          {!detectedCollegeLocation && (
            <select
              value={manualCollegeLocation}
              onChange={(e) => setManualCollegeLocation(e.target.value)}
              style={{ ...fieldStyle(), maxWidth: 220 }}
            >
              <option value="">اختر المدينة</option>
              {allCollegeLocations.map((location) => (
                <option key={location} value={location}>
                  {location}
                </option>
              ))}
            </select>
          )}

          {detectedCollegeLocation && (
            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                onClick={() => setManualCollegeLocation("")}
                style={cardButtonStyle()}
              >
                استخدام التعرف التلقائي
              </button>
            </div>
          )}
        </div>
      </div>
      {/* إرسال الملف */}
      <div
        style={{
          ...stepNineCardStyle,
          border: `1px solid ${COLORS.warningBorder || "#FACC15"}`,
          background: "#FFFBEB",
        }}
      >
        <div style={{ fontSize: 18 }}>📩</div>

        <div style={{ lineHeight: 1.9, width: "100%" }}>
          <strong>إرسال ملف البوابة</strong>

          <div>
            بعد تصدير بيانات المتدربين، سيتم تحميل ملف خاص بالوحدة. لتفعيل بوابة
            المتدربين وتحديث بياناتها، نأمل إرسال الملف بعد كل عملية توزيع على
            البريد التالي:
            <br />
            <span style={{ fontWeight: 700 }}>m.alfayez@tvtc.gov.sa</span>
          </div>
        </div>
      </div>
    </div>

    <br />

    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <button onClick={() => setCurrentStep(10)} style={cardButtonStyle()}>
        السابق
      </button>
    </div>
  </Card>
)}
 
       {selectedUnscheduledReasonModal && (
  <div
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(20,123,131,0.22)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
      zIndex: 9999,
    }}
    onClick={() => setSelectedUnscheduledReasonModal(null)}
  >
    <div
      style={{
        background: "#fff",
        borderRadius: 20,
        padding: 22,
        width: "min(860px, 100%)",
        maxHeight: "78vh",
        overflowY: "auto",
        border: `1px solid ${COLORS.primaryBorder}`,
        boxShadow: "0 20px 50px rgba(20,123,131,0.18)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div>
          <h4 style={{ margin: "0 0 8px", color: COLORS.primaryDark, fontWeight: 900, fontSize: 18 }}>
            {selectedUnscheduledReasonModal.group?.title || "تفاصيل سبب عدم الجدولة"}
          </h4>
          <div style={{ color: COLORS.muted, lineHeight: 1.8 }}>
            <div><strong>المقرر:</strong> {selectedUnscheduledReasonModal.courseName}</div>
            <div><strong>الرمز:</strong> {selectedUnscheduledReasonModal.courseCode || "-"}</div>
            <div><strong>التصنيف الرئيسي:</strong> {selectedUnscheduledReasonModal.shortLabel || "-"}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setSelectedUnscheduledReasonModal(null)}
          style={{
            border: `1px solid ${COLORS.border}`,
            background: "#fff",
            color: COLORS.charcoal,
            borderRadius: 12,
            padding: "8px 12px",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          إغلاق
        </button>
      </div>

      <div
        style={{
          background: COLORS.warningBg,
          border: "1px solid #FED7AA",
          borderRadius: 14,
          padding: 12,
          color: COLORS.text,
          lineHeight: 1.9,
          marginBottom: 14,
        }}
      >
        {selectedUnscheduledReasonModal.reasonDetail}
      </div>

      {!selectedUnscheduledReasonModal.group?.slots?.length ? (
        <p style={{ color: COLORS.muted, margin: 0 }}>لا توجد تفاصيل إضافية لهذا البند.</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {selectedUnscheduledReasonModal.group.slots.map((slot, index) => (
            <div
              key={`${selectedUnscheduledReasonModal.courseKey}-${selectedUnscheduledReasonModal.group.key}-${slot.slotId || `${slot.dateISO}-${slot.period}` || index}`}
              style={{
                border: `1px solid ${COLORS.border}`,
                borderRadius: 14,
                padding: 12,
                background: "#fff",
              }}
            >
              <div style={{ fontWeight: 800, color: COLORS.primaryDark, marginBottom: 8 }}>
                {formatSlotBadgeLabel(slot)}
              </div>
              <div style={{ display: "grid", gap: 6, color: COLORS.text, fontSize: 14, lineHeight: 1.8 }}>
                {slot.reason ? <div><strong>السبب:</strong> {slot.reason}</div> : null}
                {slot.summary ? <div><strong>الملخص:</strong> {slot.summary}</div> : null}
                {Array.isArray(slot.hallMessages) && slot.hallMessages.length ? (
                  <div>
                    <strong>تفاصيل القاعات:</strong>
                    <ul style={{ margin: "6px 0 0", paddingRight: 18 }}>
                      {slot.hallMessages.map((message, messageIndex) => (
                        <li key={`${messageIndex}-${message}`}>{message}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {Array.isArray(slot.availableInvigilators) && slot.availableInvigilators.length ? (
                  <div><strong>المراقبون المتاحون:</strong> {slot.availableInvigilators.join("، ")}</div>
                ) : null}
                {Array.isArray(slot.blockingStudents) ? (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ fontWeight: 800, marginBottom: 8, color: COLORS.charcoal }}>
                      المتدربون المتعارضون
                    </div>
                    {slot.blockingStudents.length ? (
                      <div
                        style={{
                          overflowX: "auto",
                          border: `1px solid ${COLORS.border}`,
                          borderRadius: 12,
                          background: "#F8FAFC",
                        }}
                      >
                        <table
                          style={{
                            width: "100%",
                            borderCollapse: "collapse",
                            tableLayout: "fixed",
                            background: "#fff",
                          }}
                        >
                          <thead>
                            <tr style={{ background: COLORS.primaryLight }}>
                              <th style={{ border: `1px solid ${COLORS.border}`, padding: "10px 8px", width: 56 }}>#</th>
                              <th style={{ border: `1px solid ${COLORS.border}`, padding: "10px 8px" }}>اسم المتدرب</th>
                              <th style={{ border: `1px solid ${COLORS.border}`, padding: "10px 8px", width: 120 }}>الرقم</th>
                              <th style={{ border: `1px solid ${COLORS.border}`, padding: "10px 8px" }}>القسم</th>
                              <th style={{ border: `1px solid ${COLORS.border}`, padding: "10px 8px" }}>التخصص</th>
                            </tr>
                          </thead>
                          <tbody>
                            {slot.blockingStudents.map((student, studentIndex) => (
                              <tr key={`${student?.id || student?.name || "student"}-${studentIndex}`}>
                                <td style={{ border: `1px solid ${COLORS.border}`, padding: "8px 8px", textAlign: "center", fontWeight: 700 }}>
                                  {studentIndex + 1}
                                </td>
                                <td style={{ border: `1px solid ${COLORS.border}`, padding: "8px 8px" }}>
                                  {student?.name || "-"}
                                </td>
                                <td style={{ border: `1px solid ${COLORS.border}`, padding: "8px 8px", textAlign: "center" }}>
                                  {student?.id || "-"}
                                </td>
                                <td style={{ border: `1px solid ${COLORS.border}`, padding: "8px 8px" }}>
                                  {student?.department || "-"}
                                </td>
                                <td style={{ border: `1px solid ${COLORS.border}`, padding: "8px 8px" }}>
                                  {student?.major || "-"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div
                        style={{
                          border: `1px dashed ${COLORS.border}`,
                          borderRadius: 12,
                          padding: 12,
                          background: "#fff",
                          color: COLORS.muted,
                        }}
                      >
                        لا توجد أسماء متدربين محفوظة لهذا التعارض في هذه الفترة.
                      </div>
                    )}
                  </div>
                ) : null}
                {slot.requiredInvigilatorsCount != null ? <div><strong>المراقبون المطلوبون:</strong> {slot.requiredInvigilatorsCount}</div> : null}
                {slot.availableInvigilatorsCount != null ? <div><strong>المراقبون المتاحون فعليًا:</strong> {slot.availableInvigilatorsCount}</div> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
)}

{selectedConflicts && (
  <div
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(20,123,131,0.22)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
      zIndex: 9999,
    }}
    onClick={() => setSelectedConflicts(null)}
  >
    <div
      style={{
        background: `linear-gradient(135deg, ${COLORS.primaryLight} 0%, #ffffff 100%)`,
        borderRadius: 20,
        padding: 22,
        width: "min(760px, 100%)",
        maxHeight: "78vh",
        overflowY: "auto",
        border: `1px solid ${COLORS.primaryBorder}`,
        boxShadow: "0 20px 50px rgba(20,123,131,0.25)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <h4
        style={{
          margin: "0 0 12px",
          color: COLORS.primaryDark,
          fontWeight: 900,
          fontSize: 18,
        }}
      >
        المقررات المتعارضة مع:
        <br />
        <span style={{ color: COLORS.charcoal }}>{selectedConflicts.name}</span>
      </h4>

      {selectedConflicts.list.length === 0 ? (
        <p style={{ color: COLORS.muted, margin: 0 }}>لا يوجد تعارض</p>
      ) : (
        <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {selectedConflicts.list.map((item, i) => (
            <li
              key={item.key}
              style={{
                marginBottom: 8,
                background: "#fff",
                borderRadius: 12,
                padding: "10px 12px",
                border: `1px solid ${COLORS.border}`,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                <span
                  style={{
                    background: COLORS.primaryDark,
                    color: "#fff",
                    borderRadius: "50%",
                    width: 24,
                    height: 24,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: "bold",
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setSelectedConflictStudents({
                      courseName: selectedConflicts.name,
                      conflictName: item.name,
                      students: getConflictStudentsDetails(selectedConflicts.sourceKey, item.key),
                    })
                  }
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    margin: 0,
                    cursor: "pointer",
                    color: COLORS.charcoal,
                    fontWeight: 700,
                    textAlign: "right",
                    flex: 1,
                    minWidth: 0,
                  }}
                  title="عرض المتدربين المشتركين"
                >
                  {item.name}
                </button>
              </div>

            <span
  style={{
    background:
      item.sharedCount > 10
        ? "#FEE2E2"
        : COLORS.primaryLight,

    color:
      item.sharedCount > 10
        ? "#B91C1C"
        : COLORS.primaryDark,

    borderRadius: 999,
    padding: "4px 10px",
    fontWeight: 800,
    minWidth: 90,
    textAlign: "center",
    flexShrink: 0,
  }}
>
                {item.sharedCount} {formatTrainees(item.sharedCount)}
              </span>
            </li>
          ))}
        </ol>
      )}

      <button
        onClick={() => setSelectedConflicts(null)}
        style={{
          marginTop: 14,
          padding: "8px 14px",
          borderRadius: 10,
          border: "none",
          background: COLORS.primaryDark,
          color: "#fff",
          cursor: "pointer",
          fontWeight: 700,
          width: "100%",
        }}
      >
        إغلاق
      </button>
    </div>
  </div>
)}
      
{selectedManualMoveConflicts && (
  <div
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(20,123,131,0.18)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
      zIndex: 10000,
    }}
    onClick={() => setSelectedManualMoveConflicts(null)}
  >
    <div
      style={{
        background: "#fff",
        borderRadius: 20,
        padding: 22,
        width: "min(900px, 100%)",
        maxHeight: "78vh",
        overflowY: "auto",
        border: `1px solid ${COLORS.primaryBorder}`,
        boxShadow: "0 20px 50px rgba(20,123,131,0.18)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <h4 style={{ margin: "0 0 8px", color: COLORS.primaryDark, fontWeight: 900, fontSize: 18 }}>
        تفاصيل تعذر النقل
      </h4>
      <div style={{ color: COLORS.muted, lineHeight: 1.9, marginBottom: 14 }}>
        <div><strong>المقرر المراد نقله:</strong> {selectedManualMoveConflicts.sourceCourseName} {selectedManualMoveConflicts.sourceCourseCode ? `- ${selectedManualMoveConflicts.sourceCourseCode}` : ""}</div>
        <div><strong>الفترة المستهدفة:</strong> {selectedManualMoveConflicts.targetSlot.dayName} — الفترة {selectedManualMoveConflicts.targetSlot.period}</div>
        <div><strong>إجمالي المتدربين المتعارضين:</strong> {selectedManualMoveConflicts.totalShared} {formatTrainees(selectedManualMoveConflicts.totalShared)}</div>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {selectedManualMoveConflicts.conflicts.map((conflict, index) => {
          const rowTheme = getTvtcRowTheme(index);
          return (
            <div
              key={`${conflict.courseKey}-${index}`}
              style={{
                background: rowTheme.bg,
                border: `1px solid ${rowTheme.border}`,
                borderRadius: 16,
                padding: 14,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 900, color: COLORS.primaryDark }}>{conflict.courseName}</div>
                  <div style={{ color: COLORS.muted, marginTop: 4 }}>
                    {conflict.courseCode ? `الرمز: ${conflict.courseCode}` : ""}
                    {conflict.examHall ? `${conflict.courseCode ? " — " : ""}القاعة: ${conflict.examHall}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span
                    style={{
                      background: "rgba(255,255,255,0.72)",
                      border: `1px solid ${rowTheme.border}`,
                      color: COLORS.primaryDark,
                      borderRadius: 999,
                      padding: "6px 12px",
                      fontWeight: 900,
                    }}
                  >
                    {conflict.sharedCount} {formatTrainees(conflict.sharedCount)}
                  </span>
                  <button
                    onClick={() =>
                      setSelectedConflictStudents({
                        courseName: selectedManualMoveConflicts.sourceCourseName,
                        conflictName: `${conflict.courseName}${conflict.courseCode ? ` - ${conflict.courseCode}` : ""}`,
                        students: conflict.students,
                      })
                    }
                    style={{ ...cardButtonStyle({ active: true }), padding: "8px 14px" }}
                  >
                    عرض البيانات
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => setSelectedManualMoveConflicts(null)}
        style={{
          marginTop: 14,
          padding: "8px 14px",
          borderRadius: 10,
          border: "none",
          background: COLORS.primaryDark,
          color: "#fff",
          cursor: "pointer",
          fontWeight: 700,
          width: "100%",
        }}
      >
        إغلاق
      </button>
    </div>
  </div>
)}

{selectedConflictStudents && (
  <div
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(20,123,131,0.18)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
      zIndex: 10000,
    }}
    onClick={() => setSelectedConflictStudents(null)}
  >
    <div
      style={{
        background: "#fff",
        borderRadius: 20,
        padding: 22,
        width: "min(860px, 100%)",
        maxHeight: "78vh",
        overflowY: "auto",
        border: `1px solid ${COLORS.primaryBorder}`,
        boxShadow: "0 20px 50px rgba(20,123,131,0.18)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <h4 style={{ margin: "0 0 8px", color: COLORS.primaryDark, fontWeight: 900, fontSize: 18 }}>
        المتدربون المشتركون
      </h4>
      <div style={{ color: COLORS.muted, lineHeight: 1.8, marginBottom: 14 }}>
        <div><strong>المقرر الأساسي:</strong> {selectedConflictStudents.courseName}</div>
        <div><strong>المقرر المتعارض:</strong> {selectedConflictStudents.conflictName}</div>
        <div><strong>عدد المتدربين:</strong> {selectedConflictStudents.students.length} {formatTrainees(selectedConflictStudents.students.length)}</div>
      </div>

      {!selectedConflictStudents.students.length ? (
        <p style={{ color: COLORS.muted, margin: 0 }}>لا يوجد متدربين مشتركين.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: COLORS.primaryLight }}>
                {['م','رقم المتدرب','اسم المتدرب','القسم','التخصص'].map((label) => (
                  <th
                    key={label}
                    style={{ padding: 12, borderBottom: `1px solid ${COLORS.border}`, textAlign: 'right', whiteSpace: 'nowrap' }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {selectedConflictStudents.students.map((student, index) => {
                const rowTheme = getTvtcRowTheme(index);

                return (
                  <tr
                    key={`${student.id}-${index}`}
                    style={{
                      background: rowTheme.bg,
                      transition: "all 0.2s ease",
                      cursor: "default",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "scale(1.01)";
                      e.currentTarget.style.boxShadow = "0 6px 14px rgba(0,0,0,0.08)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "scale(1)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  >
                    <td
                      style={{
                        padding: 12,
                        borderBottom: `1px solid ${COLORS.border}`,
                        background: rowTheme.bg,
                        fontWeight: 800,
                        color: rowTheme.text,
                        borderRight: `4px solid ${rowTheme.border}`,
                      }}
                    >
                      {index + 1}
                    </td>
                    <td style={{ padding: 12, borderBottom: `1px solid ${COLORS.border}`, background: rowTheme.bg, fontWeight: 700 }}>
                      {student.id || "-"}
                    </td>
                    <td style={{ padding: 12, borderBottom: `1px solid ${COLORS.border}`, background: rowTheme.bg, fontWeight: 800, color: rowTheme.text }}>
                      {student.name || "-"}
                    </td>
                    <td style={{ padding: 12, borderBottom: `1px solid ${COLORS.border}`, background: rowTheme.bg }}>
                      {student.department || "-"}
                    </td>
                    <td style={{ padding: 12, borderBottom: `1px solid ${COLORS.border}`, background: rowTheme.bg, fontWeight: 700, color: rowTheme.text }}>
                      {student.major || "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <button
        onClick={() => setSelectedConflictStudents(null)}
        style={{
          marginTop: 14,
          padding: "8px 14px",
          borderRadius: 10,
          border: "none",
          background: COLORS.primaryDark,
          color: "#fff",
          cursor: "pointer",
          fontWeight: 700,
          width: "100%",
        }}
      >
        إغلاق
      </button>
    </div>
  </div>
)}
    </div>
  );
}
