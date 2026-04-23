import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

const COLORS = {
  primary: "#1FA7A8",
  primaryDark: "#147B83",
  primaryDeep: "#0F5F68",
  primaryLight: "#E7F8F7",
  primaryBorder: "#A8DDDA",
  text: "#1F2529",
  muted: "#6B7280",
  bg: "#F4FAFA",
  card: "#FFFFFF",
  border: "#D7E7E6",
  danger: "#B42318",
  shadow: "0 18px 45px rgba(15, 95, 104, 0.12)",
};

const LOGO_SRC = "/tvtc-logo.png";

function normalizeArabic(value) {
  return String(value ?? "")
    .trim()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/أ|إ|آ/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getInstructions() {
  return [
    "يجب على المتدرب الحضور إلى قاعة الاختبار قبل موعد الاختبار بـ 15 دقيقة.",
    "لا يسمح للمتدرب بدخول الاختبار بعد مضي نصف ساعة من بدايته، ولا يسمح له بالخروج قبل مضي نصف ساعة.",
    "قيام المتدرب بالغش أو محاولة الغش يعتبر مخالفة لتعليمات وقواعد إجراء الاختبارات، وترصد له درجة (صفر) في اختبار ذلك المقرر.",
    "وجود الجوال أو أي أوراق تخص المقرر في حوزة المتدرب تعتبر شروعًا في الغش وتطبق عليه قواعد إجراءات الاختبارات.",
    "يجب على المتدرب التقيد بالزي التدريبي والتزام الهدوء داخل قاعة الاختبار.",
    "يتطلب حصول المتدرب على 25% من درجة الاختبار النهائي حتى يجتاز المقرر التدريبي بالكليات التقنية.",
    "لا يسمح للمتدرب المحروم بدخول الاختبارات النهائية.",
  ];
}

function isDeprivationRegistrationStatus(status) {
  const normalized = normalizeArabic(String(status || "").trim());

  const allowedCases = [
    "اعاده القيد",
    "اعاده القيد بسبب الحرمان",
    "مقرر معاد قيده لتعديل الحرمان",
    "معاد قيده",
    "معاد قيده بسبب الحرمان",
    "معاد قيده لتعديل الحرمان",
    "تعديل الحرمان",
  ].map(normalizeArabic);

  const blockedCases = [
    "حرمان",
    "محروم",
    "حرم",
  ].map(normalizeArabic);

  if (allowedCases.some((s) => normalized.includes(s))) {
    return false;
  }

  if (blockedCases.some((s) => normalized.includes(s))) {
    return true;
  }

  return false;
}

function getDeprivationStatus(item) {
  const candidateFields = [
    item?.deprivationStatus,
    item?.registrationStatus,
    item?.traineeRegistrationStatus,
    item?.statusText,
  ];

  for (const value of candidateFields) {
    const raw = String(value || "").trim();
    if (!raw) continue;

    if (isDeprivationRegistrationStatus(raw)) {
      return raw;
    }
  }

  return "";
}

function isDeprivedScheduleItem(item) {
  return Boolean(getDeprivationStatus(item));
}


function fieldStyle() {
  return {
    width: "100%",
    boxSizing: "border-box",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 20,
    padding: "16px 18px",
    fontSize: 16,
    outline: "none",
    background: "#fff",
    color: COLORS.text,
    transition: "border-color 180ms ease, box-shadow 180ms ease",
    boxShadow: "0 1px 2px rgba(15, 95, 104, 0.04)",
  };
}

function openPrintWindow({ collegeName, selectedStudent }) {
  const instructions = getInstructions();
  const today = new Date().toLocaleDateString("ar-SA");
const rowsHtml = (selectedStudent?.schedule || [])
  .map((item, index) => {
    const deprivationStatus = getDeprivationStatus(item);
    const isDeprived = Boolean(deprivationStatus);

    const cellStyle = isDeprived
      ? 'background:#FEE4E2;color:#B42318;font-weight:700;'
      : '';

    return `
      <tr>
        <td style="${cellStyle}">${index + 1}</td>
        <td style="${cellStyle}">${escapeHtml(item.gregorian || "-")}</td>
        <td style="${cellStyle}">${escapeHtml(item.hijriNumeric || "-")}</td>
        
        <td style="${cellStyle}; text-align:right;">
          <div>${escapeHtml(item.courseName || "-")}</div>

          ${
            isDeprived
              ? `
                <div style="
                  margin-top:6px;
                  display:inline-flex;
                  align-items:center;
                  gap:6px;
                  font-size:11px;
                  font-weight:900;
                  color:#B42318;
                ">
                  <span>🚫</span>
                  <span>(محروم)</span>
                </div>
              `
              : ""
          }
        </td>

        <td style="${cellStyle}">${escapeHtml(item.courseCode || "-")}</td>
        <td style="${cellStyle}">${escapeHtml(item.period || "-")}</td>
        <td style="${cellStyle}">${escapeHtml(item.timeText || "-")}</td>
        <td style="${cellStyle}">${escapeHtml(item.examHall || "-")}</td>
      </tr>
    `;
  })
  .join("");
  const html = `
  <!doctype html>
  <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8" />
      <title>جدول المتدرب</title>
      <style>
        * { box-sizing: border-box; }
        @page {
          size: A4 landscape;
          margin: 7mm;
        }
        body {
          margin: 0;
          font-family: Tahoma, Arial, sans-serif;
          color: #17313a;
          background: #ffffff;
          padding: 0;
          font-size: 11px;
          line-height: 1.35;
          margin-top: 0;
        }
        .header {
          border-radius: 14px;
          overflow: hidden;
          border: 1px solid #d5e9e7;
          margin-bottom: 8px;
          margin-top: 0;
        }
        .topbar {
          background: #0f2e35;
          color: #dff6f4;
          padding: 5px 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 10px;
        }
        .hero {
          background: linear-gradient(135deg, #0f5f68 0%, #1fa7a8 50%, #63cfc4 100%);
          color: white;
           padding: 6px 10px 4px;
          position: relative;
          min-height: 85px; 
        }
        .hero small { opacity: 0.92; font-size: 10px; }
        .hero h1 { margin: 4px 0 3px; font-size: 18px; line-height: 1.2; }
        .hero p { margin: 0; font-size: 10px; opacity: 0.95; line-height: 1.45; }
        .header-center {
            position: relative;
            min-height: 70px;
        }
        .logo {
          width: 70px;
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
        }
        .header-text {
          text-align: right;
          padding-right: 0;
          padding-left: 0;
          width: 100%;
        }
        .header-title {
          margin-top: 8px;
          font-size: 18px;
          font-weight: 700;
          line-height: 1.3;
        }
        .meta {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
          margin: 8px 0;
        }
        .box {
          border: 1px solid #d5e9e7;
          border-radius: 10px;
          padding: 7px 9px;
          background: #f9fefe;
        }
        .box .label {
          color: #5f7077;
          font-size: 10px;
          margin-bottom: 3px;
        }
        .box .value {
          font-size: 11px;
          font-weight: 700;
          line-height: 1.35;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 4px;
          font-size: 10px;
          table-layout: fixed;
        }
        th {
          background: #effafa;
          color: #154a51;
          font-weight: 700;
        }
        th, td {
          border: 1px solid #d8ecea;
          padding: 4px 3px;
          text-align: center;
          word-break: break-word;
        }
        .section-title {
          font-size: 13px;
          font-weight: 800;
          margin: 8px 0 5px;
          color: #114952;
        }
        .instructions {
          margin: 0;
          padding: 0;
          list-style: none;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 4px 6px;
        }
        .instructions li {
          border: 1px solid #d5e9e7;
          border-radius: 8px;
          padding: 5px 7px;
          background: #fbfefe;
          line-height: 1.45;
          font-size: 9.5px;
        }
        @media print {
          html, body {
            width: 100%;
            height: auto;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .header, .meta, table, .instructions, .instructions li {
            break-inside: avoid;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="topbar">
          <div>${today}</div>
          <div>الجداول النهائية - بوابة المتدرب</div>
        </div>
        <div class="hero">
          <div class="header-center">
            <img class="logo" src="${window.location.origin + LOGO_SRC}" alt="TVTC Logo" />
            <div class="header-text">
              <div>المملكة العربية السعودية</div>
              <div>المؤسسة العامة للتدريب التقني والمهني</div>
              <div>${escapeHtml(collegeName || "جداول المتدربين النهائية")}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="meta">
        <div class="box"><div class="label">اسم المتدرب</div><div class="value">${escapeHtml(selectedStudent?.name || "-")}</div></div>
        <div class="box"><div class="label">رقم المتدرب</div><div class="value">${escapeHtml(selectedStudent?.id || "-")}</div></div>
        <div class="box"><div class="label">القسم</div><div class="value">${escapeHtml(selectedStudent?.department || "-")}</div></div>
        <div class="box"><div class="label">التخصص</div><div class="value">${escapeHtml(selectedStudent?.major || "-")}</div></div>
      </div>

      <div class="section-title">جدول الاختبارات</div>
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
          ${rowsHtml || '<tr><td colspan="9">لا توجد بيانات متاحة</td></tr>'}
        </tbody>
      </table>

      <div class="section-title">تعليمات مهمة</div>
      <ul class="instructions">
        ${instructions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </body>
  </html>`;

  const w = window.open("", "_blank", "width=1200,height=800");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

export default function TraineePortalPage() {
  const { slug } = useParams();
  const normalizedSlug = String(slug || "").toUpperCase();

  const [collegeData, setCollegeData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        setLoading(true);
        setError("");
        setSelectedStudent(null);

        const res = await fetch(`/colleges/${normalizedSlug}.json`);
        if (!res.ok) {
          throw new Error("تعذر تحميل بيانات الوحدة التدريبية");
        }

        const data = await res.json();
        if (!cancelled) {
          setCollegeData(data);
        }
      } catch (err) {
        if (!cancelled) {
          setCollegeData(null);
               setError(
        "لا توجد بيانات منشورة لهذه الوحدة التدريبية أو أن الرابط غير صحيح.\n\nلتفعيل البوابة، نأمل التواصل مع:\n\nm.alfayez@tvtc.gov.sa"
      );        }
              } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, [normalizedSlug]);

  useEffect(() => {
    if (collegeData?.collegeName) {
      document.title = `${collegeData.collegeName} - بوابة المتدرب`;
    } else {
      document.title = "الجداول النهائية - بوابة المتدرب";
    }
  }, [collegeData]);

  const suggestions = useMemo(() => {
    if (!collegeData?.students?.length) return [];
    const q = normalizeArabic(searchText);
    if (!q) return [];

    return collegeData.students
      .filter((student) => {
        const name = normalizeArabic(student.name);
        const id = normalizeArabic(student.id);
        return name.includes(q) || id.includes(q);
      })
      .slice(0, 12);
  }, [collegeData, searchText]);

  const quickStats = useMemo(() => {
    return {
      students: collegeData?.students?.length || 0,
      exams: selectedStudent?.schedule?.length || 0,
      college: collegeData?.collegeName || "جداول المتدربين النهائية",
      today: new Date().toLocaleDateString("ar-SA"),
    };
  }, [collegeData, selectedStudent]);

  return (
    <div
      dir="rtl"
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top right, rgba(31,167,168,0.10), transparent 22%), linear-gradient(180deg, #F8FCFC 0%, #F3F9F9 100%)",
        padding: "24px 16px 42px",
        fontFamily: "Cairo, Tahoma, Arial, sans-serif",
        color: COLORS.text,
      }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 30,
            boxShadow: COLORS.shadow,
            border: `1px solid rgba(168,221,218,0.9)`,
            marginBottom: 24,
            background: COLORS.card,
          }}
        >
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
            <span>📅 {quickStats.today}</span>
            <span>المؤسسة العامة للتدريب التقني والمهني</span>
            <span>البوابة الإلكترونية للمتدربين</span>
          </div>

          <div
            style={{
              position: "relative",
              padding: "28px 24px",
              background:
                "linear-gradient(135deg, #0F5F68 0%, #148C93 40%, #1FA7A8 72%, #74D3CB 100%)",
              display: "flex",
              alignItems: "center",
              gap: 22,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(circle at top left, rgba(255,255,255,0.18), transparent 20%), radial-gradient(circle at bottom right, rgba(255,255,255,0.10), transparent 26%)",
                pointerEvents: "none",
              }}
            />

            <div
              style={{
                width: 118,
                height: 118,
                borderRadius: 28,
                background: "rgba(255,255,255,0.14)",
                border: "1px solid rgba(255,255,255,0.22)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backdropFilter: "blur(8px)",
                flexShrink: 0,
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)",
              }}
            >
              <img
                src={LOGO_SRC}
                alt="TVTC Logo"
                style={{ width: 84, height: 84, objectFit: "contain" }}
              />
            </div>

            <div style={{  minWidth: 260, position: "relative", zIndex: 1, justifyContent: "center", }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 14px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.13)",
                  color: "rgba(255,255,255,0.96)",
                  fontSize: 13,
                  fontWeight: 700,
                  marginBottom: 12,
                  border: "1px solid rgba(255,255,255,0.16)",
                  textAlign: "center",
                  // width: "100%",
                }}
              >
                <span>الجداول النهائية</span>
                <span style={{ opacity: 0.72 }}>•</span>
                <span>بوابة المتدرب</span>
              </div>

              <h1
                style={{
                  margin: 0,
                  color: "#FFFFFF",
                  fontSize: "clamp(28px, 4vw, 40px)",
                  fontWeight: 900,
                  lineHeight: 1.2,
                }}
              >
                {quickStats.college}
              </h1>

              <p
                style={{
                  margin: "10px 0 0",
                  color: "rgba(255,255,255,0.92)",
                  fontSize: 15,
                  lineHeight: 1.9,
                  maxWidth: 760,
                  display: "flex",
    justifyContent: "center", // توسيط أفقي
    alignItems: "center",     // توسيط عمودي
    textAlign: "center",      // توسيط النص نفسه
    flexDirection: "column", 
    width: "100%",
                }}
                           >
                منصة لعرض جدول الاختبارات النهائي للمتدرب بطريقة واضحة ومنظمة، مع
                البحث السريع والطباعة بتنسيق احترافي.
              </p>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 14,
            marginBottom: 22,
          }}
        >
          <StatCard label="عدد المتدربين المنشور" value={quickStats.students} icon="👥" />
          <StatCard label="اختبارات المتدرب المحدد" value={quickStats.exams} icon="🗓️" />
          <StatCard label="رمز البوابة" value={normalizedSlug || "-"} icon="🔗" />
          <StatCard label="حالة البيانات" value={loading ? "جاري التحميل" : error ? "غير متاحة" : "منشورة"} icon="📌" />
        </div>

        {loading ? (
          <MessageCard tone="info">جاري تحميل البيانات...</MessageCard>
        ) : error ? (
          <MessageCard tone="danger">{error}</MessageCard>
        ) : (
          <>
            <div
              style={{
                background: COLORS.card,
                borderRadius: 28,
                border: `1px solid ${COLORS.border}`,
                boxShadow: COLORS.shadow,
                padding: 20,
                marginBottom: 22,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  marginBottom: 16,
                }}
              >
                <div>
                  <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 6 }}>
                    البحث عن المتدرب
                  </div>
                  <div style={{ color: COLORS.muted, lineHeight: 1.8, fontSize: 14 }}>
                    اكتب الاسم أو الرقم التدريبي، وستظهر لك النتائج مباشرة لاختيار المتدرب
                    وعرض جدوله النهائي.
                  </div>
                </div>
               
              </div>

              <div style={{ position: "relative" }}>
                <input
                  value={searchText}
                  onChange={(e) => {
                    setSearchText(e.target.value);
                    setSelectedStudent(null);
                  }}
                  placeholder="اكتب الاسم أو الرقم التدريبي"
                  style={{ ...fieldStyle(), maxWidth: 300 }}
                />

                {!!suggestions.length && !selectedStudent && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 10px)",
                      right: 0,
                      left: 0,
                      background: "#fff",
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 20,
                      overflow: "hidden",
                      boxShadow: "0 16px 30px rgba(15, 95, 104, 0.12)",
                      zIndex: 20,
                    }}
                  >
                    {suggestions.map((student, index) => (
                      <button
                        key={`${student.id || student.name || index}-${index}`}
                        type="button"
                        onClick={() => {
                          setSelectedStudent(student);
                          setSearchText(student.name || student.id || "");
                        }}
                        style={{
                          width: "100%",
                          border: "none",
                          borderBottom:
                            index === suggestions.length - 1 ? "none" : `1px solid ${COLORS.border}`,
                          background: "#fff",
                          textAlign: "right",
                          padding: "14px 16px",
                          cursor: "pointer",
                          display: "block",
                        }}
                      >
                        <div style={{ fontWeight: 900, marginBottom: 4, color: COLORS.text }}>
                          {student.name || "بدون اسم"}
                        </div>
                        <div style={{ color: COLORS.muted, fontSize: 13 }}>
                          {student.id || "-"} — {student.department || "-"} / {student.major || "-"}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {selectedStudent && (
              <>
                <div
                  style={{
                    background: COLORS.card,
                    borderRadius: 28,
                    border: `1px solid ${COLORS.border}`,
                    boxShadow: COLORS.shadow,
                    padding: 20,
                    marginBottom: 22,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 14,
                      flexWrap: "wrap",
                      marginBottom: 18,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 6 }}>
                        بيانات المتدرب
                      </div>
                      <div style={{ color: COLORS.muted, fontSize: 14 }}>
                        تم العثور على المتدرب بنجاح، ويمكنك الآن مراجعة الجدول أو طباعته.
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        openPrintWindow({
                          collegeName: collegeData?.collegeName,
                          selectedStudent,
                        })
                      }
                      style={{
                        border: "none",
                        borderRadius: 18,
                        background:
                          "linear-gradient(135deg, #0F5F68 0%, #178A91 55%, #1FA7A8 100%)",
                        color: "#fff",
                        padding: "14px 20px",
                        fontWeight: 900,
                        cursor: "pointer",
                        boxShadow: "0 12px 24px rgba(15, 95, 104, 0.22)",
                      }}
                    >
                      طباعة الجدول
                    </button>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: 14,
                    }}
                  >
                    <InfoBox label="اسم المتدرب" value={selectedStudent.name} />
                    <InfoBox label="رقم المتدرب" value={selectedStudent.id} />
                    <InfoBox label="القسم" value={selectedStudent.department} />
                    <InfoBox label="التخصص" value={selectedStudent.major} />
                  </div>
                </div>

                <div
                  style={{
                    background: COLORS.card,
                    borderRadius: 28,
                    border: `1px solid ${COLORS.border}`,
                    boxShadow: COLORS.shadow,
                    padding: 20,
                    marginBottom: 22,
                  }}
                >
                  <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 14 }}>
                    جدول الاختبارات
                  </div>

                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "separate",
                        borderSpacing: 0,
                        minWidth: 960,
                        overflow: "hidden",
                        borderRadius: 20,
                        border: `1px solid ${COLORS.border}`,
                      }}
                    >
                      <thead>
                        <tr style={{ background: "#F2FCFB" }}>
                          {[
                            "م",
                            "اليوم والتاريخ",
                            "التاريخ الهجري",
                            "المقرر",
                            "الرمز",
                            "الفترة",
                            "الوقت",
                            "المقر",
                          ].map((head) => (
                            <th
                              key={head}
                              style={{
                                padding: 14,
                                textAlign: "center",
                                borderBottom: `1px solid ${COLORS.border}`,
                                color: COLORS.primaryDeep,
                                fontWeight: 900,
                                fontSize: 14,
                              }}
                            >
                              {head}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedStudent.schedule || []).map((item, index) => {
                          const deprivationStatus = getDeprivationStatus(item);
                          const isDeprived = Boolean(deprivationStatus);

                          return (
                            <tr key={`${item.courseCode || item.courseName || index}-${index}`}>
                              <Cell isDeprived={isDeprived}>{index + 1}</Cell>
                              <Cell isDeprived={isDeprived}>{item.gregorian}</Cell>
                              <Cell isDeprived={isDeprived}>{item.hijriNumeric}</Cell>
                              <Cell isDeprived={isDeprived}>
                                <div style={{ fontWeight: 800 }}>{item.courseName || "-"}</div>
                                {deprivationStatus ? (
                                  <div
                                    style={{
                                      marginTop: 6,
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 6,
                                      padding: "4px 10px",
                                      borderRadius: 999,
                                      background: "#FEE4E2",
                                      color: COLORS.danger,
                                      fontSize: 12,
                                      fontWeight: 900,
                                    }}
                                  >
                                    🚫 محروم
                                  </div>
                                ) : null}
                              </Cell>
                              <Cell isDeprived={isDeprived}>{item.courseCode}</Cell>
                              <Cell isDeprived={isDeprived}>{item.period}</Cell>
                              <Cell isDeprived={isDeprived}>{item.timeText}</Cell>
                              <Cell isDeprived={isDeprived}>{item.examHall}</Cell>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div
                  style={{
                    background: COLORS.card,
                    borderRadius: 28,
                    border: `1px solid ${COLORS.border}`,
                    boxShadow: COLORS.shadow,
                    padding: 20,
                  }}
                >
                  <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 16 }}>
                    تعليمات مهمة
                  </div>

                  <div style={{ display: "grid", gap: 12 }}>
                    {getInstructions().map((item, index) => {
                      const rowThemes = [
                        { bg: "#F0FDFA", border: "#99F6E4", iconBg: "#CCFBF1" },
                        { bg: "#ECFEFF", border: "#A5F3FC", iconBg: "#CFFAFE" },
                        { bg: "#F5F3FF", border: "#DDD6FE", iconBg: "#EDE9FE" },
                        { bg: "#FFF7ED", border: "#FED7AA", iconBg: "#FFEDD5" },
                        { bg: "#FEFCE8", border: "#FDE68A", iconBg: "#FEF3C7" },
                        { bg: "#F0FDF4", border: "#BBF7D0", iconBg: "#DCFCE7" },
                        { bg: "#FEF2F2", border: "#FECACA", iconBg: "#FEE2E2" },
                      ];
                      const icons = ["⏰", "📍", "⚠️", "📵", "👔", "✅", "⛔"];
                      const theme = rowThemes[index % rowThemes.length];

                      return (
                        <div
                          key={index}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 12,
                            padding: "14px 16px",
                            background: theme.bg,
                            border: `1px solid ${theme.border}`,
                            borderRadius: 18,
                            lineHeight: 1.9,
                          }}
                        >
                          <div
                            style={{
                              minWidth: 38,
                              width: 38,
                              height: 38,
                              borderRadius: 12,
                              background: theme.iconBg,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 18,
                              flexShrink: 0,
                            }}
                          >
                            {icons[index % icons.length]}
                          </div>
                          <div style={{ fontWeight: 700 }}>{item}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.92)",
        borderRadius: 22,
        border: `1px solid ${COLORS.border}`,
        boxShadow: "0 10px 25px rgba(15, 95, 104, 0.08)",
        padding: "16px 18px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            background: COLORS.primaryLight,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
          }}
        >
          {icon}
        </div>
        <div style={{ color: COLORS.muted, fontSize: 13, fontWeight: 700 }}>{label}</div>
      </div>
      <div style={{ fontSize: 24, fontWeight: 900, color: COLORS.primaryDeep }}>{value}</div>
    </div>
  );
}

