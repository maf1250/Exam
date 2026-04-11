import React, { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
const STORAGE_KEY = "exam_scheduler_saved_state_v1";

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
        left: 20,
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

    const normalizedScheduleType = normalizeArabic(scheduleType);
    const key = [normalizeArabic(courseCode), normalizeArabic(courseName)].join("|");

    if (!map.has(key)) {
      map.set(key, {
        key,
        hasPractical: false,
        hasTheoretical: false,
        hasCoop: false,
      });
    }

    const item = map.get(key);

    if (normalizedScheduleType.includes("عملي")) item.hasPractical = true;

    if (
      normalizedScheduleType.includes("نظري") ||
      normalizedScheduleType.includes("محاضره") ||
      normalizedScheduleType.includes("محاضرة")
    ) {
      item.hasTheoretical = true;
    }

    if (normalizedScheduleType.includes("تعاوني")) item.hasCoop = true;
  });

  return Array.from(map.values())
    .filter((item) => item.hasCoop || (item.hasPractical && !item.hasTheoretical))
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

function printScheduleOnlyPdf({
  collegeName,
  schedule,
  periodLabels = [],
  defaultExamHall = "قاعة النشاط",
  selectedDepartment = "__all__",
  selectedMajor = "__all__",
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

    if (!item) {
      return `
        <td class="num-cell">${rowIndex + 1}</td>
        <td class="course-cell"></td>
        <td class="code-cell"></td>
        <td class="hall-cell"></td>
      `;
    }

    return `
      <td class="num-cell">${rowIndex + 1}</td>
      <td class="course-cell">${item.courseName || ""}</td>
      <td class="code-cell">${item.courseCode || ""}</td>
      <td class="hall-cell">${item.examHall || defaultExamHall}</td>
    `;
  };

  const todayText = new Intl.DateTimeFormat("ar-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

const selectedMajorNormalized = normalizeArabic(selectedMajor);
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

const extractedMajors = Array.from(
  new Set(
    schedule.flatMap((item) =>
      splitBySlash(item.major)
        .map((major) => String(major || "").trim())
        .filter(Boolean)
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
  } else {
    if (extractedDepartments.length) {
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
  }

  if (selectedMajor !== "__all__") {
    majorLabel = selectedMajor;
  } else {
    majorLabel =
      extractedMajors.length === 1
        ? extractedMajors[0]
        : extractedMajors.length
        ? extractedMajors.join(" / ")
        : "جميع التخصصات";
  }
}

  
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
        <style>${getPrintBaseStyles()}</style>
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
            <div>اليوم / التاريخ</div>
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
                        <tr>
                          ${
                            rowIndex === 0
                              ? `
                                <td class="day-col" rowspan="${rowsCount}">
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

          <div class="footer">${todayText}</div>
        </div>
      </body>
    </html>
  `;

  openPrintWindow("طباعة جدول الاختبارات", html);
}

function printInvigilatorsOnlyPdf({ collegeName, invigilatorTable }) {
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

          th, td {
            font-size: 12px;
            padding: 8px 6px;
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

          <div class="footer">${todayText}</div>
        </div>
      </body>
    </html>
  `;

  openPrintWindow("طباعة جدول المراقبين", html);
}

function matchesSelectedMainDepartment(item, selectedDepartment) {
  if (selectedDepartment === "__all__") return true;

  const target = normalizeArabic(selectedDepartment);
  const roots = getCourseDepartmentRoots(item);

  return roots.includes(target);
}

export default function App() {
  const fileRef = useRef(null);

  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [toast, setToast] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [previewTab, setPreviewTab] = useState("sortedCourses");
  const [invigilationMode, setInvigilationMode] = useState("ratio");
  const [studentsPerInvigilator, setStudentsPerInvigilator] = useState(17);
  const [currentStep, setCurrentStep] = useState(1);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });

  const [numberOfDays, setNumberOfDays] = useState(8);
  const [selectedDays, setSelectedDays] = useState(["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"]);
  const [periodsText, setPeriodsText] = useState("07:45-09:00\n09:15-11:00");
  const [examHallsText, setExamHallsText] = useState("قاعة النشاط|120");
  const [previewPage, setPreviewPage] = useState(0);

  const [includeInvigilators, setIncludeInvigilators] = useState(true);
  const [excludedInvigilators, setExcludedInvigilators] = useState([]);
  const [excludeInactive, setExcludeInactive] = useState(true);
  const [prioritizeTrainer, setPrioritizeTrainer] = useState("");
  const [manualInvigilators, setManualInvigilators] = useState("");
  const [invigilatorsPerPeriod, setInvigilatorsPerPeriod] = useState(4);

  const [excludedCourses, setExcludedCourses] = useState([]);
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

  const showToast = (title, description, type = "success") => {
    setToast({ title, description, type });
    window.clearTimeout(window.__examToastTimer);
    window.__examToastTimer = window.setTimeout(() => setToast(null), 3500);
  };

const buildPersistedState = () => ({
  rows,
  fileName,
  currentStep,
  startDate,
  numberOfDays,
  selectedDays,
  periodsText,
  examHallsText,
  includeInvigilators,
  excludedInvigilators,
  excludeInactive,
  prioritizeTrainer,
  manualInvigilators,
  invigilatorsPerPeriod,
  invigilationMode,
  studentsPerInvigilator,
  excludedCourses,
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
});

const restorePersistedState = (saved) => {
  setRows(saved.rows || []);
  setFileName(saved.fileName || "");
  setCurrentStep(saved.currentStep || 1);
  setStartDate(saved.startDate || "");
  setNumberOfDays(saved.numberOfDays || 8);
  setSelectedDays(saved.selectedDays || ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"]);
  setPeriodsText(saved.periodsText || "07:45-09:00\n09:15-11:00");
  setExamHallsText(saved.examHallsText || "قاعة النشاط|120");
  setIncludeInvigilators(saved.includeInvigilators ?? true);
  setExcludedInvigilators(saved.excludedInvigilators || []);
  setExcludeInactive(saved.excludeInactive ?? true);
  setPrioritizeTrainer(saved.prioritizeTrainer || "");
  setManualInvigilators(saved.manualInvigilators || "");
  setInvigilatorsPerPeriod(saved.invigilatorsPerPeriod || 4);
  setInvigilationMode(saved.invigilationMode || "ratio");
  setStudentsPerInvigilator(saved.studentsPerInvigilator || 17);
  setExcludedCourses(saved.excludedCourses || []);
  setPrintDepartmentFilter(saved.printDepartmentFilter || "__all__");
  setPrintMajorFilter(saved.printMajorFilter || "__all__");
  setAvoidSameLevelSameDay(saved.avoidSameLevelSameDay ?? false);
  setCourseLevels(saved.courseLevels || {});
  setPreferCourseTrainerInvigilation(saved.preferCourseTrainerInvigilation ?? true);
  setGeneralSchedule(saved.generalSchedule || []);
  setSpecializedSchedule(saved.specializedSchedule || []);
  setSchedule(saved.schedule || []);
  setUnscheduled(saved.unscheduled || []);
  setPreviewTab(saved.previewTab || "sortedCourses");
  setPreviewPage(saved.previewPage || 0);
};

useEffect(() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setDidRestore(true);
      return;
    }

    const saved = JSON.parse(raw);
    setPendingRestore(saved);
    setToast({
      title: "جلسة محفوظة",
      description: "تم العثور على جلسة محفوظة — اضغط استرجاع لاستعادتها.",
      type: "warning",
      action: "restore_session",
    });
    setDidRestore(true);
  } catch (error) {
    console.error("Failed to restore saved state:", error);
    setDidRestore(true);
  }
}, []);

useEffect(() => {
  if (!didRestore) return;

  try {
    const data = buildPersistedState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error("Failed to persist state:", error);
  }
}, [
  didRestore,
  rows,
  fileName,
  currentStep,
  startDate,
  numberOfDays,
  selectedDays,
  periodsText,
  examHallsText,
  includeInvigilators,
  excludedInvigilators,
  excludeInactive,
  prioritizeTrainer,
  manualInvigilators,
  invigilatorsPerPeriod,
  invigilationMode,
  studentsPerInvigilator,
  excludedCourses,
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
]);

const restoreSavedSession = () => {
  if (!pendingRestore) return;

  restorePersistedState(pendingRestore);
  setPendingRestore(null);
  showToast("تم الاسترجاع", "تم استرجاع الجلسة بنجاح.", "success");
};

const clearSavedState = () => {
  localStorage.removeItem(STORAGE_KEY);
  setPendingRestore(null);
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
  reader.onload = (e) => {
    try {
      const saved = JSON.parse(e.target.result);
      restorePersistedState(saved);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      setPendingRestore(null);
      showToast("تم الاستيراد", "تم تحميل الجلسة بنجاح.", "success");
    } catch (error) {
      showToast("خطأ في الاستيراد", "ملف الجلسة غير صالح.", "error");
    }
  };

  reader.readAsText(file, "utf-8");
};
  const handleUpload = (file) => {
    if (!file) return;

    setFileName(file.name);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: "UTF-8",
      complete: (result) => {
        const cleanRows = (result.data || []).filter((row) =>
          Object.values(row).some((v) => String(v ?? "").trim() !== "")
        );

        setRows(cleanRows);
        setSchedule([]);
        setGeneralSchedule([]);
        setSpecializedSchedule([]);
        setUnscheduled([]);
        setExcludedCourses(getDefaultExcludedPracticalCourseKeys(cleanRows));
        setCourseLevels({});
        setPreviewPage(0);
        setPreviewTab("sortedCourses");
        setCurrentStep(1);

        showToast("تم رفع الملف", `تم تحليل الملف ${file.name} بنجاح.`, "success");
      },
      error: (err) => {
        showToast("تعذر قراءة الملف", err.message || "تحقق من صحة ملف CSV.", "error");
      },
    });
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

    const courseMap = new Map();
    const studentSet = new Set();
    const studentCourseMap = new Map();
    const studentDepartmentMap = new Map();
    const invigilatorSet = new Set();
    const sectionSet = new Set();

    filteredRows.forEach((row) => {
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

    const conflictMap = new Map();
    Array.from(courseMap.keys()).forEach((key) => conflictMap.set(key, new Set()));

    studentCourseMap.forEach((courseSet) => {
      const list = Array.from(courseSet);
      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          conflictMap.get(list[i]).add(list[j]);
          conflictMap.get(list[j]).add(list[i]);
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

    return {
      missingColumns,
      filteredRows,
      collegeName: filteredRows[0]?.["الوحدة"] || rows[0]?.["الوحدة"] || "الكلية التقنية",
      courses,
      studentsCount: studentSet.size,
      invigilators: Array.from(invigilatorSet).sort((a, b) => a.localeCompare(b, "ar")),
      sections: Array.from(sectionSet).sort((a, b) => a.localeCompare(b, "ar")),
    };
  }, [rows, excludeInactive, excludedCourses]);

  const generalCourses = useMemo(() => parsed.courses.filter((course) => isGeneralStudiesCourse(course)), [parsed.courses]);

  const specializedCourses = useMemo(() => {
    const keys = new Set(generalCourses.map((c) => c.key));
    return parsed.courses.filter((course) => !keys.has(course.key));
  }, [parsed.courses, generalCourses]);

  const parsedPeriods = useMemo(() => parsePeriodsText(periodsText), [periodsText]);
  const invalidPeriods = parsedPeriods.filter((p) => !p.valid);

  const examHalls = useMemo(() => {
    return String(examHallsText || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [namePart, capacityPart] = line.split("|").map((x) => x.trim());
        const capacity = Number(capacityPart);
        return {
          name: namePart || line,
          capacity: Number.isFinite(capacity) ? capacity : null,
        };
      })
      .filter((hall) => hall.name)
      .sort((a, b) => {
        const aCap = a.capacity ?? Number.MAX_SAFE_INTEGER;
        const bCap = b.capacity ?? Number.MAX_SAFE_INTEGER;
        return aCap - bCap;
      });
  }, [examHallsText]);

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
      const ratio = Math.max(1, Number(studentsPerInvigilator) || 17);
      return Math.max(1, Math.ceil((course.studentCount || 0) / ratio));
    }
    return Math.max(1, Number(invigilatorsPerPeriod) || 1);
  };

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

  const hallsPool = examHalls.length ? examHalls : [{ name: "قاعة النشاط", capacity: null }];

  const baseInvigilators = manualInvigilators
    ? manualInvigilators.split("\n").map((name) => name.trim()).filter(Boolean)
    : parsed.invigilators;

  const invigilatorPool = [
    ...new Set(
      baseInvigilators.filter(
        (name) => !excludedInvigilators.some((excluded) => normalizeArabic(excluded) === normalizeArabic(name))
      )
    ),
  ];

  const studentSlotMap = new Map();
  const studentDayMap = new Map();
  const slotCoursesMap = new Map(slots.map((slot) => [slot.id, []]));
  const invigilatorLoad = new Map(invigilatorPool.map((name) => [name, 0]));
  const invigilatorBusyPeriods = new Map(invigilatorPool.map((name) => [name, new Set()]));
  // نستخدم المقررات المجدولة سابقًا كأساس حتى لا يتكرر المراقب أو يتكرر الطالب في نفس الفترة
  const basePlaced = [...existingScheduled];
  const newPlaced = [];
  const notPlaced = [];

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

const rankInvigilatorForFairness = (name, preferTrainer = false) => {
  const load = invigilatorLoad.get(name) || 0;
  const minLoad = getMinInvigilatorLoad();

  // نعطي أفضلية بسيطة فقط، لكن لا نسمح بتضخم الفارق
  const overloadPenalty = load > minLoad + 1 ? 1000 : 0;
  const trainerBonus = preferTrainer ? -0.25 : 0;

  return load + overloadPenalty + trainerBonus;
};
 const getMinInvigilatorLoad = () => {
  const values = Array.from(invigilatorLoad.values());
  return values.length ? Math.min(...values) : 0;
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

  // 1) نضيف مدرب المقرر أولًا إذا كان متاحًا
  if (preferCourseTrainerInvigilation) {
    const trainerCandidates = invigilatorPool
      .filter((name) => normalizedTrainerSet.has(normalizeArabic(name)))
      .filter((name) => !excludedInvigilators.some((ex) => normalizeArabic(ex) === normalizeArabic(name)))
      .filter((name) => !invigilatorBusyPeriods.get(name)?.has(periodKey))
      .sort(
        (a, b) =>
          (invigilatorLoad.get(a) || 0) - (invigilatorLoad.get(b) || 0) ||
          a.localeCompare(b, "ar")
      );

    if (trainerCandidates.length) {
      const trainerName = trainerCandidates[0];
      chosen.push(trainerName);
    }
  }

  // 2) نكمل بقية العدد من الأقل حملًا
  const availableOthers = invigilatorPool
    .filter((name) => !chosen.includes(name))
    .filter((name) => !invigilatorBusyPeriods.get(name)?.has(periodKey))
    .sort(
      (a, b) =>
        (invigilatorLoad.get(a) || 0) - (invigilatorLoad.get(b) || 0) ||
        a.localeCompare(b, "ar")
    );

  for (const name of availableOthers) {
    if (chosen.length >= requiredCount) break;

    const currentLoad = invigilatorLoad.get(name) || 0;
    const minLoad = getMinInvigilatorLoad();

    // لا نسمح بفارق كبير في العدالة إلا عند الضرورة
   if (currentLoad > minLoad + 1 && chosen.length > 0) continue;

    chosen.push(name);
  }

  // 3) إذا ما اكتمل العدد بسبب شرط العدالة، نكمّل من الأقل حملًا مهما كان
  if (chosen.length < requiredCount) {
    for (const name of availableOthers) {
      if (chosen.length >= requiredCount) break;
      if (chosen.includes(name)) continue;
      chosen.push(name);
    }
  }

  // 4) تحديث الأحمال والانشغال
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

    if (course.conflictDegree > 10 && slot.period > 1) score += 1;

    if (prioritizeTrainer.trim()) {
      const normalizedTargetTrainer = normalizeArabic(prioritizeTrainer);
      const hasPriorityTrainer = course.trainerText
        .split("/")
        .some((name) => normalizeArabic(name.trim()).includes(normalizedTargetTrainer));

      if (hasPriorityTrainer) score -= 3;
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
      .filter((item) => item.id === bestSlot.id)
      .map((item) => item.examHall);

    const fittingHalls = hallsPool.filter(
      (hall) => !usedHallNamesInSlot.includes(hall.name) && (hall.capacity === null || hall.capacity >= course.studentCount)
    );

    const remainingHalls = hallsPool.filter((hall) => !usedHallNamesInSlot.includes(hall.name));

    let assignedHall = null;
    if (fittingHalls.length) assignedHall = fittingHalls[0].name;
    else if (remainingHalls.length) assignedHall = remainingHalls[remainingHalls.length - 1].name;
    else assignedHall = hallsPool[hallsPool.length - 1]?.name || "قاعة النشاط";

    slotCoursesMap.get(bestSlot.id).push(course.key);
newPlaced.push({
  ...course,
  ...bestSlot,
  departmentRoots: course.departmentRoots || [],
  examHall: assignedHall,
  invigilators: pickInvigilators(course, bestSlot),
});
  });

  newPlaced.sort((a, b) => a.dateISO.localeCompare(b.dateISO) || a.period - b.period || b.studentCount - a.studentCount);

  setUnscheduled(notPlaced);
  setPreviewPage(0);
  return newPlaced;
};

const generateGeneralSchedule = () => {
  const placed = generateScheduleForCourses(generalCourses, []);
  setGeneralSchedule(placed);
  showToast("تم توزيع الدراسات العامة", `تم توزيع ${placed.length} مقرر.`, "success");
  setCurrentStep(5);
};

const generateSpecializedSchedule = () => {
  const placed = generateScheduleForCourses(specializedCourses, generalSchedule);
  setSpecializedSchedule(placed);
  setPreviewTab("sortedCourses");

  const merged = [...generalSchedule, ...placed].sort(
    (a, b) => a.dateISO.localeCompare(b.dateISO) || a.period - b.period || b.studentCount - a.studentCount
  );

  setSchedule(merged);
  showToast("تم توزيع مقررات التخصص", `تم توزيع ${placed.length} مقرر.`, "success");
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
  if (printDepartmentFilter === "__all__") return parsed.courses;
  return parsed.courses.filter((item) => {
    const roots = item.departmentRoots || [];
    return roots.includes(normalizeArabic(printDepartmentFilter));
  });
}, [parsed.courses, printDepartmentFilter]);

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
    return Array.from(new Set(baseInvigilators)).sort((a, b) => a.localeCompare(b, "ar"));
  }, [manualInvigilators, parsed.invigilators]);

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

  schedule.forEach((item) => {
    splitBySlash(item.major).forEach((major) => {
      const clean = String(major || "").trim();
      const normalized = normalizeArabic(clean);

      if (!clean) return;

      if (!map.has(normalized)) {
        map.set(normalized, clean);
      }
    });
  });

  return Array.from(map.values()).sort((a, b) => a.localeCompare(b, "ar"));
}, [schedule]);
  
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

  const stats = {
    rows: rows.length,
    students: parsed.studentsCount,
    courses: parsed.courses.length,
    generalCourses: generalCourses.length,
    specializedCourses: specializedCourses.length,
    invigilators: parsed.invigilators.length,
  };

  return (
    <div
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
        onClose={() => setToast(null)}
        onRestore={restoreSavedSession}
      />

      <div style={{ maxWidth: 1450, margin: "0 auto" }}>
        <div
          style={{
            background: `linear-gradient(135deg, ${COLORS.primaryDark} 0%, ${COLORS.primary} 60%, #5CC7C2 100%)`,
            color: "#fff",
            borderRadius: 34,
            padding: 30,
            boxShadow: "0 20px 46px rgba(20,123,131,0.22)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 20,
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ fontSize: 32, fontWeight: 900 }}>نظام بناء جدول الاختبارات النهائية</div>
              <div style={{ color: "rgba(255,255,255,0.92)", marginTop: 10, lineHeight: 1.9 }}>
                نسخة احترافية مخصصة للكليات التقنية في المملكة العربية السعودية، بهوية لونية مستوحاة من المؤسسة العامة للتدريب التقني والمهني.
              </div>
            </div>

            <div
              style={{
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.22)",
                borderRadius: 24,
                padding: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 140,
              }}
            >
              <img
                src={LOGO_SRC}
                alt="شعار المؤسسة العامة للتدريب التقني والمهني"
                style={{
                  width: 95,
                  height: "auto",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 16,
            marginTop: 20,
          }}
        >
          <StatBox label="السجلات" value={stats.rows} />
          <StatBox label="المتدربون" value={stats.students} />
          <StatBox label="المقررات" value={stats.courses} />
          <StatBox label="الدراسات العامة" value={stats.generalCourses} />
          <StatBox label="التخصص" value={stats.specializedCourses} />
          <StatBox label="المراقبون" value={stats.invigilators} />
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20, marginBottom: 20 }}>
          {[
            { id: 1, label: "1. رفع الملف" },
            { id: 2, label: "2. المقررات" },
            { id: 3, label: "3. المراقبون" },
            { id: 4, label: "4. الدراسات العامة" },
            { id: 5, label: "5. التخصص" },
            { id: 6, label: "6. المعاينة والطباعة" },
          ].map((step) => (
            <StepButton key={step.id} active={currentStep === step.id} done={currentStep > step.id} onClick={() => setCurrentStep(step.id)}>
              {step.label}
            </StepButton>
          ))}
        </div>
<div
  style={{
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
    marginBottom: 20,
  }}
>
  <button onClick={exportSavedSession} style={cardButtonStyle()}>
    تصدير الجدول
  </button>

  <button onClick={() => importSessionRef.current?.click()} style={cardButtonStyle()}>
    استيراد الجدول
  </button>

  <button onClick={clearSavedState} style={cardButtonStyle({ danger: true })}>
    حذف الحفظ
  </button>

  <input
    ref={importSessionRef}
    type="file"
    accept=".json,application/json"
    style={{ display: "none" }}
    onChange={(e) => importSavedSession(e.target.files?.[0])}
  />
</div>
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
                <input value={parsed.collegeName || ""} readOnly style={fieldStyle()} />
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
              <div style={{ marginBottom: 8, fontWeight: 800 }}>أوقات الفترات المرنة</div>
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
              <div style={{ marginBottom: 8, fontWeight: 800 }}>قاعات الاختبار</div>
              <textarea
                value={examHallsText}
                onChange={(e) => setExamHallsText(e.target.value)}
                style={{ ...fieldStyle(), minHeight: 100, resize: "vertical" }}
                placeholder={"قاعة النشاط|120\nالمعمل 1|40\nالمعمل 2|25"}
              />
              <div style={{ marginTop: 6, color: COLORS.muted, fontSize: 13 }}>
                اكتب كل قاعة في سطر مستقل بهذه الصيغة: اسم القاعة|السعة
              </div>
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
              description="استبعد المقررات التي لا تريد إدخالها في الجدولة، ويمكنك أيضًا تحديد مستويات المقررات لمنع مقررات المستوى الواحد من الوقوع في نفس اليوم."
            />

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
                جعل المقررات ذات المستوى الواحد لا تكون في نفس اليوم
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
                  اسحب المقرر إلى مربع المستوى المناسب. ويمكنك أيضًا إعادة المقرر إلى قائمة المقررات غير المصنفة.
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
            <SectionHeader title="الصفحة الثالثة: المراقبون" description="حدّد طريقة توزيع المراقبين قبل إنشاء الجدول." />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 12,
                marginTop: 18,
              }}
            >
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
                <input type="checkbox" checked={includeInvigilators} onChange={(e) => setIncludeInvigilators(e.target.checked)} />
                إضافة المراقبين تلقائيًا
              </label>

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
                <input
                  type="checkbox"
                  checked={preferCourseTrainerInvigilation}
                  onChange={(e) => setPreferCourseTrainerInvigilation(e.target.checked)}
                />
                جعل مدرب المقرر يراقب في مقرره بشكل أساسي
              </label>
            </div>

            {includeInvigilators ? (
              <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 14 }}>
                  <div>
                    <div style={{ marginBottom: 8, fontWeight: 800 }}>أسماء المراقبين</div>
                    <textarea
                      value={manualInvigilators}
                      onChange={(e) => setManualInvigilators(e.target.value)}
                      placeholder="اتركه فارغًا لسحب الأسماء تلقائيًا من عمود المدرب في الملف، أو اكتب كل اسم في سطر مستقل"
                      style={{ ...fieldStyle(), minHeight: 120, resize: "vertical" }}
                    />
                  </div>

                  <div style={{ display: "grid", gap: 12 }}>
                    <div>
                      <div style={{ marginBottom: 8, fontWeight: 800 }}>طريقة توزيع المراقبين</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          onClick={() => setInvigilationMode("fixed")}
                          style={{
                            border: `1px solid ${invigilationMode === "fixed" ? COLORS.primaryDark : COLORS.border}`,
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
                          onClick={() => setInvigilationMode("ratio")}
                          style={{
                            border: `1px solid ${invigilationMode === "ratio" ? COLORS.primaryDark : COLORS.border}`,
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
                      <div>
                        <div style={{ marginBottom: 8, fontWeight: 800 }}>عدد المراقبين لكل مقرر</div>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={invigilatorsPerPeriod}
                          onChange={(e) => setInvigilatorsPerPeriod(safeNum(e.target.value, 4))}
                          style={fieldStyle()}
                        />
                      </div>
                    ) : (
                      <div>
                        <div style={{ marginBottom: 8, fontWeight: 800 }}>عدد المتدربين لكل مراقب</div>
                        <input
                          type="number"
                          min="1"
                          max="200"
                          value={studentsPerInvigilator}
                          onChange={(e) => setStudentsPerInvigilator(safeNum(e.target.value, 17))}
                          style={fieldStyle()}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 14 }}>
                  <div style={{ fontWeight: 800, marginBottom: 10 }}>استبعاد مراقبين من التوزيع</div>
                  <div style={{ color: COLORS.muted, fontSize: 14, marginBottom: 10 }}>
                    يتم جلب الأسماء تلقائيًا من الملف، ويمكنك اختيار من لا يراقب.
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {availableInvigilators.length ? (
                      availableInvigilators.map((name) => {
                        const excluded = excludedInvigilators.some((item) => normalizeArabic(item) === normalizeArabic(name));

                        return (
                          <button
                            key={name}
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
                  <button onClick={() => setCurrentStep(2)} style={cardButtonStyle()}>
                    السابق
                  </button>

                  <button onClick={() => setCurrentStep(4)} style={cardButtonStyle({ active: true })}>
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
            </div>
          </Card>
        )}

        {currentStep === 5 && (
          <Card>
            <SectionHeader title="الصفحة الخامسة: توزيع مقررات التخصص" description="بعد الانتهاء من الدراسات العامة، وزّع الآن مقررات التخصص." />

            <div style={{ marginBottom: 16, color: COLORS.charcoalSoft }}>
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
            </div>
          </Card>
        )}

        {currentStep === 6 && (
          <>
            <div style={{ marginTop: 20 }}>
              <Card>
                <SectionHeader
                  title="المعاينة والطباعة"
                  description="اختر التبويب المناسب، ويمكنك أيضًا تحديد القسم لتطبيقه على المعاينة والطباعة والتصدير."
                />

                <div style={{ marginBottom: 12 }}>
                  <div style={{ marginBottom: 8, fontWeight: 800 }}>القسم المطلوب</div>
                  <select
                    value={printDepartmentFilter}
                    onChange={(e) => {
                      setPrintDepartmentFilter(e.target.value);
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

                  <button
                    onClick={() => setPreviewTab("print")}
                    style={cardButtonStyle({ active: previewTab === "print" })}
                  >
                    الطباعة
                  </button>
                </div>

                <div
                  style={{
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 16,
                    padding: 12,
                    background: "#F8FEFE",
                    color: COLORS.muted,
                    lineHeight: 1.9,
                  }}
                >
                  عند اختيار قسم رئيسي محدد، ستتم فلترة المعاينة والطباعة والتصدير وفق هذا القسم،
                  مع محاولة ضم مقررات الدراسات العامة المرتبطة به.
                </div>

                {previewTab === "print" ? (
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
                    <button onClick={() => setCurrentStep(5)} style={cardButtonStyle()}>
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
})
                      }
                      style={cardButtonStyle({ active: true })}
                    >
                      طباعة جدول الاختبارات
                    </button>

                    <button
                      onClick={() =>
                        printInvigilatorsOnlyPdf({
                          collegeName: parsed.collegeName,
                          invigilatorTable,
                        })
                      }
                      style={cardButtonStyle()}
                    >
                      طباعة جدول المراقبين
                    </button>
                  </div>
                ) : null}
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
                          {["المقرر", "الرمز", "القسم / الشعبة", "المدرب", "عدد المتدربين", "التعارضات"].map((label) => (
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
                            <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{course.conflictDegree}</td>
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
                                  {["الفترة", "الوقت", "اسم المقرر", "الرمز", "قاعة الاختبار", "القسم / الشعبة", "المدرب", "عدد المتدربين", "المراقبون"].map((head) => (
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
                                {items.map((item) => (
                                  <tr key={`${item.key}-${item.id}`}>
                                    <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9", fontWeight: 800 }}>{item.period}</td>
                                    <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{item.timeText}</td>
                                    <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{item.courseName}</td>
                                    <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{item.courseCode}</td>
                                    <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{item.examHall || "-"}</td>
                                    <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{item.sectionName}</td>
                                    <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{item.trainerText}</td>
                                    <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{item.studentCount}</td>
                                    <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{(item.invigilators || []).join("، ") || "-"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {unscheduled.length ? (
                    <div
                      style={{
                        marginTop: 18,
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
                    في الطباعة الجديدة: أسماء المراقبين تظهر يمين الجدول، والأعمدة تمثل الأيام، وتحت كل يوم تظهر الفترات المسندة للمراقب.
                  </div>

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
                    <button onClick={exportInvigilatorsTable} style={cardButtonStyle()}>
                      تصدير جدول المراقبين
                    </button>

                    <button
                      onClick={() =>
                        printInvigilatorsOnlyPdf({
                          collegeName: parsed.collegeName,
                          invigilatorTable,
                        })
                      }
                      style={cardButtonStyle({ active: true })}
                    >
                      طباعة جدول المراقبين
                    </button>
                  </div>
                </Card>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
