console.log({
  hall: hall.name,
  allowSharedAssignments: hall.allowSharedAssignments,
  slot: getSlotPeriodKey(slotOrItem),
  capacity: hallCapacity,
  used: used,
  remaining: hall.allowSharedAssignments
    
    ? Math.max(0, hallCapacity - used)
    : (used > 0 ? 0 : hallCapacity),
});
  if (hall.allowSharedAssignments) {
    return Math.max(0, hallCapacity - used);
  }

  return used > 0 ? 0 : hallCapacity;
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

function getHallUsageKey(slotOrItem, hallName) {
  return `${getSlotPeriodKey(slotOrItem)}__${normalizeArabic(hallName)}`;
}

function getRemainingHallCapacityForSlot(hall, slotOrItem, hallUsageMap) {
  const hallCapacity = Number(hall?.capacity);
  if (!Number.isFinite(hallCapacity) || hallCapacity <= 0) return 0;

  const used = hallUsageMap.get(getHallUsageKey(slotOrItem, hall.name)) || 0;
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

  const alreadyUsed = (hallUsageMap.get(getHallUsageKey(slotOrItem, hall.name)) || 0) > 0;
  if (alreadyUsed) return false;

  return Number(hall.capacity) >= students;
}

function reserveHallForCourseInSlot(hall, course, slotOrItem, hallUsageMap) {
  const students = Number(course?.studentCount) || 0;
  const key = getHallUsageKey(slotOrItem, hall.name);
  hallUsageMap.set(key, (hallUsageMap.get(key) || 0) + students);
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

    const hallUsageMap = new Map();
    const targetPeriodKey = getSlotPeriodKey(targetSlot);

    schedule
      .filter((item) => getSlotPeriodKey(item) === targetPeriodKey && item.examHall)
      .forEach((item) => {
        const key = getHallUsageKey(targetSlot, item.examHall);
        hallUsageMap.set(
          key,
          (hallUsageMap.get(key) || 0) + (Number(item.studentCount) || 0)
        );
      });

    const hallsAfterCanAssign = normalizedExamHalls.filter((hall) =>
      canAssignHallToCourseInSlot(hall, course, targetSlot, hallUsageMap)
    );

    const hallsAfterConstraint = filterHallsByCourseHallConstraint(
      hallsAfterCanAssign,
      course
    );

    const fittingHalls = sortHallsByCourseHallPreference(
      hallsAfterConstraint,
      course
    );

    console.log("HALL_FILTER_DEBUG", {
      course: course.courseName || course.courseCode,
      slot: getSlotPeriodKey(targetSlot),
      allHalls: (normalizedExamHalls || []).map((hall) => ({
        name: hall.name,
        allowSharedAssignments: hall.allowSharedAssignments,
      })),
      hallsAfterCanAssign: hallsAfterCanAssign.map((hall) => hall.name),
      hallsAfterConstraint: hallsAfterConstraint.map((hall) => hall.name),
      fittingHalls: fittingHalls.map((hall) => hall.name),
      courseHallConstraint: getCourseHallConstraint(course),
    });

    let assignedHall = "";

    if (fittingHalls.length) {
      assignedHall = fittingHalls[0].name;
      reserveHallForCourseInSlot(fittingHalls[0], course, targetSlot, hallUsageMap);
    } else {
      const maxRemaining = getMaxRemainingAllowedHallCapacityForSlot(
        normalizedExamHalls,
        course,
        targetSlot,
        hallUsageMap
      );

      showToast(
        "لا توجد قاعة مناسبة",
        `لا توجد قاعة مناسبة لهذا المقرر ضمن القاعات المتاحة في هذه الفترة. يحتاج ${Number(course.studentCount) || 0} مقعدًا، وأكبر سعة متبقية فعلية هي ${Number(maxRemaining) || 0}.`,
        "error"
      );
      return;
    }

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
      invigilators: [],
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

      return prev.map((item) =>
        item.instanceId === itemId
          ? {
              ...item,
              ...targetSlot,
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
    showToast(
