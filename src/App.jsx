import React, { useState } from "react";
import Papa from "papaparse";

// Toast component
function Toast({ message }) {
  if (!message) return null;
  return (
    <div style={{
      position: "fixed",
      top: "20px",
      left: "20px",
      background: "#333",
      color: "#fff",
      padding: "10px 20px",
      borderRadius: "8px"
    }}>
      {message}
    </div>
  );
}

export default function App() {
  const [data, setData] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [toast, setToast] = useState("");

  // Upload CSV
  const handleFile = (file) => {
    Papa.parse(file, {
      header: true,
      complete: (results) => {
        setData(results.data);
        showToast("تم رفع الملف بنجاح");
      }
    });
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  // Generate schedule (simple version)
  const generateSchedule = () => {
    if (data.length === 0) {
      showToast("ارفع ملف أولاً");
      return;
    }

    let result = [];

    data.forEach((row, index) => {
      result.push({
        course: row["اسم المقرر"],
        trainer: row["المدرب"],
        date: `2026-05-${(index % 10) + 1}`,
        hijri: "1447 هـ",
        period: (index % 2) + 1
      });
    });

    setSchedule(result);
    showToast("تم إنشاء الجدول");
  };

  return (
    <div style={{ padding: "20px", direction: "rtl" }}>
      <h1>📊 جدول الاختبارات - الكلية التقنية</h1>

      <input
        type="file"
        accept=".csv"
        onChange={(e) => handleFile(e.target.files[0])}
      />

      <br /><br />

      <button onClick={generateSchedule}>
        إنشاء الجدول
      </button>

      <Toast message={toast} />

      <div style={{ marginTop: "20px" }}>
        {schedule.map((item, i) => (
          <div key={i} style={{
            border: "1px solid #ddd",
            padding: "10px",
            marginBottom: "10px",
            borderRadius: "10px"
          }}>
            <b>{item.course}</b><br />
            المدرب: {item.trainer}<br />
            التاريخ: {item.date} | {item.hijri}<br />
            الفترة: {item.period}
          </div>
        ))}
      </div>
    </div>
  );
}