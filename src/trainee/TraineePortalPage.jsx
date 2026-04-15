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

        const res = await fetch(`/colleges/${slug}.json`);
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
  }, [slug]);

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

    const html = `
      <html dir="rtl" lang="ar">
        <head>
          <title>جدول المتدرب</title>
          <style>
            body {
              font-family: Tahoma, Arial, sans-serif;
              direction: rtl;
              padding: 24px;
              color: #111827;
            }
            h1 {
              color: #147B83;
              margin-bottom: 8px;
            }
            .meta {
              margin-bottom: 18px;
              line-height: 1.9;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            th, td {
              border: 1px solid #d1d5db;
              padding: 8px;
              text-align: center;
              font-size: 14px;
            }
            th {
              background: #E7F8F7;
            }
          </style>
        </head>
        <body>
          <h1>${collegeData.collegeName}</h1>
          <div class="meta">
            <div><strong>اسم المتدرب:</strong> ${selectedStudent.name || "-"}</div>
            <div><strong>رقم المتدرب:</strong> ${selectedStudent.id || "-"}</div>
            <div><strong>القسم:</strong> ${selectedStudent.department || "-"}</div>
            <div><strong>التخصص:</strong> ${selectedStudent.major || "-"}</div>
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
            background: "linear-gradient(135deg, #147B83 0%, #1FA7A8 100%)",
            borderRadius: 28,
            padding: 28,
            color: "#fff",
            boxShadow: "0 20px 50px rgba(20,123,131,0.18)",
            marginBottom: 22,
          }}
        >
          <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 8 }}>
            بوابة المتدرب
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, marginBottom: 8 }}>
            {collegeData?.collegeName || "بوابة الجداول"}
          </div>
          <div style={{ lineHeight: 1.9, opacity: 0.95 }}>
            ابحث باسمك أو برقمك التدريبي لعرض جدولك وطباعته.
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
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
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
