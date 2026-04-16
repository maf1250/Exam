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
  bg: "#F7FBFB",
  card: "#FFFFFF",
  border: "#D7E7E6",
  danger: "#B42318",
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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
          throw new Error("تعذر تحميل بيانات الكلية");
        }

        const data = await res.json();
        if (!cancelled) {
          setCollegeData(data);
        }
      } catch (err) {
        if (!cancelled) {
          setCollegeData(null);
          setError("لا توجد بيانات منشورة لهذه الكلية أو أن الرابط غير صحيح.");
        }
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

  const handlePrint = () => {
    if (!selectedStudent) return;

    const instructions = getInstructions();
    const today = new Date().toLocaleDateString("ar-SA");

    const rowsHtml = (selectedStudent.schedule || [])
      .map(
        (item, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(item.courseName || "")}</td>
            <td>${escapeHtml(item.courseCode || "")}</td>
            <td>${escapeHtml(item.dayName || "")}</td>
            <td>${escapeHtml(item.gregorian || "")}</td>
            <td>${escapeHtml(item.hijriNumeric || "")}</td>
            <td>${escapeHtml(item.period || "")}</td>
            <td>${escapeHtml(item.timeText || "")}</td>
            <td>${escapeHtml(item.examHall || "")}</td>
          </tr>
        `,
      )
      .join("");

    const html = `
      <!doctype html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <title>جدول المتدرب</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 28px;
            font-family: Arial, sans-serif;
            color: #1f2529;
            background: #ffffff;
          }
          .header {
            border-radius: 26px;
            overflow: hidden;
            box-shadow: 0 18px 42px rgba(15, 95, 104, 0.18);
            margin-bottom: 24px;
          }
          .top-strip {
            background: #0f172a;
            color: #e2e8f0;
            padding: 10px 18px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 12px;
            font-weight: 700;
          }
          .hero {
            position: relative;
            overflow: hidden;
            background: linear-gradient(135deg, #0f766e 0%, #147b83 42%, #1fa7a8 100%);
            color: #fff;
            padding: 26px;
          }
          .hero::before,
          .hero::after {
            content: "";
            position: absolute;
            border-radius: 999px;
            background: rgba(255,255,255,0.08);
            filter: blur(10px);
          }
          .hero::before {
            width: 220px;
            height: 220px;
            top: -90px;
            left: -90px;
          }
          .hero::after {
            width: 180px;
            height: 180px;
            bottom: -70px;
            right: -60px;
          }
          .hero-grid {
            position: relative;
            z-index: 1;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 20px;
          }
          .logo-wrap {
            width: 96px;
            height: 96px;
            border-radius: 24px;
            background: rgba(255,255,255,0.14);
            border: 1px solid rgba(255,255,255,0.18);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          }
          .logo-wrap img {
            width: 68px;
            height: 68px;
            object-fit: contain;
          }
          .badge {
            display: inline-block;
            padding: 8px 14px;
            border-radius: 999px;
            background: rgba(255,255,255,0.14);
            border: 1px solid rgba(255,255,255,0.18);
            font-size: 12px;
            font-weight: 800;
            margin-bottom: 12px;
          }
          .hero-title {
            font-size: 28px;
            font-weight: 900;
            margin: 0 0 8px;
          }
          .hero-subtitle {
            margin: 0;
            font-size: 14px;
            line-height: 1.9;
            opacity: 0.95;
          }
          .meta-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 12px;
            margin: 18px 0 24px;
          }
          .meta-card {
            background: #f8fbfb;
            border: 1px solid #d7e7e6;
            border-radius: 16px;
            padding: 12px 14px;
          }
          .meta-label {
            color: #6b7280;
            font-size: 12px;
            margin-bottom: 6px;
            font-weight: 700;
          }
          .meta-value {
            color: #1f2529;
            font-size: 15px;
            font-weight: 800;
            word-break: break-word;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            overflow: hidden;
            border-radius: 18px;
            border: 1px solid #d7e7e6;
          }
          thead th {
            background: #eef8f8;
            color: #0f5f68;
            font-size: 13px;
            padding: 12px 10px;
            border-bottom: 1px solid #d7e7e6;
          }
          tbody td {
            padding: 11px 10px;
            border-bottom: 1px solid #eef3f3;
            font-size: 13px;
            text-align: center;
          }
          tbody tr:nth-child(even) {
            background: #fcfefe;
          }
          .instructions {
            margin-top: 22px;
            border: 1px solid #d7e7e6;
            border-radius: 20px;
            padding: 18px;
            background: #fbfefe;
          }
          .instructions-title {
            font-weight: 900;
            color: #0f5f68;
            margin-bottom: 12px;
            font-size: 18px;
          }
          .instructions ol {
            margin: 0;
            padding-right: 22px;
            line-height: 2;
          }
          @media print {
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="top-strip">
            <div>${today}</div>
            <div>بوابة المتدرب</div>
          </div>
          <div class="hero">
            <div class="hero-grid">
              <div>
                <div class="badge">الجداول النهائية - بوابة المتدرب</div>
                <h1 class="hero-title">${escapeHtml(collegeData?.collegeName || "الكلية التقنية")}</h1>
                <p class="hero-subtitle">عرض جدول الاختبارات النهائي الخاص بالمتدرب بشكل رسمي ومنظم.</p>
              </div>
              <div class="logo-wrap">
                <img src="${LOGO_SRC}" alt="TVTC Logo" />
              </div>
            </div>
          </div>
        </div>

        <div class="meta-grid">
          <div class="meta-card">
            <div class="meta-label">اسم المتدرب</div>
            <div class="meta-value">${escapeHtml(selectedStudent.name || "-")}</div>
          </div>
          <div class="meta-card">
            <div class="meta-label">رقم المتدرب</div>
            <div class="meta-value">${escapeHtml(selectedStudent.id || "-")}</div>
          </div>
          <div class="meta-card">
            <div class="meta-label">القسم</div>
            <div class="meta-value">${escapeHtml(selectedStudent.department || "-")}</div>
          </div>
          <div class="meta-card">
            <div class="meta-label">التخصص</div>
            <div class="meta-value">${escapeHtml(selectedStudent.major || "-")}</div>
          </div>
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

        <div class="instructions">
          <div class="instructions-title">تعليمات مهمة</div>
          <ol>
            ${instructions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ol>
        </div>
      </body>
      </html>
    `;

    const w = window.open("", "_blank", "width=1200,height=800");
    if (!w) return;

    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: `linear-gradient(180deg, ${COLORS.bg} 0%, #ffffff 100%)`,
        padding: "32px 16px",
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div
          style={{
            borderRadius: 32,
            overflow: "hidden",
            boxShadow: "0 24px 60px rgba(15,95,104,0.16)",
            marginBottom: 24,
          }}
        >
          <div
            style={{
              background: "#0f172a",
              color: "#E2E8F0",
              padding: "10px 18px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              fontSize: 12,
              fontWeight: 800,
              flexWrap: "wrap",
            }}
          >
            <div>{new Date().toLocaleDateString("ar-SA")}</div>
            <div>البوابة الإلكترونية للمتدربين</div>
          </div>

          <div
            style={{
              position: "relative",
              overflow: "hidden",
              background:
                "linear-gradient(135deg, #0F766E 0%, #147B83 42%, #1FA7A8 78%, #34B8B7 100%)",
              color: "#fff",
              padding: "28px 24px",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -110,
                left: -90,
                width: 260,
                height: 260,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.08)",
                filter: "blur(10px)",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: -85,
                right: -60,
                width: 210,
                height: 210,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.08)",
                filter: "blur(10px)",
              }}
            />

            <div
              style={{
                position: "relative",
                zIndex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 20,
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: "1 1 420px", minWidth: 260 }}>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    background: "rgba(255,255,255,0.14)",
                    border: "1px solid rgba(255,255,255,0.18)",
                    borderRadius: 999,
                    padding: "8px 14px",
                    fontSize: 12,
                    fontWeight: 900,
                    marginBottom: 14,
                  }}
                >
                  <span>الجداول النهائية - بوابة المتدرب</span>
                </div>

                <div
                  style={{
                    fontSize: 30,
                    fontWeight: 900,
                    marginBottom: 8,
                    lineHeight: 1.35,
                  }}
                >
                  {collegeData?.collegeName || "جدول الاختبارات النهائية"}
                </div>

                <div
                  style={{
                    lineHeight: 1.95,
                    opacity: 0.96,
                    fontSize: 15,
                    maxWidth: 680,
                  }}
                >
                  منصة رسمية لعرض جدول الاختبارات النهائي للمتدرب بطريقة واضحة ومنظمة، مع
                  إمكانية البحث السريع والطباعة بتنسيق احترافي.
                </div>
              </div>

              <div
                style={{
                  width: 108,
                  height: 108,
                  borderRadius: 28,
                  background: "rgba(255,255,255,0.14)",
                  border: "1px solid rgba(255,255,255,0.20)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backdropFilter: "blur(6px)",
                  flexShrink: 0,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
                }}
              >
                <img
                  src={LOGO_SRC}
                  alt="TVTC Logo"
                  style={{
                    width: 78,
                    height: 78,
                    objectFit: "contain",
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 28,
            padding: 24,
            boxShadow: "0 14px 34px rgba(20,123,131,0.08)",
          }}
        >
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: COLORS.muted }}>
              جاري تحميل البيانات...
            </div>
          ) : error ? (
            <div style={{ textAlign: "center", padding: 40, color: COLORS.danger }}>{error}</div>
          ) : (
            <>
              <div style={{ marginBottom: 18 }}>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 800,
                    color: COLORS.text,
                    marginBottom: 10,
                  }}
                >
                  البحث عن المتدرب
                </div>

                <input
                  value={searchText}
                  onChange={(e) => {
                    setSearchText(e.target.value);
                    setSelectedStudent(null);
                  }}
                  placeholder="اكتب الاسم أو الرقم التدريبي"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 18,
                    padding: "14px 16px",
                    fontSize: 16,
                    outline: "none",
                    background: "#fff",
                  }}
                />
              </div>

              {!!suggestions.length && !selectedStudent && (
                <div
                  style={{
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 20,
                    overflow: "hidden",
                    marginBottom: 18,
                    background: "#fff",
                  }}
                >
                  {suggestions.map((student, index) => (
                    <button
                      key={`${student.id}-${student.name}-${index}`}
                      type="button"
                      onClick={() => {
                        setSelectedStudent(student);
                        setSearchText(student.name || student.id || "");
                      }}
                      style={{
                        width: "100%",
                        border: "none",
                        borderBottom:
                          index === suggestions.length - 1
                            ? "none"
                            : `1px solid ${COLORS.border}`,
                        background: "#fff",
                        textAlign: "right",
                        padding: "14px 16px",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontWeight: 800, color: COLORS.text }}>
                        {student.name || "بدون اسم"}
                      </div>
                      <div style={{ color: COLORS.muted, marginTop: 4, fontSize: 14 }}>
                        {student.id || "-"} — {student.department || "-"} / {student.major || "-"}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {selectedStudent && (
                <div
                  style={{
                    background: "#fff",
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 24,
                    padding: 20,
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: 12,
                      marginBottom: 18,
                    }}
                  >
                    <InfoBox label="اسم المتدرب" value={selectedStudent.name || "-"} />
                    <InfoBox label="رقم المتدرب" value={selectedStudent.id || "-"} />
                    <InfoBox label="القسم" value={selectedStudent.department || "-"} />
                    <InfoBox label="التخصص" value={selectedStudent.major || "-"} />
                  </div>

                  <div style={{ overflowX: "auto", marginBottom: 18 }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        minWidth: 860,
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: 18,
                        overflow: "hidden",
                      }}
                    >
                      <thead>
                        <tr style={{ background: "#EEF8F8" }}>
                          {[
                            "م",
                            "المقرر",
                            "الرمز",
                            "اليوم",
                            "التاريخ الميلادي",
                            "التاريخ الهجري",
                            "الفترة",
                            "الوقت",
                            "المقر",
                          ].map((head) => (
                            <th
                              key={head}
                              style={{
                                padding: 12,
                                borderBottom: `1px solid ${COLORS.border}`,
                                color: COLORS.primaryDeep,
                                fontSize: 13,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {head}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedStudent.schedule || []).map((item, index) => (
                          <tr key={`${item.courseCode || item.courseName || "row"}-${index}`}>
                            <Cell>{index + 1}</Cell>
                            <Cell>{item.courseName}</Cell>
                            <Cell>{item.courseCode}</Cell>
                            <Cell>{item.dayName}</Cell>
                            <Cell>{item.gregorian}</Cell>
                            <Cell>{item.hijriNumeric}</Cell>
                            <Cell>{item.period}</Cell>
                            <Cell>{item.timeText}</Cell>
                            <Cell>{item.examHall}</Cell>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div
                    style={{
                      background: "#FBFEFE",
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 22,
                      padding: 18,
                      marginBottom: 18,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 900,
                        color: COLORS.primaryDeep,
                        marginBottom: 14,
                      }}
                    >
                      تعليمات مهمة
                    </div>

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
                      const icons = ["⏰", "📘", "⚠️", "📵", "🎓", "✅", "⛔"];
                      const theme = rowThemes[index % rowThemes.length];

                      return (
                        <div
                          key={item}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 12,
                            padding: "12px 14px",
                            background: theme.bg,
                            border: `1px solid ${theme.border}`,
                            borderRadius: 16,
                            marginBottom: index === getInstructions().length - 1 ? 0 : 10,
                          }}
                        >
                          <div
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 12,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: theme.iconBg,
                              fontSize: 16,
                              flexShrink: 0,
                            }}
                          >
                            {icons[index % icons.length]}
                          </div>
                          <div style={{ lineHeight: 1.9, color: COLORS.text, fontWeight: 700 }}>
                            {item}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      onClick={handlePrint}
                      style={{
                        background: `linear-gradient(135deg, ${COLORS.primaryDark} 0%, ${COLORS.primary} 100%)`,
                        color: "#fff",
                        border: "none",
                        borderRadius: 18,
                        padding: "12px 18px",
                        fontWeight: 800,
                        cursor: "pointer",
                        boxShadow: "0 10px 22px rgba(20,123,131,0.18)",
                      }}
                    >
                      طباعة الجدول
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoBox({ label, value }) {
  return (
    <div
      style={{
        background: "#F8FAFA",
        border: "1px solid #E5ECEB",
        borderRadius: 18,
        padding: 14,
      }}
    >
      <div style={{ color: "#6B7280", fontSize: 13, marginBottom: 6 }}>{label}</div>
      <div style={{ color: COLORS.text, fontSize: 15, fontWeight: 800, wordBreak: "break-word" }}>
        {value}
      </div>
    </div>
  );
}

function Cell({ children }) {
  return (
    <td
      style={{
        padding: 11,
        borderBottom: `1px solid ${COLORS.border}`,
        textAlign: "center",
        fontSize: 13,
        whiteSpace: "nowrap",
      }}
    >
      {children || "-"}
    </td>
  );
}
