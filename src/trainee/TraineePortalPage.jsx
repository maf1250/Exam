import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

const COLORS = {
  primary: "#1FA7A8",
  primaryDark: "#147B83",
  primaryLight: "#E7F8F7",
  primaryBorder: "#A8DDDA",
  text: "#1F2529",
  muted: "#6B7280",
  bg: "#F7FBFB",
  card: "#FFFFFF",
  border: "#D7E7E6",
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
        if (!cancelled) setCollegeData(data);
      } catch (err) {
        if (!cancelled) {
          setCollegeData(null);
          setError("لا توجد بيانات منشورة لهذه الكلية أو أن الرابط غير صحيح.");
        }
      } finally {
        if (!cancelled) setLoading(false);
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
    document.title = "جداول الاختبارات النهائية - بوابة المتدرب";
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

  const rowsHtml = selectedStudent.schedule
    .map(
      (item, index) => `
        <tr>
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

  const instructions = [
    "يجب على المتدرب الحضور إلى قاعة الاختبار قبل موعد الاختبار بـ 15 دقيقة.",
    "لا يسمح للمتدرب بدخول الاختبار بعد مضي نصف ساعة من بدايته، ولا يسمح له بالخروج قبل مضي نصف ساعة.",
    "قيام المتدرب بالغش أو محاولة الغش يعتبر مخالفة لتعليمات وقواعد إجراء الاختبارات، وترصد له درجة (صفر) في اختبار ذلك المقرر.",
    "وجود الجوال أو أي أوراق تخص المقرر في حوزة المتدرب تعتبر شروعًا في الغش وتطبق عليه قواعد إجراءات الاختبارات.",
    "يجب على المتدرب التقيد بالزي التدريبي والتزام الهدوء داخل قاعة الاختبار.",
    "يتطلب حصول المتدرب على 25% من درجة الاختبار النهائي حتى يجتاز المقرر التدريبي بالكليات التقنية.",
    "لا يسمح للمتدرب المحروم بدخول الاختبارات النهائية.",
  ];

  const html = `
    <html dir="rtl" lang="ar">
      <head>
        <title>جدول المتدرب</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 10mm;
          }

          * {
            box-sizing: border-box;
          }

          body {
            font-family: Tahoma, Arial, sans-serif;
            direction: rtl;
            margin: 0;
            padding: 0;
            color: #111827;
            background: #fff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .page {
            padding: 18px;
          }

          .header {
            position: relative;
            overflow: hidden;
            background: linear-gradient(135deg, #0F766E 0%, #147B83 38%, #1FA7A8 100%);
            border-radius: 24px;
            padding: 18px 20px;
            color: #fff;
            margin-bottom: 16px;
          }

          .header-inner {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
          }

          .badge {
            display: inline-block;
            background: rgba(255,255,255,0.14);
            border: 1px solid rgba(255,255,255,0.18);
            border-radius: 999px;
            padding: 6px 12px;
            font-size: 12px;
            font-weight: 800;
            margin-bottom: 10px;
          }

          .college-name {
            font-size: 24px;
            font-weight: 900;
            margin-bottom: 4px;
          }

          .doc-title {
            font-size: 15px;
            opacity: 0.96;
          }

          .logo-box {
            width: 135px;
            height: 135px;
            border-radius: 20px;
            background: rgba(255,255,255,0.14);
            border: 1px solid rgba(255,255,255,0.18);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          }

         .logo-box img {
  width: 80%;
  height: 80%;
  object-fit: contain;
}

          .meta-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
            margin: 14px 0 16px;
          }

          .meta-box {
            border: 1px solid #D7E7E6;
            border-radius: 16px;
            padding: 12px 14px;
            background: #F8FCFC;
          }

          .meta-label {
            color: #6B7280;
            font-size: 12px;
            margin-bottom: 4px;
          }

          .meta-value {
            color: #1F2529;
            font-weight: 800;
            font-size: 14px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 6px;
          }

          th, td {
            border: 1px solid #D7E7E6;
            padding: 8px 6px;
            text-align: center;
            font-size: 12px;
          }

          th {
            background: #E7F8F7;
            color: #147B83;
            font-weight: 900;
          }

          .instructions {
            margin-top: 16px;
            border: 1px solid #A8DDDA;
            border-radius: 20px;
            padding: 14px;
            background: linear-gradient(180deg, #F9FEFE 0%, #F2FBFB 100%);
          }

          .instructions-title {
            font-size: 16px;
            font-weight: 900;
            color: #147B83;
            margin-bottom: 10px;
          }

          .instructions ol {
            margin: 0;
            padding-right: 18px;
            line-height: 1.9;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <div class="header-inner">
              <div>
                <div class="badge">بوابة المتدرب</div>
                <div class="college-name">${collegeData.collegeName || "الكلية التقنية"}</div>
                <div class="doc-title">الجدول النهائي للمتدرب</div>
              </div>

              <div class="logo-box">
                <img src="${window.location.origin + LOGO_SRC}" alt="TVTC Logo" />
              </div>
            </div>
          </div>

          <div class="meta-grid">
            <div class="meta-box">
              <div class="meta-label">اسم المتدرب</div>
              <div class="meta-value">${selectedStudent.name || "-"}</div>
            </div>
            <div class="meta-box">
              <div class="meta-label">رقم المتدرب</div>
              <div class="meta-value">${selectedStudent.id || "-"}</div>
            </div>
            <div class="meta-box">
              <div class="meta-label">القسم</div>
              <div class="meta-value">${selectedStudent.department || "-"}</div>
            </div>
            <div class="meta-box">
              <div class="meta-label">التخصص</div>
              <div class="meta-value">${selectedStudent.major || "-"}</div>
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
              ${instructions.map((item) => `<li>${item}</li>`).join("")}
            </ol>
          </div>
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
    <div style={{ maxWidth: 920, margin: "0 auto" }}>
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(135deg, #0F766E 0%, #147B83 38%, #1FA7A8 100%)",
          borderRadius: 32,
          padding: 24,
          color: "#fff",
          boxShadow: "0 22px 55px rgba(20,123,131,0.20)",
          marginBottom: 22,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -90,
            left: -90,
            width: 220,
            height: 220,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.08)",
            filter: "blur(8px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -70,
            right: -70,
            width: 180,
            height: 180,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.06)",
            filter: "blur(8px)",
          }}
        />

        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 18,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: "1 1 320px", minWidth: 260 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "rgba(255,255,255,0.14)",
                border: "1px solid rgba(255,255,255,0.18)",
                borderRadius: 999,
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 800,
                marginBottom: 14,
              }}
            >
              <span>بوابة المتدرب</span>
            </div>

            <div style={{ fontSize: 30, fontWeight: 900, marginBottom: 8, lineHeight: 1.4 }}>
              {collegeData?.collegeName || "جدول الاختبارات النهائية"}
            </div>

            <div style={{ lineHeight: 1.9, opacity: 0.95, fontSize: 15 }}>
              ابحث باسمك أو برقمك التدريبي لعرض جدول الاختبارات النهائية الخاص بك وطباعته بشكل منظم وواضح.
            </div>
          </div>

          <div
            style={{
              width: 92,
              height: 92,
              borderRadius: 24,
              background: "rgba(255,255,255,0.14)",
              border: "1px solid rgba(255,255,255,0.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backdropFilter: "blur(4px)",
              flexShrink: 0,
            }}
          >
            <img
              src={LOGO_SRC}
              alt="TVTC Logo"
              style={{
                width: 62,
                height: 62,
                objectFit: "contain",
              }}
            />
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
          <div style={{ textAlign: "center", padding: 40, color: "#B42318" }}>
            {error}
          </div>
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
                }}
              >
                {suggestions.map((student) => (
                  <button
                    key={`${student.id}-${student.name}`}
                    type="button"
                    onClick={() => {
                      setSelectedStudent(student);
                      setSearchText(student.name || student.id || "");
                    }}
                    style={{
                      width: "100%",
                      border: "none",
                      borderBottom: `1px solid ${COLORS.border}`,
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
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: 12,
                    marginBottom: 18,
                  }}
                >
                  <InfoBox label="اسم المتدرب" value={selectedStudent.name || "-"} />
                  <InfoBox label="رقم المتدرب" value={selectedStudent.id || "-"} />
                  <InfoBox label="القسم" value={selectedStudent.department || "-"} />
                  <InfoBox label="التخصص" value={selectedStudent.major || "-"} />
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["م", "المقرر", "الرمز", "اليوم", "التاريخ الميلادي", "التاريخ الهجري", "الفترة", "الوقت", "المقر"].map((head) => (
                          <th
                            key={head}
                            style={{
                              background: COLORS.primaryLight,
                              border: `1px solid ${COLORS.primaryBorder}`,
                              padding: 10,
                              fontSize: 14,
                            }}
                          >
                            {head}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedStudent.schedule.map((item, index) => (
                        <tr key={`${item.courseCode}-${index}`}>
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
                    marginTop: 22,
                    border: `1px solid ${COLORS.primaryBorder}`,
                    borderRadius: 24,
                    padding: 18,
                    background: "linear-gradient(180deg, #F9FEFE 0%, #F2FBFB 100%)",
                    boxShadow: "0 10px 28px rgba(20,123,131,0.08)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 14,
                      color: COLORS.primaryDark,
                      fontWeight: 900,
                      fontSize: 18,
                    }}
                  >
                    <span
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 12,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: COLORS.primaryLight,
                        border: `1px solid ${COLORS.primaryBorder}`,
                        fontSize: 18,
                      }}
                    >
                      📋
                    </span>
                    <span>تعليمات مهمة</span>
                  </div>

                  <div style={{ display: "grid", gap: 10 }}>
                    {[
                      "يجب على المتدرب الحضور إلى قاعة الاختبار قبل موعد الاختبار بـ 15 دقيقة.",
                      "لا يسمح للمتدرب بدخول الاختبار بعد مضي نصف ساعة من بدايته، ولا يسمح له بالخروج قبل مضي نصف ساعة.",
                      "قيام المتدرب بالغش أو محاولة الغش يعتبر مخالفة لتعليمات وقواعد إجراء الاختبارات، وترصد له درجة (صفر) في اختبار ذلك المقرر.",
                      "وجود الجوال أو أي أوراق تخص المقرر في حوزة المتدرب تعتبر شروعًا في الغش وتطبق عليه قواعد إجراءات الاختبارات.",
                      "يجب على المتدرب التقيد بالزي التدريبي والتزام الهدوء داخل قاعة الاختبار.",
                      "يتطلب حصول المتدرب على 25% من درجة الاختبار النهائي حتى يجتاز المقرر التدريبي بالكليات التقنية.",
                      "لا يسمح للمتدرب المحروم بدخول الاختبارات النهائية.",
                    ].map((item, index) => {
                      const rowThemes = [
                        { bg: "#F0FDFA", border: "#99F6E4", iconBg: "#CCFBF1" },
                        { bg: "#ECFEFF", border: "#A5F3FC", iconBg: "#CFFAFE" },
                        { bg: "#F5F3FF", border: "#DDD6FE", iconBg: "#EDE9FE" },
                        { bg: "#FFF7ED", border: "#FED7AA", iconBg: "#FFEDD5" },
                        { bg: "#FEFCE8", border: "#FDE68A", iconBg: "#FEF3C7" },
                        { bg: "#F0FDF4", border: "#BBF7D0", iconBg: "#DCFCE7" },
                        { bg: "#FEF2F2", border: "#FECACA", iconBg: "#FEE2E2" },
                      ];

                      const icons = ["⏰", "🚪", "🚫", "📵", "🧥", "📈", "⛔"];
                      const theme = rowThemes[index % rowThemes.length];

                      return (
                        <div
                          key={index}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 12,
                            background: theme.bg,
                            border: `1px solid ${theme.border}`,
                            borderRadius: 18,
                            padding: "12px 14px",
                          }}
                        >
                          <span
                            style={{
                              minWidth: 34,
                              width: 34,
                              height: 34,
                              borderRadius: 12,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: theme.iconBg,
                              fontSize: 17,
                              lineHeight: 1,
                            }}
                          >
                            {icons[index % icons.length]}
                          </span>

                          <div
                            style={{
                              color: COLORS.text,
                              lineHeight: 1.9,
                              fontSize: 14,
                              fontWeight: 700,
                            }}
                          >
                            {item}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
                  <button
                    type="button"
                    onClick={handlePrint}
                    style={{
                      background: COLORS.primaryDark,
                      color: "#fff",
                      border: "none",
                      borderRadius: 18,
                      padding: "12px 18px",
                      fontWeight: 800,
                      cursor: "pointer",
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
      <div style={{ color: "#1F2529", fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function Cell({ children }) {
  return (
    <td
      style={{
        border: "1px solid #E5ECEB",
        padding: 10,
        textAlign: "center",
        fontSize: 14,
      }}
    >
      {children}
    </td>
  );
}
