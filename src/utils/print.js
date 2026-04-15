import { LOGO_SRC } from "./constants";
import { getDayTheme, groupScheduleForOfficialPrint, splitBySlash, normalizeArabic } from "./printHelpers";

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

export function getPrintBaseStyles() {
  return `
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; }
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
    .page { width: 100%; }
    .header {
      text-align: center;
      margin-bottom: 12px;
      border-bottom: 2px solid #0f766e;
      padding-bottom: 10px;
    }
    .logo { width: 72px; height: auto; object-fit: contain; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td {
      border: 1px solid #0f172a;
      padding: 6px 5px;
      font-size: 11px;
      text-align: center;
      vertical-align: middle;
      word-break: break-word;
    }
    th { background: #ecfeff; font-weight: 800; }
  `;
}

export function printScheduleOnlyPdf({
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
          .filter((dep) => dep && normalizeArabic(dep) !== normalizeArabic("الدراسات العامة"))
      )
    )
  ).sort((a, b) => a.localeCompare(b, "ar"));

  let departmentLabel = selectedDepartment === "__all__"
    ? extractedDepartments.join(" / ") || "جميع الأقسام"
    : selectedDepartment;

  let majorLabel = selectedMajor === "__all__" ? "جميع التخصصات" : selectedMajor;

  const maxRowsPerDay = (day) =>
    Math.max(...periodIds.map((p) => (day.periods[p] ? day.periods[p].length : 0)), 1);

  const renderPeriodColumns = (day, periodId, rowIndex) => {
    const list = day.periods[periodId] || [];
    const item = list[rowIndex];
    const dayTheme = getDayTheme(day.dayName);

    if (!item) {
      return `
        <td style="background:${dayTheme.bg}; color:${dayTheme.text};">${rowIndex + 1}</td>
        <td style="background:${dayTheme.bg}; color:${dayTheme.text};"></td>
        <td style="background:${dayTheme.bg}; color:${dayTheme.text};"></td>
        <td style="background:${dayTheme.bg}; color:${dayTheme.text};"></td>
      `;
    }

    return `
      <td style="background:${dayTheme.bg}; color:${dayTheme.text};">${rowIndex + 1}</td>
      <td style="background:${dayTheme.bg}; color:${dayTheme.text};">${item.courseName || ""}</td>
      <td style="background:${dayTheme.bg}; color:${dayTheme.text};">${item.courseCode || ""}</td>
      <td style="background:${dayTheme.bg}; color:${dayTheme.text};">${item.examHall || defaultExamHall}</td>
    `;
  };

  const html = `
    <html dir="rtl" lang="ar">
      <head>
        <title>طباعة جدول الاختبارات</title>
        <style>${getPrintBaseStyles()}</style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <div><img class="logo" src="${window.location.origin + LOGO_SRC}" alt="TVTC Logo" /></div>
            <h2>${collegeName || "الكلية التقنية"}</h2>
            <h3>جدول الاختبارات النهائية</h3>
            <div>القسم: ${departmentLabel}</div>
            <div>التخصص: ${majorLabel}</div>
            <div>تاريخ الطباعة: ${todayText}</div>
          </div>

          <table>
            <thead>
              <tr>
                <th>اليوم / التاريخ</th>
                ${periodIds.map(() => "<th>م</th><th>المقرر</th><th>الرمز</th><th>المقر</th>").join("")}
              </tr>
            </thead>
            <tbody>
              ${groupedDays.map((day) => {
                const rowsCount = maxRowsPerDay(day);
                return Array.from({ length: rowsCount }).map((_, rowIndex) => `
                  <tr>
                    ${rowIndex === 0 ? `<td rowspan="${rowsCount}">${day.dayName}<br/>${day.hijriNumeric}</td>` : ""}
                    ${periodIds.map((periodId) => renderPeriodColumns(day, periodId, rowIndex)).join("")}
                  </tr>
                `).join("");
              }).join("")}
            </tbody>
          </table>
        </div>
      </body>
    </html>
  `;

  openPrintWindow("طباعة جدول الاختبارات", html);
}