function MessageCard({ children, tone = "info" }) {
  const toneMap = {
    info: {
      bg: "#F7FEFE",
      border: COLORS.primaryBorder,
      color: COLORS.primaryDeep,
    },
    danger: {
      bg: "#FEF3F2",
      border: "#F5C2C0",
      color: COLORS.danger,
    },
  };
  const t = toneMap[tone] || toneMap.info;

  return (
    <div
      style={{
        background: t.bg,
        border: `1px solid ${t.border}`,
        color: t.color,
        borderRadius: 22,
        padding: "18px 20px",
        fontWeight: 800,
        boxShadow: "0 10px 24px rgba(15, 95, 104, 0.06)",
      }}
    >
      {children}
    </div>
  );
}

function InfoBox({ label, value }) {
  return (
    <div
      style={{
        background: "linear-gradient(180deg, #FFFFFF 0%, #F9FEFE 100%)",
        border: `1px solid ${COLORS.border}`,
        borderRadius: 20,
        padding: "14px 16px",
      }}
    >
      <div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 8, fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontWeight: 900, fontSize: 16, color: COLORS.text }}>{value || "-"}</div>
    </div>
  );
}

function Cell({ children, isDeprived = false }) {
  return (
    <td
      style={{
        padding: 13,
        borderBottom: `1px solid ${COLORS.border}`,
        textAlign: "center",
        background: isDeprived ? "#FEE4E2" : "#fff",
        color: isDeprived ? COLORS.danger : COLORS.text,
        fontWeight: isDeprived ? 800 : 500,
        fontSize: 14,
      }}
    >
      {children || "-"}
    </td>
  );
}
