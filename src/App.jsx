import React, { useMemo, useRef, useState } from "react";
import Papa from "papaparse";

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
const EXCLUDED_REGISTRATION = ["انسحاب فصلي", "مطوي قيده", "معتذر", "منسحب"];
const EXCLUDED_TRAINEE = ["مطوي قيده", "انسحاب فصلي", "مطوي قيده لإنقطاع أسبوعين"];

const COLORS = {
  primary: "#1FA7A8",
  primaryDark: "#147B83",
  primarySoft: "#DDF5F3",
  primaryBorder: "#9ED9D6",
  charcoal: "#2C3135",
  charcoalSoft: "#596066",
  ink: "#1F2529",
  muted: "#6B7280",
  bgTop: "#EAF7F6",
  bgMid: "#F7FBFB",
  bgBottom: "#FFFFFF",
  card: "#FFFFFF",
  border: "#D7E7E6",
  borderStrong: "#B8D6D3",
  danger: "#B42318",
  dangerBg: "#FEF3F2",
  success: "#067647",
  successBg: "#ECFDF3",
  warning: "#B54708",
  warningBg: "#FFF7ED",
};
const LOGO_SRC = "/tvtc-logo.png";
function normalizeArabic(value) {
  return String(value ?? "")
    .trim()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/أ|إ|آ/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
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

function fieldStyle() {
  return {
    width: "100%",
    boxSizing: "border-box",
    border: `1px solid ${COLORS.borderStrong}`,
    borderRadius: 16,
    padding: "12px 14px",
    background: "#fff",
    outline: "none",
    fontFamily: "inherit",
    fontSize: 15,
    color: COLORS.ink,
  };
}

function toggleDay(list, day) {
  return list.includes(day) ? list.filter((d) => d !== day) : [...list, day];
}

function parseTimeToMinutes(time) {
  const match = String(time || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function minutesToTimeText(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function parsePeriodsText(periodsText) {
  return String(periodsText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const normalized = line.replace(/\s+/g, "");
      const match = normalized.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
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

  const allowed = new Set(selectedDays);
  const validPeriods = parsedPeriods.filter((p) => p.valid);
  if (!validPeriods.length) return [];

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
  const escapeCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCell(row[header])).join(",")),
  ].join("\n");
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

function printSchedulePdf({
  collegeName,
  schedule,
  invigilatorTable,
  periodLabels = [],
  defaultExamHall = "قاعة النشاط",
}) {
  const printWindow = window.open("", "_blank", "width=1400,height=900");
  if (!printWindow) return;

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

  const instructions = [
    "يجب على المتدرب الحضور إلى قاعة الاختبار قبل موعد الاختبار بـ 15 دقيقة.",
    "لا يسمح للمتدرب بدخول الاختبار بعد مضي نصف ساعة من بدايته، ولا يسمح له بالخروج قبل مضي نصف ساعة.",
    "قيام المتدرب بالغش أو محاولة الغش يعد مخالفة لتعليمات وقواعد إجراء الاختبارات، وترصد له درجة (صفر) في اختبار ذلك المقرر.",
    "وجود الجوال أو أي أوراق تخص المقرر في حوزة المتدرب يعد شروعًا في الغش وتطبق عليه قواعد إجراءات الاختبارات.",
    "لا يسمح للمتدرب المحروم بدخول الاختبارات النهائية.",
    "يتطلب حصول المتدرب على 25% من درجة الاختبار النهائي حتى يجتاز المقرر التدريبي بالكليات التقنية.",
    "يجب على المتدرب التقيد بالزي التدريبي والالتزام بالهدوء داخل قاعة الاختبار.",
  ];

  const html = `
    <html dir="rtl" lang="ar">
      <head>
        <title>جدول الاختبارات النهائية</title>
        <style>
          @page { size: A4 portrait; margin: 8mm; }
          body {
            font-family: Tahoma, Arial, sans-serif;
            margin: 0;
            color: #111;
            direction: rtl;
            background: #fff;
          }
          .print-logo-wrap {
  text-align: center;
  margin-bottom: 6px;
}

.print-logo {
  width: 78px;
  height: auto;
  object-fit: contain;
}
          .page { width: 100%; }
          .top-head { margin-bottom: 8px; }
          .college-line {
            text-align: center;
            font-weight: 700;
            font-size: 20px;
            margin-bottom: 4px;
            color: #147B83;
          }
          .meta-line {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            flex-wrap: wrap;
            font-size: 13px;
            margin-bottom: 6px;
          }
          .meta-box { flex: 1; min-width: 180px; }
          .schedule-title {
            text-align: center;
            font-size: 18px;
            font-weight: 700;
            margin: 6px 0 8px;
            color: #2C3135;
          }
          .period-head {
            display: grid;
            grid-template-columns: 160px repeat(${periodIds.length}, 1fr);
            border: 1px solid #000;
            border-bottom: 0;
          }
          .period-head .empty-head {
            border-left: 1px solid #000;
            min-height: 58px;
          }
          .period-box {
            border-left: 1px solid #000;
            padding: 6px 8px;
            text-align: center;
            font-size: 13px;
            font-weight: 700;
            line-height: 1.6;
          }
          .period-box:last-child, .empty-head:last-child { border-left: 0; }
          table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
          }
          th, td {
            border: 1px solid #000;
            padding: 4px 6px;
            font-size: 12px;
            text-align: center;
            vertical-align: middle;
            word-wrap: break-word;
          }
          thead th {
            background: #fff;
            font-weight: 700;
          }
          .day-col { width: 160px; font-weight: 700; }
          .num-cell { width: 32px; }
          .course-cell { width: 160px; }
          .code-cell { width: 78px; }
          .hall-cell { width: 90px; }
          .instructions {
            margin-top: 10px;
            font-size: 11px;
            line-height: 1.9;
          }
          .instructions-title {
            font-weight: 700;
            margin-bottom: 4px;
          }
          .instructions ol {
            margin: 0;
            padding-right: 18px;
          }
          .page-break { page-break-before: always; }
          .inv-table-title {
            text-align: center;
            font-size: 18px;
            font-weight: 700;
            margin: 10px 0;
            color: #2C3135;
          }
          .footer-date {
            text-align: left;
            font-size: 11px;
            margin-top: 6px;
          }
        </style>
      </head>
      <body>
        <div class="page">
<div class="top-head">
  <div class="print-logo-wrap">
    <img class="print-logo" src="${window.location.origin + LOGO_SRC}" alt="TVTC Logo" />
  </div>
  <div class="college-line">${collegeName || "الكلية التقنية"}</div>
            <div class="meta-line">
              <div class="meta-box"><strong>قسم:</strong> جميع الأقسام</div>
              <div class="meta-box"><strong>تخصص:</strong> جميع التخصصات</div>
              <div class="meta-box"><strong>تاريخ الطباعة:</strong> ${todayText}</div>
            </div>
            <div class="schedule-title">جدول الاختبارات النهائية</div>
          </div>

          <div class="period-head">
            <div class="empty-head"></div>
            ${resolvedPeriodLabels
              .map(
                (p) => `
                  <div class="period-box">
                    <div>${p.label}</div>
                    <div>${p.timeText ? `من ${p.timeText}` : ""}</div>
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
                      <th>مقر الاختبار</th>
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
                              ? `<td class="day-col" rowspan="${rowsCount}">
                                  <div>${day.dayName}</div>
                                  <div>${day.hijriNumeric}</div>
                                </td>`
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

          <div class="instructions">
            <div class="instructions-title">تعليمات وإرشادات</div>
            <ol>
              ${instructions.map((item) => `<li>${item}</li>`).join("")}
            </ol>
          </div>
        </div>

        <div class="page-break"></div>

<div class="page">
  <div class="print-logo-wrap">
    <img class="print-logo" src="${window.location.origin + LOGO_SRC}" alt="TVTC Logo" />
  </div>
  <div class="college-line">${collegeName || "الكلية التقنية"}</div>
          <div class="inv-table-title">جدول المراقبين وفترات المراقبة</div>

          <table>
            <thead>
              <tr>
                <th>المراقب</th>
                <th>التاريخ</th>
                <th>اليوم</th>
                <th>الفترة</th>
                <th>الوقت</th>
                <th>المقرر</th>
                <th>الرمز</th>
              </tr>
            </thead>
            <tbody>
              ${invigilatorTable
                .flatMap((inv) =>
                  inv.items.map(
                    (item, idx) => `
                      <tr>
                        ${idx === 0 ? `<td rowspan="${inv.items.length}">${inv.name}</td>` : ""}
                        <td>${item.gregorian}</td>
                        <td>${item.dayName}</td>
                        <td>${item.period}</td>
                        <td>${item.timeText}</td>
                        <td>${item.courseName}</td>
                        <td>${item.courseCode}</td>
                      </tr>
                    `
                  )
                )
                .join("")}
            </tbody>
          </table>

          <div class="footer-date">${todayText}</div>
        </div>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 400);
}

function Toast({ item, onClose }) {
  if (!item) return null;

  const bg =
    item.type === "error"
      ? COLORS.dangerBg
      : item.type === "warning"
      ? COLORS.warningBg
      : COLORS.successBg;

  const border =
    item.type === "error"
      ? "#FECACA"
      : item.type === "warning"
      ? "#FED7AA"
      : "#A7F3D0";

  const color =
    item.type === "error"
      ? COLORS.danger
      : item.type === "warning"
      ? COLORS.warning
      : COLORS.success;

  return (
    <div
      style={{
        position: "fixed",
        top: 20,
        left: 20,
        zIndex: 9999,
        width: "min(380px, calc(100vw - 32px))",
        background: bg,
        border: `1px solid ${border}`,
        color,
        borderRadius: 18,
        padding: 16,
        boxShadow: "0 16px 35px rgba(20, 123, 131, 0.16)",
      }}
    >
      <div style={{ fontWeight: 800, marginBottom: 6 }}>{item.title}</div>
      <div style={{ fontSize: 14, lineHeight: 1.7 }}>{item.description}</div>
      <button
        onClick={onClose}
        style={{
          marginTop: 10,
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

function StepButton({ active, done, children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: `1px solid ${
          active ? COLORS.primaryDark : done ? COLORS.primaryBorder : COLORS.borderStrong
        }`,
        background: active ? COLORS.primaryDark : done ? COLORS.primarySoft : "#fff",
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

export default function App() {
  const fileRef = useRef(null);

  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [toast, setToast] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  const [currentStep, setCurrentStep] = useState(1);

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });

  const [numberOfDays, setNumberOfDays] = useState(10);
  const [selectedDays, setSelectedDays] = useState([
    "الأحد",
    "الاثنين",
    "الثلاثاء",
    "الأربعاء",
    "الخميس",
  ]);
  const [periodsText, setPeriodsText] = useState("07:45-09:00\n09:15-11:00");
  const [examHallsText, setExamHallsText] = useState("قاعة النشاط|120");
  const [previewPage, setPreviewPage] = useState(0);

  const [includeInvigilators, setIncludeInvigilators] = useState(true);
  const [excludedInvigilators, setExcludedInvigilators] = useState([]);
  const [excludeInactive, setExcludeInactive] = useState(true);
  const [prioritizeTrainer, setPrioritizeTrainer] = useState("");
  const [manualInvigilators, setManualInvigilators] = useState("");
  const [invigilatorsPerPeriod, setInvigilatorsPerPeriod] = useState(2);
  const [excludedCourses, setExcludedCourses] = useState([]);
  const [preferCourseTrainerInvigilation, setPreferCourseTrainerInvigilation] = useState(true);

  const [schedule, setSchedule] = useState([]);
  const [unscheduled, setUnscheduled] = useState([]);

  const showToast = (title, description, type = "success") => {
    setToast({ title, description, type });
    window.clearTimeout(window.__examToastTimer);
    window.__examToastTimer = window.setTimeout(() => setToast(null), 3500);
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
        setUnscheduled([]);
        setExcludedCourses([]);
        setPreviewPage(0);
        setCurrentStep(2);
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

      const badReg = EXCLUDED_REGISTRATION.some((item) =>
        regStatus.includes(normalizeArabic(item))
      );
      const badTrainee = EXCLUDED_TRAINEE.some((item) =>
        traineeStatus.includes(normalizeArabic(item))
      );

      return !badReg && !badTrainee;
    });

    const courseMap = new Map();
    const studentSet = new Set();
    const studentCourseMap = new Map();
    const invigilatorSet = new Set();
    const sectionSet = new Set();

    filteredRows.forEach((row) => {
      const courseCode = String(row["المقرر"] ?? "").trim();
      const courseName = String(row["اسم المقرر"] ?? "").trim();
      const trainer = String(row["المدرب"] ?? "").trim();
      const studentId = String(row["رقم المتدرب"] ?? "").trim();
      const department = String(row["القسم"] ?? "").trim();
      const major = String(row["التخصص"] ?? "").trim();
      const scheduleType = String(row["نوع الجدولة"] ?? "").trim();
      const sectionName = `${department || "-"} / ${major || "-"}`;

      if (!courseCode && !courseName) return;

      const normalizedCourseCode = normalizeArabic(courseCode).replace(/\s+/g, " ");
      const normalizedCourseName = normalizeArabic(courseName).replace(/\s+/g, " ");
      const key = [normalizedCourseCode, normalizedCourseName].join("|");

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
        });
      }

      const course = courseMap.get(key);

      if (trainer) course.trainers.add(trainer);
      if (department) course.departments.add(department);
      if (major) course.majors.add(major);
      if (sectionName !== "- / -") course.sectionNames.add(sectionName);
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

    const courses = Array.from(courseMap.values())
      .map((course) => {
        const studentCount = course.students.size;
        const conflictDegree = conflictMap.get(course.key)?.size || 0;
        const scheduleTypeText = Array.from(course.scheduleTypes).join(" / ");
        const trainerText = Array.from(course.trainers).join(" / ");
        const sectionName = Array.from(course.sectionNames).join(" / ") || "-";
        const department = Array.from(course.departments).join(" / ");
        const major = Array.from(course.majors).join(" / ");

        const practicalWeight = normalizeArabic(scheduleTypeText).includes("عملي") ? 3 : 2;
        const studentWeight = studentCount >= 80 ? 5 : studentCount >= 40 ? 4 : studentCount >= 20 ? 3 : 2;
        const lowOpportunityWeight = conflictDegree >= 15 ? 5 : conflictDegree >= 8 ? 4 : conflictDegree >= 4 ? 3 : 2;
        const trainerWeight =
          prioritizeTrainer &&
          prioritizeTrainer.trim() !== "" &&
          normalizeArabic(trainerText).includes(normalizeArabic(prioritizeTrainer))
            ? 5
            : 0;

        const priorityScore =
          practicalWeight * 2 + studentWeight * 3 + lowOpportunityWeight * 3 + trainerWeight;

        return {
          ...course,
          department,
          major,
          scheduleType: scheduleTypeText,
          trainerText,
          studentCount,
          conflictDegree,
          priorityScore,
          sectionName,
        };
      })
      .filter((course) => !excludedCourses.includes(course.key))
      .sort(
        (a, b) =>
          b.priorityScore - a.priorityScore ||
          b.studentCount - a.studentCount ||
          b.conflictDegree - a.conflictDegree
      );

    return {
      missingColumns,
      filteredRows,
      collegeName: filteredRows[0]?.["الوحدة"] || rows[0]?.["الوحدة"] || "الكلية التقنية",
      courses,
      studentsCount: studentSet.size,
      invigilators: Array.from(invigilatorSet).sort((a, b) => a.localeCompare(b, "ar")),
      sections: Array.from(sectionSet).sort((a, b) => a.localeCompare(b, "ar")),
    };
  }, [rows, excludeInactive, prioritizeTrainer, excludedCourses]);

  const parsedPeriods = useMemo(() => parsePeriodsText(periodsText), [periodsText]);
  const invalidPeriods = parsedPeriods.filter((p) => !p.valid);

  const examHalls = useMemo(() => {
    return String(examHallsText || "")
      .split(/\r?\n/)
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

      const normalizedCourseCode = normalizeArabic(courseCode).replace(/\s+/g, " ");
      const normalizedCourseName = normalizeArabic(courseName).replace(/\s+/g, " ");
      const key = [normalizedCourseCode, normalizedCourseName].join("|");

      if (!map.has(key)) {
        map.set(key, {
          key,
          label: `${courseName} - ${courseCode}`,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "ar"));
  }, [rows]);

  const generateSchedule = () => {
    if (!rows.length) {
      return showToast("لا يوجد ملف", "ارفع ملف CSV أولاً.", "error");
    }

    if (parsed.missingColumns.length) {
      return showToast("أعمدة ناقصة", `الملف ينقصه: ${parsed.missingColumns.join("، ")}`, "error");
    }

    if (invalidPeriods.length) {
      return showToast("أوقات غير صحيحة", "تحقق من تنسيق الأوقات. مثال صحيح: 07:45-09:00", "error");
    }

    if (!slots.length) {
      return showToast("لا توجد فترات", "اختر تاريخ بداية وأيامًا وعدد أيام مناسبًا مع أوقات صحيحة.", "error");
    }

    const hallsPool = examHalls.length ? examHalls : [{ name: "قاعة النشاط", capacity: null }];

    const baseInvigilators = manualInvigilators
      ? manualInvigilators.split(/\r?\n/).map((name) => name.trim()).filter(Boolean)
      : parsed.invigilators;

    const invigilatorPool = [
      ...new Set(
        baseInvigilators.filter(
          (name) =>
            !excludedInvigilators.some(
              (excluded) => normalizeArabic(excluded) === normalizeArabic(name)
            )
        )
      ),
    ];

    const studentSlotMap = new Map();
    const studentDayMap = new Map();
    const slotCoursesMap = new Map(slots.map((slot) => [slot.id, []]));
    const invigilatorLoad = new Map(invigilatorPool.map((name) => [name, 0]));
    const invigilatorBusySlots = new Map(invigilatorPool.map((name) => [name, new Set()]));

    const pickInvigilators = (course, slot) => {
      if (!includeInvigilators) return [];

      const courseTrainerNames = course.trainerText
        .split("/")
        .map((name) => normalizeArabic(name.trim()))
        .filter(Boolean);

      const chosen = [];

      if (preferCourseTrainerInvigilation) {
        const trainerCandidates = invigilatorPool
          .filter((name) => courseTrainerNames.includes(normalizeArabic(name)))
          .filter((name) => !invigilatorBusySlots.get(name)?.has(slot.id))
          .sort(
            (a, b) =>
              (invigilatorLoad.get(a) || 0) - (invigilatorLoad.get(b) || 0) ||
              a.localeCompare(b, "ar")
          );

        for (const trainerName of trainerCandidates) {
          if (chosen.length >= invigilatorsPerPeriod) break;
          chosen.push(trainerName);
        }
      }

      const remaining = invigilatorPool
        .filter((name) => !chosen.includes(name))
        .filter((name) => !invigilatorBusySlots.get(name)?.has(slot.id))
        .sort(
          (a, b) =>
            (invigilatorLoad.get(a) || 0) - (invigilatorLoad.get(b) || 0) ||
            a.localeCompare(b, "ar")
        );

      for (const name of remaining) {
        if (chosen.length >= invigilatorsPerPeriod) break;
        chosen.push(name);
      }

      chosen.forEach((name) => {
        invigilatorLoad.set(name, (invigilatorLoad.get(name) || 0) + 1);
        invigilatorBusySlots.get(name).add(slot.id);
      });

      return chosen;
    };

    const scoreSlot = (course, slot) => {
      let hardConflict = false;
      let sameDayPenalty = 0;
      const slotLoadPenalty = (slotCoursesMap.get(slot.id)?.length || 0) * 6;

      course.students.forEach((studentId) => {
        const usedSlots = studentSlotMap.get(studentId) || new Set();
        if (usedSlots.has(slot.id)) hardConflict = true;

        const dayMap = studentDayMap.get(studentId) || new Map();
        const sameDayCount = dayMap.get(slot.dateISO) || 0;

        if (sameDayCount >= 2) hardConflict = true;
        if (sameDayCount === 1) sameDayPenalty += 4;
      });

      if (hardConflict) return Number.POSITIVE_INFINITY;

      let score = slotLoadPenalty + sameDayPenalty;
      if (
        normalizeArabic(course.scheduleType).includes("عملي") &&
        slot.period === parsedPeriods.filter((p) => p.valid).length
      ) {
        score += 2;
      }
      if (course.conflictDegree > 10 && slot.period > 1) score += 1;
      return score;
    };

    const placed = [];
    const notPlaced = [];

    parsed.courses.forEach((course) => {
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

      const usedHallNamesInSlot = placed
        .filter((item) => item.id === bestSlot.id)
        .map((item) => item.examHall);

      const fittingHalls = hallsPool.filter(
        (hall) =>
          !usedHallNamesInSlot.includes(hall.name) &&
          (hall.capacity === null || hall.capacity >= course.studentCount)
      );

      const remainingHalls = hallsPool.filter(
        (hall) => !usedHallNamesInSlot.includes(hall.name)
      );

      let assignedHall = null;

      if (fittingHalls.length) {
        assignedHall = fittingHalls[0].name;
      } else if (remainingHalls.length) {
        assignedHall = remainingHalls[remainingHalls.length - 1].name;
      } else {
        assignedHall = hallsPool[hallsPool.length - 1]?.name || "قاعة النشاط";
      }

      slotCoursesMap.get(bestSlot.id).push(course.key);

      placed.push({
        ...course,
        ...bestSlot,
        examHall: assignedHall,
        invigilators: pickInvigilators(course, bestSlot),
      });
    });

    placed.sort(
      (a, b) =>
        a.dateISO.localeCompare(b.dateISO) ||
        a.period - b.period ||
        b.studentCount - a.studentCount
    );

    setSchedule(placed);
    setUnscheduled(notPlaced);
    setPreviewPage(0);
    setCurrentStep(4);

    if (notPlaced.length) {
      showToast(
        "تم إنشاء الجدول جزئيًا",
        `تمت جدولة ${placed.length} مقرر وتعذر جدولة ${notPlaced.length} مقرر. زد عدد الأيام أو عدّل الفترات الزمنية.`,
        "warning"
      );
    } else {
      showToast("تم إنشاء الجدول", `تمت جدولة ${placed.length} مقرر بنجاح.`, "success");
    }
  };

  const groupedSchedule = useMemo(() => {
    return schedule.reduce((acc, item) => {
      if (!acc[item.dateISO]) acc[item.dateISO] = [];
      acc[item.dateISO].push(item);
      return acc;
    }, {});
  }, [schedule]);

  const groupedScheduleEntries = useMemo(() => Object.entries(groupedSchedule), [groupedSchedule]);

  const daysPerPage = 5;
  const totalPreviewPages = Math.max(1, Math.ceil(groupedScheduleEntries.length / daysPerPage));

  const paginatedGroupedSchedule = useMemo(() => {
    const start = previewPage * daysPerPage;
    return groupedScheduleEntries.slice(start, start + daysPerPage);
  }, [groupedScheduleEntries, previewPage]);

  const invigilatorTable = useMemo(() => {
    const table = new Map();

    schedule.forEach((item) => {
      item.invigilators.forEach((name) => {
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
  }, [schedule]);

  const availableInvigilators = useMemo(() => {
    const baseInvigilators = manualInvigilators
      ? manualInvigilators.split(/\r?\n/).map((name) => name.trim()).filter(Boolean)
      : parsed.invigilators;

    return Array.from(new Set(baseInvigilators)).sort((a, b) => a.localeCompare(b, "ar"));
  }, [manualInvigilators, parsed.invigilators]);

  const toggleExcludedInvigilator = (name) => {
    setExcludedInvigilators((prev) =>
      prev.some((item) => normalizeArabic(item) === normalizeArabic(name))
        ? prev.filter((item) => normalizeArabic(item) !== normalizeArabic(name))
        : [...prev, name]
    );
  };

  const toggleExcludedCourse = (courseKey) => {
    setExcludedCourses((prev) =>
      prev.includes(courseKey)
        ? prev.filter((item) => item !== courseKey)
        : [...prev, courseKey]
    );
  };

  const exportMainSchedule = () => {
    if (!schedule.length) {
      return showToast("لا يوجد جدول", "أنشئ الجدول أولًا ثم صدّر الملف.", "error");
    }

    const exportRows = schedule.map((item) => ({
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
      المراقبون: item.invigilators.join(" | "),
    }));

    downloadFile(
      `final-exam-schedule-${(fileName || "technical-college").replace(/\.[^.]+$/, "")}.csv`,
      rowsToCsv(exportRows),
      "text/csv;charset=utf-8"
    );

    showToast("تم التصدير", "تم تنزيل جدول الاختبارات CSV.", "success");
  };

  const exportInvigilatorsTable = () => {
    if (!invigilatorTable.length) {
      return showToast("لا يوجد توزيع", "أنشئ الجدول أولًا ثم صدّر جدول المراقبين.", "error");
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
    invigilators: parsed.invigilators.length,
    sections: parsed.sections.length,
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: `linear-gradient(135deg, ${COLORS.bgTop} 0%, ${COLORS.bgMid} 35%, ${COLORS.bgBottom} 100%)`,
        padding: "24px 16px 60px",
        direction: "rtl",
        fontFamily: "Cairo, Tahoma, Arial, sans-serif",
        color: COLORS.ink,
      }}
    >
      <Toast item={toast} onClose={() => setToast(null)} />

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
        نسخة احترافية مخصصة للكليات التقنية في المملكة العربية السعودية، بهوية لونية
        مستوحاة من المؤسسة العامة للتدريب التقني والمهني.
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
          <StatBox label="المراقبون" value={stats.invigilators} />
          <StatBox label="الأقسام / الشعب" value={stats.sections} />
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            marginTop: 20,
            marginBottom: 20,
          }}
        >
          {[
            { id: 1, label: "1. رفع الملف" },
            { id: 2, label: "2. المقررات" },
            { id: 3, label: "3. المراقبون" },
            { id: 4, label: "4. المعاينة والطباعة" },
          ].map((step) => (
            <StepButton
              key={step.id}
              active={currentStep === step.id}
              done={currentStep > step.id}
              onClick={() => setCurrentStep(step.id)}
            >
              {step.label}
            </StepButton>
          ))}
        </div>

        {currentStep === 1 && (
          <Card>
            <SectionHeader
              title="الصفحة الأولى: رفع الملف والإعدادات العامة"
              description="ارفع تقرير SF01 وحدد تاريخ البداية وعدد الأيام وأوقات الفترات والقاعات."
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
                minHeight: 180,
                borderRadius: 26,
                border: `2px dashed ${dragActive ? COLORS.primaryDark : COLORS.primaryBorder}`,
                background: dragActive ? COLORS.primarySoft : "#FCFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                textAlign: "center",
                cursor: "pointer",
                transition: "0.2s",
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
                اسحب تقرير SF01 هنا أو اضغط للاختيار
              </div>
              <div style={{ marginTop: 8, color: COLORS.muted }}>CSV فقط</div>
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

            {invalidPeriods.length ? (
              <div
                style={{
                  marginTop: 14,
                  borderRadius: 18,
                  padding: 14,
                  background: COLORS.warningBg,
                  border: "1px solid #FED7AA",
                  color: COLORS.warning,
                }}
              >
                يوجد سطر أو أكثر في أوقات الفترات غير صحيح. مثال صحيح: 07:45-09:00
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
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={fieldStyle()}
                />
              </div>

              <div>
                <div style={{ marginBottom: 8, fontWeight: 800 }}>عدد أيام الاختبارات</div>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={numberOfDays}
                  onChange={(e) => setNumberOfDays(safeNum(e.target.value, 10))}
                  style={fieldStyle()}
                />
              </div>

              <div>
                <div style={{ marginBottom: 8, fontWeight: 800 }}>مدرب له ظروف خاصة</div>
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
              <div style={{ marginBottom: 10, fontWeight: 800 }}>الأقسام / الشعب</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {parsed.sections.length ? (
                  parsed.sections.map((section) => (
                    <span
                      key={section}
                      style={{
                        background: COLORS.primarySoft,
                        border: `1px solid ${COLORS.primaryBorder}`,
                        borderRadius: 999,
                        padding: "6px 12px",
                        fontSize: 13,
                        color: COLORS.primaryDark,
                      }}
                    >
                      {section}
                    </span>
                  ))
                ) : (
                  <span style={{ color: "#94A3B8" }}>لا توجد بيانات بعد</span>
                )}
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
                        border: `1px solid ${active ? COLORS.primaryDark : COLORS.borderStrong}`,
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
                <input
                  type="checkbox"
                  checked={excludeInactive}
                  onChange={(e) => setExcludeInactive(e.target.checked)}
                />
                استبعاد المنسحبين والمطوي قيدهم
              </label>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
              <button
                onClick={() => setCurrentStep(2)}
                disabled={!rows.length}
                style={{
                  background: !rows.length ? "#E5E7EB" : COLORS.primaryDark,
                  color: !rows.length ? COLORS.muted : "#fff",
                  border: "none",
                  borderRadius: 18,
                  padding: "12px 20px",
                  fontWeight: 800,
                  cursor: !rows.length ? "not-allowed" : "pointer",
                }}
              >
                التالي: تعديل المقررات
              </button>
            </div>
          </Card>
        )}

        {currentStep === 2 && (
          <Card>
            <SectionHeader
              title="الصفحة الثانية: تعديل المقررات"
              description="استبعد المقررات التي لا تريد إدخالها في الجدولة، ثم انتقل إلى صفحة المراقبين."
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
                          border: `1px solid ${excluded ? COLORS.danger : COLORS.borderStrong}`,
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

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
              <button
                onClick={() => setCurrentStep(1)}
                style={{
                  background: "#fff",
                  color: COLORS.charcoal,
                  border: `1px solid ${COLORS.borderStrong}`,
                  borderRadius: 18,
                  padding: "12px 20px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                السابق
              </button>

              <button
                onClick={() => setCurrentStep(3)}
                style={{
                  background: COLORS.primaryDark,
                  color: "#fff",
                  border: "none",
                  borderRadius: 18,
                  padding: "12px 20px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                التالي: المراقبون
              </button>
            </div>
          </Card>
        )}

        {currentStep === 3 && (
          <Card>
            <SectionHeader
              title="الصفحة الثالثة: المراقبون"
              description="إدارة المراقبين المجلوبين من الملف أو المضافين يدويًا، مع إمكانية استبعاد من لا يراقب."
            />

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
                <input
                  type="checkbox"
                  checked={includeInvigilators}
                  onChange={(e) => setIncludeInvigilators(e.target.checked)}
                />
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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 14 }}>
                  <div>
                    <div style={{ marginBottom: 8, fontWeight: 800 }}>أسماء المراقبين</div>
                    <textarea
                      value={manualInvigilators}
                      onChange={(e) => setManualInvigilators(e.target.value)}
                      placeholder="اتركه فارغًا لسحب الأسماء تلقائيًا من عمود المدرب في الملف، أو اكتب كل اسم في سطر مستقل"
                      style={{ ...fieldStyle(), minHeight: 120, resize: "vertical" }}
                    />
                  </div>

                  <div>
                    <div style={{ marginBottom: 8, fontWeight: 800 }}>عدد المراقبين لكل فترة</div>
                    <input
                      type="number"
                      min="1"
                      max="6"
                      value={invigilatorsPerPeriod}
                      onChange={(e) => setInvigilatorsPerPeriod(safeNum(e.target.value, 2))}
                      style={fieldStyle()}
                    />
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
                        const excluded = excludedInvigilators.some(
                          (item) => normalizeArabic(item) === normalizeArabic(name)
                        );

                        return (
                          <button
                            key={name}
                            onClick={() => toggleExcludedInvigilator(name)}
                            style={{
                              border: `1px solid ${
                                excluded ? COLORS.danger : COLORS.borderStrong
                              }`,
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
                  <button
                    onClick={() => setCurrentStep(2)}
                    style={{
                      background: "#fff",
                      color: COLORS.charcoal,
                      border: `1px solid ${COLORS.borderStrong}`,
                      borderRadius: 18,
                      padding: "12px 20px",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    السابق
                  </button>

                  <button
                    onClick={generateSchedule}
                    style={{
                      background: COLORS.primaryDark,
                      color: "#fff",
                      border: "none",
                      borderRadius: 18,
                      padding: "12px 20px",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    إنشاء الجدول والانتقال للمعاينة
                  </button>
                </div>
              </div>
            ) : (
              <div
                style={{
                  marginTop: 18,
                  border: `1px dashed ${COLORS.borderStrong}`,
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
          <>
            <div style={{ marginTop: 20 }}>
              <Card>
                <SectionHeader
                  title="المقررات مرتبة بالأولوية"
                  description="يعتمد الترتيب على عدد المتدربين، شدة التعارض، ونوع الجدولة."
                />

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: COLORS.primarySoft }}>
                        {[
                          "المقرر",
                          "الرمز",
                          "القسم / الشعبة",
                          "المدرب",
                          "عدد المتدربين",
                          "التعارضات",
                          "الأولوية",
                        ].map((label) => (
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
                      {parsed.courses.slice(0, 30).map((course) => (
                        <tr key={course.key}>
                          <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{course.courseName}</td>
                          <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{course.courseCode}</td>
                          <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{course.sectionName}</td>
                          <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{course.trainerText}</td>
                          <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{course.studentCount}</td>
                          <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{course.conflictDegree}</td>
                          <td
                            style={{
                              padding: 12,
                              borderBottom: "1px solid #F1F5F9",
                              fontWeight: 800,
                              color: COLORS.primaryDark,
                            }}
                          >
                            {course.priorityScore}
                          </td>
                        </tr>
                      ))}

                      {!parsed.courses.length ? (
                        <tr>
                          <td colSpan={7} style={{ padding: 20, textAlign: "center", color: "#94A3B8" }}>
                            لا توجد بيانات بعد
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>

            <div style={{ marginTop: 20 }}>
              <Card>
                <SectionHeader
                  title="جدول الاختبارات النهائي"
                  description="يتضمن التاريخ الميلادي والهجري والقاعات والأقسام والمراقبين لكل فترة."
                />

                {schedule.length ? (
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
                      style={{
                        background: previewPage === 0 ? "#E5E7EB" : "#fff",
                        color: COLORS.charcoal,
                        border: `1px solid ${COLORS.borderStrong}`,
                        borderRadius: 14,
                        padding: "10px 18px",
                        fontWeight: 800,
                        cursor: previewPage === 0 ? "not-allowed" : "pointer",
                      }}
                    >
                      السابق
                    </button>

                    <div style={{ fontWeight: 800, color: COLORS.primaryDark }}>
                      الصفحة {previewPage + 1} من {totalPreviewPages}
                    </div>

                    <button
                      onClick={() =>
                        setPreviewPage((prev) => Math.min(prev + 1, totalPreviewPages - 1))
                      }
                      disabled={previewPage >= totalPreviewPages - 1}
                      style={{
                        background:
                          previewPage >= totalPreviewPages - 1 ? "#E5E7EB" : "#fff",
                        color: COLORS.charcoal,
                        border: `1px solid ${COLORS.borderStrong}`,
                        borderRadius: 14,
                        padding: "10px 18px",
                        fontWeight: 800,
                        cursor:
                          previewPage >= totalPreviewPages - 1 ? "not-allowed" : "pointer",
                      }}
                    >
                      التالي
                    </button>
                  </div>
                ) : null}

                {!schedule.length ? (
                  <div
                    style={{
                      border: `2px dashed ${COLORS.borderStrong}`,
                      borderRadius: 22,
                      padding: 30,
                      textAlign: "center",
                      color: COLORS.muted,
                      background: "#F8FEFE",
                    }}
                  >
                    ارفع الملف ثم اضغط إنشاء الجدول ليظهر هنا.
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 18 }}>
                    {paginatedGroupedSchedule.map(([dateISO, items]) => (
                      <div
                        key={dateISO}
                        style={{
                          border: `1px solid ${COLORS.border}`,
                          borderRadius: 22,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            background: COLORS.primarySoft,
                            padding: 16,
                            borderBottom: `1px solid ${COLORS.border}`,
                          }}
                        >
                          <div style={{ fontWeight: 900, fontSize: 18, color: COLORS.charcoal }}>
                            {items[0].gregorian}
                          </div>
                          <div style={{ marginTop: 4, color: COLORS.charcoalSoft }}>{items[0].hijri}</div>
                        </div>

                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                              <tr style={{ background: "#fff" }}>
                                {[
                                  "الفترة",
                                  "الوقت",
                                  "اسم المقرر",
                                  "الرمز",
                                  "قاعة الاختبار",
                                  "القسم / الشعبة",
                                  "المدرب",
                                  "عدد المتدربين",
                                  "المراقبون",
                                ].map((head) => (
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
                                  <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9", fontWeight: 800 }}>
                                    {item.period}
                                  </td>
                                  <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{item.timeText}</td>
                                  <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{item.courseName}</td>
                                  <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{item.courseCode}</td>
                                  <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{item.examHall || "-"}</td>
                                  <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{item.sectionName}</td>
                                  <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{item.trainerText}</td>
                                  <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>{item.studentCount}</td>
                                  <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>
                                    {item.invigilators.join("، ") || "-"}
                                  </td>
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
                    <div style={{ fontWeight: 900, marginBottom: 8 }}>
                      مقررات لم يتم جدولة اختبارها
                    </div>
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

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
                  <button
                    onClick={() => setCurrentStep(3)}
                    style={{
                      background: "#fff",
                      color: COLORS.charcoal,
                      border: `1px solid ${COLORS.borderStrong}`,
                      borderRadius: 18,
                      padding: "12px 20px",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    السابق
                  </button>

                  <button
                    onClick={exportMainSchedule}
                    style={{
                      background: "#fff",
                      color: COLORS.primaryDark,
                      border: `1px solid ${COLORS.primaryBorder}`,
                      borderRadius: 18,
                      padding: "12px 20px",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    تصدير جدول الاختبارات
                  </button>

                  <button
                    onClick={() =>
                      printSchedulePdf({
                        collegeName: parsed.collegeName,
                        schedule,
                        invigilatorTable,
                        periodLabels: parsedPeriods
                          .filter((p) => p.valid)
                          .map((p, index) => ({
                            period: index + 1,
                            label:
                              index === 0
                                ? "الفتـرة الأولـــى"
                                : index === 1
                                ? "الفتـرة الثـــانية"
                                : `الفترة ${index + 1}`,
                            timeText: p.timeText,
                          })),
                        defaultExamHall: examHalls[0]?.name || "قاعة النشاط",
                      })
                    }
                    style={{
                      background: COLORS.primaryDark,
                      color: "#fff",
                      border: "none",
                      borderRadius: 18,
                      padding: "12px 20px",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    طباعة / PDF
                  </button>
                </div>
              </Card>
            </div>

            <div style={{ marginTop: 20 }}>
              <Card>
                <SectionHeader
                  title="جدول المراقبين وفترات المراقبة"
                  description="يعرض كل مراقب والفترات المسندة له بشكل منفصل."
                />

                {!invigilatorTable.length ? (
                  <div
                    style={{
                      border: `2px dashed ${COLORS.borderStrong}`,
                      borderRadius: 22,
                      padding: 26,
                      textAlign: "center",
                      color: COLORS.muted,
                      background: "#F8FEFE",
                    }}
                  >
                    أنشئ الجدول أولًا ليظهر توزيع المراقبين هنا.
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 16 }}>
                    {invigilatorTable.map((inv) => (
                      <div
                        key={inv.name}
                        style={{
                          border: `1px solid ${COLORS.border}`,
                          borderRadius: 22,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            background: COLORS.primarySoft,
                            padding: 16,
                            borderBottom: `1px solid ${COLORS.border}`,
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 12,
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <div style={{ fontWeight: 900, fontSize: 18, color: COLORS.charcoal }}>
                            {inv.name}
                          </div>
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
                                  <td style={{ padding: 12, borderBottom: "1px solid #F1F5F9", fontWeight: 800 }}>
                                    {item.period}
                                  </td>
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

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
                  <button
                    onClick={exportInvigilatorsTable}
                    style={{
                      background: "#fff",
                      color: COLORS.primaryDark,
                      border: `1px solid ${COLORS.primaryBorder}`,
                      borderRadius: 18,
                      padding: "12px 20px",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    تصدير جدول المراقبين
                  </button>
                </div>
              </Card>
             
            </div>
          </>
        )}
      </div>

  
  );
}
