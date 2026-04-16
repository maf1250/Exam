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

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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

  return Math.max(
    ...allowedHalls.map((hall) => {
      const cap = Number(hall.capacity);
      return Number.isFinite(cap) ? cap : 0;
    })
  );
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
      };
    })
    .filter((hall) => hall.name && hall.capacity > 0);
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

function StatBox({ label, value }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 22,
        padding: 18,
        border: `1px solid ${COLORS.border}`,
        boxShadow: "0 8px 24px rgba(20, 123, 131, 0.06)",
      }}
    >
      <div style={{ fontSize: 14, color: COLORS.charcoalSoft, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color: COLORS.primaryDark }}>{value}</div>
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

      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
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
      width: 34px;
    }

    .course-cell {
      width: 150px;
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
  defaultExamHall = "قاعة النشاط",
  selectedDepartment = "__all__",
  selectedMajor = "__all__",
  compactMode = false,
}) {
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

    return matches.map((item) => `الفترة ${item.period}`).join("<br />");
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
                        <div>${day.dayName}</div>
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
  .map(
    (item, index) => `
      <tr style="
        background:${getDayTheme(item.dayName).bg};
        color:${getDayTheme(item.dayName).text};
      ">
        <td>${index + 1}</td>
        <td>${item.courseName || ""}</td>
        <td>${item.courseCode || ""}</td>
        <td>${item.dayName || ""}</td>
        <td>${item.gregorian || ""}</td>
        <td>${item.hijriNumeric || ""}</td>
        <td>${item.period || ""}</td>
        <td>${item.timeText || ""}</td>
        <td>${item.examHall || ""}</td>
      </tr>
    `
  )
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
                <th>المقرر</th>
                <th>الرمز</th>
                <th>اليوم</th>
                <th>التاريخ الميلادي</th>
                <th>التاريخ الهجري</th>
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

export default function AdminPage() {
  const fileRef = useRef(null);
  const topRef = useRef(null);
const pendingRestoreRef = useRef(null);
  const toastTimerRef = useRef(null);
  
  const [selectedConflicts, setSelectedConflicts] = useState(null);
  const [selectedConflictStudents, setSelectedConflictStudents] = useState(null);
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
  const [periodsText, setPeriodsText] = useState("07:45-09:00\n09:15-11:00");
  const [examHalls, setExamHalls] = useState([
  {
    id: makeHallId(),
    name: "",
    capacity: "",
    allowAllDepartments: true,
    allowedDepartments: [],
  },
]);

const [hallWarnings, setHallWarnings] = useState([]);

  function addExamHall() {
    setExamHalls((prev) => [
      ...prev,
      {
        id: makeHallId(),
        name: "",
        capacity: "",
        allowAllDepartments: true,
        allowedDepartments: [],
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

  const normalizedExamHalls = useMemo(() => {
    return (examHalls || [])
      .map((hall) => {
        const cap = Number(hall.capacity);

        return {
          ...hall,
          name: String(hall.name || "").trim(),
          capacity: Number.isFinite(cap) ? cap : 0,
          allowedDepartments: normalizeDepartmentList(hall.allowedDepartments),
        };
      })
      .filter((hall) => hall.name && hall.capacity > 0);
  }, [examHalls]);

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
  const [excludedDepartmentMajors, setExcludedDepartmentMajors] = useState([]);
  const [lockGeneralStudiesStep, setLockGeneralStudiesStep] = useState(false);
  const [printDepartmentFilter, setPrintDepartmentFilter] = useState("__all__");
  const [avoidSameLevelSameDay, setAvoidSameLevelSameDay] = useState(false);
  const [courseLevels, setCourseLevels] = useState({});
  const [draggingCourseKey, setDraggingCourseKey] = useState("");
  const [preferCourseTrainerInvigilation, setPreferCourseTrainerInvigilation] = useState(true);
  const [printMajorFilter, setPrintMajorFilter] = useState("__all__");
  const [generalSchedule, setGeneralSchedule] = useState([]);
  const [specializedSchedule, setSpecializedSchedule] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [unscheduled, setUnscheduled] = useState([]);
  const [pendingRestore, setPendingRestore] = useState(null);
  const [didRestore, setDidRestore] = useState(false);
  const [storageMode, setStorageMode] = useState("localStorage");
  const [pageVisible, setPageVisible] = useState(true);


  function addExamHall() {
    setExamHalls((prev) => [
      ...prev,
      {
        id: makeHallId(),
        name: "",
        capacity: "",
        allowAllDepartments: true,
        allowedDepartments: [],
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
const serializeScheduleItem = (item) => ({
  ...item,
  students: Array.isArray(item.students)
    ? item.students
    : Array.from(item.students || []),
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
  students: Array.isArray(item.students) ? item.students : [],
});

  const formatTrainees = (n) => {
  if (n === 1) return "متدرب";
  if (n >= 2 && n <= 10) return "متدربين";
  return "متدرب";
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
  currentStep,
  startDate,
  numberOfDays,
  selectedDays,
  periodsText,
  examHalls,
  hallWarnings,
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
  setCurrentStep(saved.currentStep || 1);
  setStartDate(saved.startDate || "");
  setNumberOfDays(saved.numberOfDays || 8);
  setSelectedDays(saved.selectedDays || ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"]);
  setPeriodsText(saved.periodsText || "07:45-09:00\n09:15-11:00");
  setExamHalls(
    Array.isArray(saved.examHalls) && saved.examHalls.length
      ? saved.examHalls
      : [
          {
            id: makeHallId(),
            name: "",
            capacity: "",
            allowAllDepartments: true,
            allowedDepartments: [],
          },
        ]
  );
  setHallWarnings(Array.isArray(saved.hallWarnings) ? saved.hallWarnings : []);
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
  setExcludedDepartmentMajors(saved.excludedDepartmentMajors || []);
  setLockGeneralStudiesStep(saved.lockGeneralStudiesStep ?? false);
  setPrintDepartmentFilter(saved.printDepartmentFilter || "__all__");
  setPrintMajorFilter(saved.printMajorFilter || "__all__");
  setAvoidSameLevelSameDay(saved.avoidSameLevelSameDay ?? false);
  setCourseLevels(saved.courseLevels || {});
  setPreferCourseTrainerInvigilation(saved.preferCourseTrainerInvigilation ?? true);
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
  periodsText,
  examHalls,
  hallWarnings,
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
  downloadFile(
    `exam-session-${(fileName || "technical-college").replace(/\.[^.]+$/, "")}.json`,
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
  if (clean && clean !== normalizeArabic("الدراسات العامة")) {
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
  }, [rows, excludeInactive, excludedCourses, collegeNameInput, includeAllDepartmentsAndMajors, excludedDepartmentMajors]);

const getStudentNameFromRow = (row) =>
  String(
    row["إسم المتدرب"] ??
    row["اسم المتدرب"] ??
    row["اسم المتدرب "] ??
    ""
  ).trim();
  
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
  )
    .filter(
      (d) => normalizeArabic(d) !== normalizeArabic("الدراسات العامة")
    )
    .sort((a, b) => a.localeCompare(b, "ar"));
}, [parsed]);
  
const detectedCollegeLocation = useMemo(() => {
  const sourceName =
    String(parsed?.collegeName || "").trim() ||
    String(collegeNameInput || "").trim();

  return resolveLocationName(sourceName);
}, [parsed?.collegeName, collegeNameInput]);

const effectiveCollegeLocation = manualCollegeLocation || detectedCollegeLocation || "";

const effectiveCollegeSlug = useMemo(
  () => resolveLocationSlug(effectiveCollegeLocation, detectedGender),
  [effectiveCollegeLocation, detectedGender]
);


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

        setRows(cleanRows);
        setCollegeNameInput(cleanRows[0]?.["الوحدة"] || "");
        setSchedule([]);
        setGeneralSchedule([]);
        setSpecializedSchedule([]);
        setUnscheduled([]);
        setHallWarnings([]);
        setExcludedCourses(getDefaultExcludedPracticalCourseKeys(cleanRows));
        setIncludeAllDepartmentsAndMajors(true);
        setExcludedDepartmentMajors([]);
        setLockGeneralStudiesStep(false);
        setCourseLevels({});
        setPreviewPage(0);
        setPreviewTab("sortedCourses");
        setSelectedStudentIdForPrint("");
        setCompactPrintMode(false);
        setCurrentStep(1);
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

  const specializedCourses = useMemo(() => {
    const keys = new Set(generalCourses.map((c) => c.key));
    return parsed.courses.filter((course) => !keys.has(course.key));
  }, [parsed.courses, generalCourses]);

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

  const unassignedLevelCourses = useMemo(
    () =>
      allCourseOptions.filter(
        (course) => !excludedCourses.includes(course.key) && !courseLevels[course.key]
      ),
    [allCourseOptions, courseLevels, excludedCourses]
  );

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
    showToast("لا يوجد ملف", "ارفع ملف CSV أولاً.", "error");
    return [];
  }

  if (parsed.missingColumns.length) {
    showToast("أعمدة ناقصة", `الملف ينقصه: ${parsed.missingColumns.join("، ")}`, "error");
    return [];
  }

  if (invalidPeriods.length) {
    showToast("أوقات غير صحيحة", "تحقق من تنسيق الأوقات. مثال صحيح: 07:45-09:00", "error");
    return [];
  }

  if (!slots.length) {
    showToast("لا توجد فترات", "اختر تاريخ بداية وأيامًا وعدد أيام مناسبًا مع أوقات صحيحة.", "error");
    return [];
  }

  const hallsPool = normalizedExamHalls.length
    ? normalizedExamHalls
    : [{
        id: "default-hall",
        name: "قاعة النشاط",
        capacity: Number.MAX_SAFE_INTEGER,
        allowAllDepartments: true,
        allowedDepartments: [],
      }];

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

  const studentSlotMap = new Map();
  const studentDayMap = new Map();
  const slotCoursesMap = new Map(slots.map((slot) => [slot.id, []]));
  const invigilatorLoad = new Map(invigilatorPool.map((name) => [name, 0]));
  const invigilatorBusyPeriods = new Map(invigilatorPool.map((name) => [name, new Set()]));
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

    (item.invigilators || []).forEach((name) => {
      if (!invigilatorLoad.has(name)) invigilatorLoad.set(name, 0);
if (!invigilatorBusyPeriods.has(name)) invigilatorBusyPeriods.set(name, new Set());

invigilatorLoad.set(name, (invigilatorLoad.get(name) || 0) + 1);
invigilatorBusyPeriods.get(name).add(periodKey);
    });
  });



const getMinInvigilatorLoad = () => {
  const values = Array.from(invigilatorLoad.values());
  return values.length ? Math.min(...values) : 0;
};
const rankInvigilatorForFairness = (name, preferTrainer = false) => {
  const load = invigilatorLoad.get(name) || 0;
  const minLoad = getMinInvigilatorLoad();

  // عقوبة كبيرة إذا تجاوز الأدنى بأكثر من 1
  const overloadPenalty = load > minLoad + 1 ? 1000 : 0;

  // أفضلية بسيطة جدًا لمدرب المقرر بدون كسر العدالة
  const trainerBonus = preferTrainer ? -0.15 : 0;

  return load + overloadPenalty + trainerBonus;
};

const pickInvigilators = (course, slot) => {
  if (!includeInvigilators) return [];

  const requiredCount = getRequiredInvigilatorsCount(course);
  const periodKey = getSlotPeriodKey(slot);
  const chosen = [];

  const courseTrainerNames = course.trainerText
    .split("/")
    .map((name) => name.trim())
    .filter(Boolean);

  const normalizedTrainerSet = new Set(
    courseTrainerNames.map((name) => normalizeArabic(name))
  );

  const availableCandidates = invigilatorPool
    .filter((name) => !excludedInvigilators.some((ex) => normalizeArabic(ex) === normalizeArabic(name)))
    .filter((name) => !invigilatorBusyPeriods.get(name)?.has(periodKey));

  // المرحلة 1: نختار فقط من ضمن من هم داخل هامش العدالة
  while (chosen.length < requiredCount) {
    const minLoad = getMinInvigilatorLoad();

    const fairCandidates = availableCandidates
      .filter((name) => !chosen.includes(name))
      .filter((name) => (invigilatorLoad.get(name) || 0) <= minLoad + 1)
      .sort((a, b) => {
        const aScore = rankInvigilatorForFairness(
          a,
          preferCourseTrainerInvigilation && normalizedTrainerSet.has(normalizeArabic(a))
        );
        const bScore = rankInvigilatorForFairness(
          b,
          preferCourseTrainerInvigilation && normalizedTrainerSet.has(normalizeArabic(b))
        );

        return aScore - bScore || a.localeCompare(b, "ar");
      });

    if (!fairCandidates.length) break;

    chosen.push(fairCandidates[0]);
  }

  // المرحلة 2: إذا لم يكتمل العدد، نكمل من الأقل حملًا مهما كان
  if (chosen.length < requiredCount) {
    const fallbackCandidates = availableCandidates
      .filter((name) => !chosen.includes(name))
      .sort((a, b) => {
        const aLoad = invigilatorLoad.get(a) || 0;
        const bLoad = invigilatorLoad.get(b) || 0;

        const aTrainer = preferCourseTrainerInvigilation && normalizedTrainerSet.has(normalizeArabic(a));
        const bTrainer = preferCourseTrainerInvigilation && normalizedTrainerSet.has(normalizeArabic(b));

        return (
          aLoad - bLoad ||
          Number(bTrainer) - Number(aTrainer) ||
          a.localeCompare(b, "ar")
        );
      });

    for (const name of fallbackCandidates) {
      if (chosen.length >= requiredCount) break;
      chosen.push(name);
    }
  }

  chosen.forEach((name) => {
    if (!invigilatorBusyPeriods.has(name)) {
      invigilatorBusyPeriods.set(name, new Set());
    }

    invigilatorLoad.set(name, (invigilatorLoad.get(name) || 0) + 1);
    invigilatorBusyPeriods.get(name).add(periodKey);
  });

  return chosen;
};
  const scoreSlot = (course, slot) => {
    let hardConflict = false;
    let sameDayPenalty = 0;
    const courseLevel = courseLevels[course.key] || "";
    const slotLoadPenalty = (slotCoursesMap.get(slot.id)?.length || 0) * 6;
    const periodKey = getSlotPeriodKey(slot);
    const requiredInvigilators = includeInvigilators ? getRequiredInvigilatorsCount(course) : 0;

    course.students.forEach((studentId) => {
      const usedSlots = studentSlotMap.get(studentId) || new Set();
      if (usedSlots.has(slot.id)) hardConflict = true;

      const dayMap = studentDayMap.get(studentId) || new Map();
      const sameDayCount = dayMap.get(slot.dateISO) || 0;

      if (sameDayCount >= 2) hardConflict = true;
      if (sameDayCount === 1) sameDayPenalty += 4;
    });

    if (!hardConflict && avoidSameLevelSameDay && courseLevel) {
      const sameDateSameLevelExists = [...basePlaced, ...newPlaced].some(
        (item) => item.dateISO === slot.dateISO && courseLevels[item.key] === courseLevel
      );
      if (sameDateSameLevelExists) hardConflict = true;
    }

    if (hardConflict) return Number.POSITIVE_INFINITY;

    let score = slotLoadPenalty + sameDayPenalty;

    if (includeInvigilators) {
      const availableInvigilatorsCount = invigilatorPool.filter(
        (name) => !invigilatorBusyPeriods.get(name)?.has(periodKey)
      ).length;

      if (availableInvigilatorsCount < requiredInvigilators) {
        score += (requiredInvigilators - availableInvigilatorsCount) * 50;
      }
    }

    const usedHallNamesInSlot = [...basePlaced, ...newPlaced]
      .filter((item) => resolveScheduledSlotId(item) === slot.id)
      .map((item) => item.examHall)
      .filter(Boolean);

   const matchingHallCount = hallsPool.filter(
  (hall) =>
    !usedHallNamesInSlot.includes(hall.name) &&
    isHallValidForCourse(hall, course)
).length;

if (!matchingHallCount) {
  return Number.POSITIVE_INFINITY;
}

    return score;
  };

  const sortedCoursesForInvigilation = [...coursesList].sort((a, b) => {
  const aNeed = getRequiredInvigilatorsCount(a);
  const bNeed = getRequiredInvigilatorsCount(b);

  return (
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
      notPlaced.push(course);
      return;
    }

    course.students.forEach((studentId) => {
      if (!studentSlotMap.has(studentId)) studentSlotMap.set(studentId, new Set());
      studentSlotMap.get(studentId).add(bestSlot.id);

      if (!studentDayMap.has(studentId)) studentDayMap.set(studentId, new Map());
      const dayMap = studentDayMap.get(studentId);
      dayMap.set(bestSlot.dateISO, (dayMap.get(bestSlot.dateISO) || 0) + 1);
    });

    const usedHallNamesInSlot = [...basePlaced, ...newPlaced]
      .filter((item) => resolveScheduledSlotId(item) === bestSlot.id)
      .map((item) => item.examHall)
      .filter(Boolean);

    const fittingHalls = hallsPool.filter(
  (hall) =>
    !usedHallNamesInSlot.includes(hall.name) &&
    isHallValidForCourse(hall, course)
);

let assignedHall = null;

if (fittingHalls.length) {
  assignedHall = fittingHalls[0].name;
} else {
  const maxAvailable = getMaxAllowedHallCapacity(hallsPool, course);

  hallWarningItems.push({
    courseName: course.courseName || course.courseCode || "مقرر بدون اسم",
    required: Number(course.studentCount) || 0,
    maxAvailable,
  });
  notPlaced.push(course);

  return;
}
  
    slotCoursesMap.get(bestSlot.id).push(course.key);
newPlaced.push({
  ...course,
  ...bestSlot,
  students: Array.from(course.students || []),
  trainers: Array.from(course.trainers || []),
  departments: Array.from(course.departments || []),
  majors: Array.from(course.majors || []),
  sectionNames: Array.from(course.sectionNames || []),
  scheduleTypes: Array.from(course.scheduleTypes || []),
  departmentRoots: Array.from(course.departmentRoots || []),
  examHall: assignedHall,
  invigilators: pickInvigilators(course, bestSlot),
});
  });

  newPlaced.sort((a, b) => a.dateISO.localeCompare(b.dateISO) || a.period - b.period || b.studentCount - a.studentCount);

  const underCoveredCoursesCount = includeInvigilators
    ? newPlaced.filter((item) => (item.invigilators?.length || 0) < getRequiredInvigilatorsCount(item)).length
    : 0;

  if (includeInvigilators && underCoveredCoursesCount > 0) {
    showToast(
      "ملاحظة على توزيع المراقبين",
      `تمت جدولة ${underCoveredCoursesCount} مقرر بعدد مراقبين أقل من المطلوب بسبب محدودية التوفر في بعض الفترات.`,
      "warning"
    );
  }

  setUnscheduled(notPlaced);
  setPreviewPage(0);
  return { placed: newPlaced, notPlaced, hallWarnings: hallWarningItems };
};

const generateGeneralSchedule = () => {
  const { placed, notPlaced, hallWarnings: nextHallWarnings } = generateScheduleForCourses(generalCourses, []);
  setGeneralSchedule(placed);
  setHallWarnings(nextHallWarnings || []);
  if (notPlaced.length) {
    showToast(
      "تم توزيع الدراسات العامة مع ملاحظات",
      `تم توزيع ${placed.length} مقرر، وتعذر جدولة ${notPlaced.length} مقرر.`,
      "warning"
    );
  } else {
    showToast("تم توزيع الدراسات العامة", `تم توزيع ${placed.length} مقرر.`, "success");
  }
  setCurrentStep(5);
};

const generateSpecializedSchedule = () => {
  const { placed, notPlaced, hallWarnings: nextHallWarnings } = generateScheduleForCourses(specializedCourses, generalSchedule);
  setSpecializedSchedule(placed);
  setHallWarnings((prev) => [...prev, ...(nextHallWarnings || [])]);
  setPreviewTab("sortedCourses");

  const merged = [...generalSchedule, ...placed].sort(
    (a, b) => a.dateISO.localeCompare(b.dateISO) || a.period - b.period || b.studentCount - a.studentCount
  );

  setSchedule(merged);
  if (notPlaced.length) {
    showToast(
      "تم توزيع مقررات التخصص مع ملاحظات",
      `تم توزيع ${placed.length} مقرر، وتعذر جدولة ${notPlaced.length} مقرر.`,
      "warning"
    );
  } else {
    showToast("تم توزيع مقررات التخصص", `تم توزيع ${placed.length} مقرر.`, "success");
  }
  setCurrentStep(6);
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

  const groupedSchedule = useMemo(() => {
    return filteredScheduleForPrint.reduce((acc, item) => {
      if (!acc[item.dateISO]) acc[item.dateISO] = [];
      acc[item.dateISO].push(item);
      return acc;
    }, {});
  }, [filteredScheduleForPrint]);

  const groupedScheduleEntries = useMemo(() => Object.entries(groupedSchedule), [groupedSchedule]);

  const daysPerPage = 5;
  const totalPreviewPages = Math.max(1, Math.ceil(groupedScheduleEntries.length / daysPerPage));

  const paginatedGroupedSchedule = useMemo(() => {
    const start = previewPage * daysPerPage;
    return groupedScheduleEntries.slice(start, start + daysPerPage);
  }, [groupedScheduleEntries, previewPage]);


const studentOptionsForPrint = useMemo(() => {
  const combinedSchedule =
    schedule.length
      ? schedule
      : [...generalSchedule, ...specializedSchedule];

  const scheduledStudentIds = new Set(
    combinedSchedule.flatMap((item) =>
      Array.isArray(item.students)
        ? item.students
        : Array.from(item.students || [])
    )
  );

  const selectedDepartmentNormalized =
    printDepartmentFilter === "__all__" ? "" : normalizeArabic(printDepartmentFilter);
  const selectedMajorNormalized =
    printMajorFilter === "__all__" ? "" : normalizeArabic(printMajorFilter);

  const map = new Map();

  parsed.filteredRows.forEach((row) => {
    const studentId = String(row["رقم المتدرب"] ?? "").trim();
    if (!studentId || !scheduledStudentIds.has(studentId)) return;

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

  return combinedSchedule
  .filter((item) =>
    (Array.isArray(item.students)
      ? item.students
      : Array.from(item.students || [])
    ).includes(selectedStudentIdForPrint)
  )
  .sort((a, b) => a.dateISO.localeCompare(b.dateISO) || a.period - b.period);
}, [schedule, generalSchedule, specializedSchedule, selectedStudentIdForPrint]);

  const combinedScheduleForStudents = useMemo(() => (
    schedule.length ? schedule : [...generalSchedule, ...specializedSchedule]
  ), [schedule, generalSchedule, specializedSchedule]);

  const studentPortalOptions = useMemo(() => {
    const scheduledIds = new Set(
      combinedScheduleForStudents.flatMap((item) =>
        Array.isArray(item.students) ? item.students : Array.from(item.students || [])
      )
    );

    const map = new Map();

    parsed.filteredRows.forEach((row) => {
      const studentId = String(row["رقم المتدرب"] ?? "").trim();
      if (!studentId || !scheduledIds.has(studentId)) return;

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

    return combinedScheduleForStudents
      .filter((item) =>
        (Array.isArray(item.students) ? item.students : Array.from(item.students || [])).includes(selectedStudentIdForPrint)
      )
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO) || a.period - b.period);
  }, [combinedScheduleForStudents, selectedStudentIdForPrint]);

  const invigilatorTable = useMemo(() => {
    const table = new Map();

    filteredScheduleForPrint.forEach((item) => {
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
      الكلية: parsed.collegeName,
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

    downloadFile(
      `final-exam-schedule-${suffix}-${(fileName || "technical-college").replace(/\.[^.]+$/, "")}.csv`,
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

<div
  style={{
    background: `linear-gradient(135deg, ${COLORS.primaryDark}, ${COLORS.primary})`,
    color: "#fff",
    borderRadius: 28,
    padding: "28px 32px",
    boxShadow: "0 12px 30px rgba(0,0,0,0.15)",
  }}
>
  <div
    style={{
      flexDirection: "row-reverse",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 20,
      flexWrap: "wrap",
    }}
  >

  
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >


      {/* الأزرار */}

  <select
  value={manualCollegeLocation || autoDetectedCollegeLocation || ""}
  onChange={(e) => setManualCollegeLocation(e.target.value)}
  style={fieldStyle()}
>
  <option value="">اختر الكلية / المدينة</option>
  {allCollegeLocations.map((location) => (
    <option key={location} value={location}>
      {location}
    </option>
  ))}
</select>
      
     <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
  <button onClick={exportSavedSession}>تصدير البيانات</button>
  <button onClick={() => importSessionRef.current?.click()}>استيراد البيانات</button>
  <button onClick={clearSavedState}>حذف البيانات المحلية</button>

<button
  type="button"
  onClick={() => {
    if (!effectiveCollegeLocation || !effectiveCollegeSlug) {
      showToast("تعذر التصدير", "اختر الكلية أولًا أو تأكد من اسمها.", "error");
      return;
    }

exportCollegeDataFile({
  slug: effectiveCollegeSlug,
  collegeName: parsed.collegeName || collegeNameInput || "الكلية التقنية",
  schedule,
  parsed,
  studentInfoMap: preciseStudentInfoMap,
  selectedDepartment: printDepartmentFilter,
  selectedMajor: printMajorFilter,
});

    showToast("تم التصدير", "تم تصدير بيانات المتدربين بنجاح.", "success");
  }}
  style={cardButtonStyle({ active: true })}
>
  تصدير بيانات المتدربين
</button>

 <button
  type="button"
  onClick={() => {
    if (!effectiveCollegeLocation) {
      showToast("تعذر تحديد الكلية", "اختر الكلية أولًا أو عدّل اسم الكلية.", "error");
      return;
    }

    const baseLink = generateTraineeLink("", effectiveCollegeLocation);

    if (!baseLink) {
      showToast("تعذر إنشاء الرابط", "تعذر تحديد رمز الكلية.", "error");
      return;
    }

    navigator.clipboard.writeText(baseLink);
    showToast("تم النسخ", "تم نسخ رابط بوابة المتدربين.", "success");
  }}
  style={cardButtonStyle({ active: true })}
>
  نسخ رابط المتدربين
</button>

   
</div>
<div
  style={{
    background: COLORS.bg2,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
  }}
>
  <div style={{ fontWeight: 800, marginBottom: 8 }}>تحديد الكلية</div>

  {effectiveCollegeLocation ? (
    <div style={{ color: COLORS.success, fontWeight: 700, marginBottom: 8 }}>
      تم التعرف على الكلية تلقائيًا: {effectiveCollegeLocation}
      {effectiveCollegeSlug ? ` (${effectiveCollegeSlug})` : ""}
    </div>
  ) : (
    <div style={{ color: COLORS.warning, fontWeight: 700, marginBottom: 8 }}>
      تعذر التعرف على الكلية تلقائيًا. اختر الكلية يدويًا.
    </div>
  )}

  {!detectedCollegeLocation && (
    <select
      value={manualCollegeLocation}
      onChange={(e) => setManualCollegeLocation(e.target.value)}
      style={fieldStyle()}
    >
      <option value="">اختر الكلية / المدينة</option>
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

        {/* الشعار */}
      <div
        style={{
          background: "rgba(255,255,255,0.15)",
          border: "1px solid rgba(255,255,255,0.25)",
          borderRadius: 18,
          padding: 10,
          backdropFilter: "blur(6px)",
        }}
      >
        <img
          src={LOGO_SRC}
          alt="logo"
          style={{ width: 160, display: "block" }}
        />
      </div>   
    </div>
    <div style={{ textAlign: "right", maxWidth: 500 }}>
      <div style={{ fontSize: 28, fontWeight: 800 }}>
        نظام بناء جدول الاختبارات
      </div>

      <div
        style={{
          marginTop: 6,
          fontSize: 14,
          opacity: 0.9,
          lineHeight: 1.8,
        }}
      >
        أداة احترافية لإنشاء جداول الاختبارات للكليات التقنية بكفاءة عالية
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
</div>

     


       

    

  

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, max-content))",
            gap: 16,
            marginTop: 20,
          }}
        >
          <StatBox label="السجلات" value={stats.rows} />
          <StatBox label="عدد المتدربين" value={stats.students} />
          <StatBox label="عدد المقررات" value={stats.courses} />
          <StatBox label="مقررات الدراسات العامة" value={stats.generalCourses} />
          <StatBox label="مقررات التخصص" value={stats.specializedCourses} />
          <StatBox label="المراقبون" value={stats.invigilators} />
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20, marginBottom: 20 }}>
          {[
  { id: 1, label: "1. رفع الملف" },
  { id: 2, label: "2. المقررات" },
  { id: 3, label: "3. المراقبون" },
  { id: 4, label: "4. مقررات الدراسات العامة" },
  { id: 5, label: "5. مقررات التخصص" },
  { id: 6, label: "6. تحليل تعارض مقررين" },
  { id: 7, label: "7. المعاينة" },
  { id: 8, label: "8. الطباعة" },
  { id: 9, label: "9. التصدير وبوابة المتدربين" },
].map((step) => {
            const isLockedGeneralStudies = step.id === 4 && lockGeneralStudiesStep;

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
              title="الصفحة الأولى: رفع الملف والإعدادات العامة"
              description="حدد تاريخ البداية وعدد الأيام وأوقات الفترات والقاعات، ثم ارفع تقرير SF01."
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
  height: 75,          
  borderRadius: 20,    
  border: `2px dashed ${dragActive ? COLORS.primaryDark : COLORS.primaryBorder}`,
  background: dragActive ? COLORS.primaryLight : "#FCFFFF",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "column",
  textAlign: "center",
  cursor: "pointer",
  padding: "10px",     
}}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: "none" }}
                onChange={(e) => handleUpload(e.target.files?.[0])}
              />
              <div style={{ fontSize: 18, fontWeight: 900, color: COLORS.charcoal }}>اسحب التقرير هنا أو اضغط للاختيار</div>
              <div style={{ marginTop: 4, fontSize: 11, color: COLORS.muted }}>CSV فقط</div>
              {fileName ? (
                <div
                  style={{
                    marginTop: 12,
                    background: COLORS.primaryDark,
                    color: "#fff",
                    padding: "8px 14px",
                    borderRadius: 999,
                  }}
                >
                  {fileName}
                </div>
              ) : null}
            </div>

            {parsed.missingColumns.length ? (
              <div
                style={{
                  marginTop: 14,
                  borderRadius: 18,
                  padding: 14,
                  background: COLORS.dangerBg,
                  border: "1px solid #FECACA",
                  color: COLORS.danger,
                }}
              >
                الأعمدة الناقصة: {parsed.missingColumns.join("، ")}
              </div>
            ) : null}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 14,
                marginTop: 18,
              }}
            >
              <div>
                <div style={{ marginBottom: 8, fontWeight: 800 }}>اسم الكلية</div>
                <input
                  value={collegeNameInput}
                  onChange={(e) => setCollegeNameInput(e.target.value)}
                  style={fieldStyle()}
                  placeholder="اكتب اسم الكلية"
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
                  max="60"
                  value={numberOfDays}
                  onChange={(e) => setNumberOfDays(safeNum(e.target.value, 8))}
                  style={fieldStyle()}
                />
              </div>

              <div>
                <div style={{ marginBottom: 8, fontWeight: 800 }}>مدرب لديه ظروف خاصة</div>
                <input
                  value={prioritizeTrainer}
                  onChange={(e) => setPrioritizeTrainer(e.target.value)}
                  style={fieldStyle()}
                  placeholder="اسم المدرب أو جزء منه"
                />
              </div>
            </div>

            <div style={{ marginTop: 18 }}>
              <div style={{ marginBottom: 8, fontWeight: 800 }}>عدد الفترات وأوقاتها</div>
              <textarea
                value={periodsText}
                onChange={(e) => setPeriodsText(e.target.value)}
                style={{ ...fieldStyle(), minHeight: 110, resize: "vertical" }}
                placeholder={"07:45-09:00\n09:15-11:00\n11:15-13:00"}
              />
              <div style={{ marginTop: 6, color: COLORS.muted, fontSize: 13 }}>
                اكتب كل فترة في سطر مستقل بهذه الصيغة: 07:45-09:00
              </div>
            </div>

            <div style={{ marginTop: 18 }}>
            <Card>
  <SectionHeader
    title="قاعات الاختبار"
    description="أضف القاعات وحدد الأقسام المسموح لها لكل قاعة. إذا لم يتم تحديد قسم، تعتبر القاعة متاحة لجميع الأقسام."
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
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontWeight: 800,
              color: COLORS.charcoal,
            }}
          >
            <input
              type="checkbox"
              checked={hall.allowAllDepartments}
              onChange={(e) =>
                setHallAllDepartments(hall.id, e.target.checked)
              }
            />
            متاحة لجميع الأقسام
          
                     <button
            type="button"
            onClick={() => removeExamHall(hall.id)}
           style={{
    ...cardButtonStyle({ danger: true }),
    marginInlineStart: 20, 
  }}
          >
            حذف القاعة
          </button>
          </label>

        </div>

        {!hall.allowAllDepartments && (
          <div
            style={{
              marginTop: 12,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 14,
              padding: 12,
              background: COLORS.bg2,
            }}
          >
            <div
              style={{
                fontWeight: 800,
                color: COLORS.charcoal,
                marginBottom: 10,
              }}
            >
              الأقسام المسموح لها
            </div>

            {availableDepartments.length ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 8,
                }}
              >
                {availableDepartments.map((dep) => {
                  const checked = hall.allowedDepartments.includes(dep);

                  return (
                    <label
                      key={dep}
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
                        onChange={() => toggleHallDepartment(hall.id, dep)}
                      />
                      <span>{dep}</span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div style={{ color: COLORS.muted }}>
                لم يتم العثور على أقسام بعد. ارفع الملف أولًا ليتم جلب الأقسام تلقائيًا.
              </div>
            )}
          </div>
        )}
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
              <button onClick={() => setCurrentStep(2)} disabled={!rows.length} style={cardButtonStyle({ active: true, disabled: !rows.length })}>
                التالي: تعديل المقررات
              </button>
            </div>
          </Card>
        )}

        {currentStep === 2 && (
          <Card>
            <SectionHeader
              title="الصفحة الثانية: تعديل المقررات"
              description="استبعد المقررات التي لا تريد إدخالها في الجدولة، ويمكنك أيضًا تحديد مستويات المقررات لمنع مقررات المستوى الواحد من الجدولة في نفس اليوم."
            />

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
                  onChange={(e) => {
                    setIncludeAllDepartmentsAndMajors(e.target.checked);
                    if (e.target.checked) {
                      setExcludedDepartmentMajors([]);
                      setLockGeneralStudiesStep(false);
                    } else {
                      setLockGeneralStudiesStep(true);
                    }
                  }}
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
                <div style={{ fontWeight: 800, marginBottom: 10 }}>استبعاد أقسام / تخصصات من التوزيع</div>
                <div style={{ color: COLORS.muted, fontSize: 14, marginBottom: 10 }}>
                  اختر القسم أو التخصص الذي لا تريد دخوله في التوزيع، ويمكنك الضغط مرة أخرى لإعادته.
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

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
              <button onClick={() => setCurrentStep(1)} style={cardButtonStyle()}>
                السابق
              </button>
              <button onClick={() => setCurrentStep(3)} style={cardButtonStyle({ active: true })}>
                التالي: المراقبون
              </button>
            </div>
          </Card>
        )}

  {currentStep === 3 && (
  <Card>
    <SectionHeader
      title="الصفحة الثالثة: المراقبون"
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
              <div style={{ width: "100%", maxWidth: 80 }}>
                <div style={{ marginBottom: 8, fontWeight: 800 }}>عدد المراقبين لكل مقرر</div>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={invigilatorsPerPeriod}
                  onChange={(e) => setInvigilatorsPerPeriod(safeNum(e.target.value, 4))}
                  style={fieldStyle()}
                />
              </div>
            ) : (
              <div style={{ width: "100%", maxWidth: 80 }}>
                <div style={{ marginBottom: 8, fontWeight: 800 }}>عدد المتدربين لكل مراقب</div>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={studentsPerInvigilator}
                  onChange={(e) => setStudentsPerInvigilator(safeNum(e.target.value, 20))}
                  style={fieldStyle()}
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

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
          <button type="button" onClick={() => setCurrentStep(2)} style={cardButtonStyle()}>
            السابق
          </button>

          <button
            type="button"
            onClick={() => setCurrentStep(4)}
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

{currentStep === 4 && (
          <Card>
            <SectionHeader title="الصفحة الرابعة: توزيع مقررات الدراسات العامة" description="سيتم توزيع مقررات الدراسات العامة أولًا." />

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
                مقررات الدراسات العامة مستقلة، لذلك لا يمكن تعديلها من هذه النسخة المخصصة للأقسام.
              </div>
            ) : (
              <>
            <div style={{ marginBottom: 16, color: COLORS.charcoalSoft }}>
              عدد مقررات الدراسات العامة: <strong>{generalCourses.length}</strong>
            </div>

            <div style={{ overflowX: "auto", marginBottom: 18 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: COLORS.primaryLight }}>
                    {["المقرر", "الرمز", "المدرب", "العدد"].map((h) => (
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

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button onClick={() => setCurrentStep(3)} style={cardButtonStyle()}>
                السابق
              </button>
              <button onClick={generateGeneralSchedule} style={cardButtonStyle({ active: true })}>
                توزيع الدراسات العامة
              </button>
              <button onClick={() => setCurrentStep(5)} style={cardButtonStyle()}>
                التالي
              </button>
            </div>
              </>
            )}
          </Card>
        )}

        {currentStep === 5 && (
          <Card>
            <SectionHeader title="الصفحة الخامسة: توزيع مقررات التخصص" description="بعد الانتهاء من الدراسات العامة، وزّع مقررات التخصص." />

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
                  onChange={(e) => {
                    setIncludeAllDepartmentsAndMajors(e.target.checked);
                    if (e.target.checked) {
                      setExcludedDepartmentMajors([]);
                      setLockGeneralStudiesStep(false);
                    } else {
                      setLockGeneralStudiesStep(true);
                    }
                  }}
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

            <div style={{ overflowX: "auto", marginBottom: 18 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: COLORS.primaryLight }}>
                    {["المقرر", "الرمز", "المدرب", "العدد"].map((h) => (
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

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button onClick={() => setCurrentStep(4)} style={cardButtonStyle()}>
                السابق
              </button>
              <button onClick={generateSpecializedSchedule} style={cardButtonStyle({ active: true })}>
                توزيع مقررات التخصص
              </button>
              <button onClick={() => setCurrentStep(6)} style={cardButtonStyle()}>
                التالي
              </button>
            </div>
          </Card>
        )}

{currentStep === 6 && (
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
            <div style={{ padding: 18, color: COLORS.muted }}>
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
      <button onClick={() => setCurrentStep(5)} style={cardButtonStyle()}>
        السابق
      </button>
      <button onClick={() => setCurrentStep(7)} style={cardButtonStyle({ active: true })}>
        التالي: المعاينة
      </button>
    </div>
  </Card>
)}
          
        {currentStep === 7 && (
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
                    المقررات المرتبة
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
                  <button onClick={() => setCurrentStep(6)} style={cardButtonStyle()}>
                    السابق
                  </button>
                  <button onClick={() => setCurrentStep(8)} style={cardButtonStyle({ active: true })}>
                    التالي: الطباعة
                  </button>
                </div>
              </Card>
            </div>

            {previewTab === "sortedCourses" && (
              <div style={{ marginTop: 20 }}>
                {hallWarnings.length > 0 && (
  <Card
    style={{
      border: `1px solid #FECACA`,
      background: COLORS.dangerBg,
    }}
  >
    <SectionHeader
      title="تنبيهات القاعات"
      description="بعض المقررات لم يتم توزيعها بسبب عدم توفر قاعات بسعة كافية أو مسموحة لنفس القسم."
    />

    <div style={{ display: "grid", gap: 10 }}>
      {hallWarnings.map((item, index) => (
        <div
          key={`${item.courseName}-${index}`}
          style={{
            border: "1px solid #FECACA",
            background: "#fff",
            borderRadius: 14,
            padding: "12px 14px",
            color: COLORS.danger,
            fontWeight: 800,
            lineHeight: 1.9,
          }}
        >
          {item.courseName} يحتاج قاعة بسعة {item.required}، أكبر قاعة متاحة {item.maxAvailable}
        </div>
      ))}
    </div>
  </Card>
)}
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
                      <div style={{ fontWeight: 900, marginBottom: 8 }}>مقررات لم يتم جدولة اختبارها</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {unscheduled.map((course) => (
                          <span
                            key={course.key}
                            style={{
                              background: "#fff",
                              border: "1px solid #FED7AA",
                              borderRadius: 999,
                              padding: "6px 12px",
                              fontSize: 13,
                            }}
                          >
                            {course.courseName} - {course.courseCode}
                          </span>
                        ))}
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
                                    <tr key={`${item.key}-${item.id}`}>
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
        {currentStep === 8 && (
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
                <button onClick={() => setCurrentStep(7)} style={cardButtonStyle()}>
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
                      defaultExamHall: examHalls[0]?.name || "قاعة النشاط",
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
                 <button onClick={() => setCurrentStep(9)} style={cardButtonStyle({ active: true })}>
        التالي: التصدير وبوابة المتدربين
      </button>
              </div>
            </Card>
          </div>
        )}

        </div>
      
     

  {currentStep === 9 && (
    <Card>
      <SectionHeader
        title="الصفحة التاسعة: تصدير البيانات العامة واستيرادها وإنشاء بوابة المتدربين"
        description="يمكنك هنا تصدير عملك وإرساله للزملاء، كما يمكن لرئيس القسم تصدير بيانات المتدربين للبوابة الخاصة بالوحدة"
      />

<div style={{ display: "grid", gap: 12 }}>

  {/* 🔹 تصدير واستيراد */}
  <div
    style={{
      border: `1px solid ${COLORS.primaryBorder}`,
      borderRadius: 16,
      padding: "12px 14px",
      background: COLORS.primaryLight,
      display: "flex",
       width: "fit-content",
      gap: 10,
      alignItems: "flex-start",
    }}
  >
    <div style={{ fontSize: 18 }}>📤</div>
    <div style={{ lineHeight: 1.9 }}>
      <strong>تصدير واستيراد البيانات</strong>
      <div>
        يمكن للمستخدم تصدير البيانات بالكامل واستخدامها في جهاز آخر أو إرسالها
        لزميل في الوحدة عن طريق الضغط على خيار تصدير البيانات، ولاستيرادها يتم
        الضغط على زر استيراد البيانات.
      </div>
    </div>
  </div>

  {/* 🔹 تفعيل البوابة */}
  <div
    style={{
      border: `1px solid ${COLORS.secondaryBorder}`,
      borderRadius: 16,
      padding: "12px 14px",
      background: "#F0FDFB",
            gap: 10,
      alignItems: "flex-start",
           display: "flex",
    width: "fit-content",
    }}
  >
    <div style={{ fontSize: 18 }}>🧭</div>
    <div style={{ lineHeight: 1.9 }}>
      <strong>تفعيل بوابة المتدربين</strong>
      <div>
        يجب التأكد من أن الوحدة الخاصة بك موجودة في المربع الخاص بالتعرف على
        الوحدة تلقائيًا، وفي حال عدم التعرف عليها يمكن الاختيار من
        القائمة المنسدلة.
      </div>
    </div>
  </div>

  {/* 🔹 إرسال الملف */}
  <div
    style={{
      border: `1px solid ${COLORS.warningBorder || "#FACC15"}`,
      borderRadius: 16,
      padding: "12px 14px",
      background: "#FFFBEB",
            gap: 10,
      alignItems: "flex-start",
           display: "flex",
    width: "fit-content",
    }}
  >
    <div style={{ fontSize: 18 }}>📩</div>
    <div style={{ lineHeight: 1.9 }}>
      <strong>إرسال ملف البوابة</strong>
      <div>
        بعد تصدير البيانات، سيتم تحميل ملف خاص بالوحدة. لتفعيل بوابة
        المتدربين وتحديث بياناتها، نأمل إرسال الملف بعد كل عملية توزيع على البريد التالي:
        <br />
        <span style={{ fontWeight: 700 }}>
          m.alfayez@tvtc.gov.sa
        </span>
      </div>
    </div>
  </div>

</div>
<br></br>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button onClick={() => setCurrentStep(8)} style={cardButtonStyle()}>
          السابق
        </button>
      </div>
    </Card>
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
