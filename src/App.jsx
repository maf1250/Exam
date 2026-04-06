import React, { useState } from "react";
import Papa from "papaparse";

function Toast({ msg }) {
  if (!msg) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 20,
        left: 20,
        background: "#16a34a",
        color: "#fff",
        padding: "10px 20px",
        borderRadius: "10px",
        zIndex: 9999,
      }}
    >
      {msg}
    </div>
  );
}

function getHijri(date) {
  return new Intl.DateTimeFormat("ar-SA-u-ca-islamic", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export default function App() {
  const [data, setData] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [toast, setToast] = useState("");
  const [useInvigilators, setUseInvigilators] = useState(true);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const handleFile = (file) => {
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        setData(res.data || []);
        showToast("تم رفع الملف");
      },
      error: () => {
        showToast("تعذر قراءة الملف");
      },
    });
  };

  const generateSchedule = () => {
    if (!data.length) {
      showToast("ارفع الملف أولاً");
      return;
    }

    const courses = {};
    const invigilators = new Set();

    data.forEach((r) => {
      const courseName = r["اسم المقرر"] || r["المقرر"] || "";
      const trainer = r["المدرب"] || "";
      const studentId = r["رقم المتدرب"] || "";

      if (!courseName) return;

      if (!courses[courseName]) {
        courses[courseName] = {
          name: courseName,
          trainer,
          students: new Set(),
        };
      }

      if (studentId) {
        courses[courseName].students.add(studentId);
      }

      if (trainer) {
        invigilators.add(trainer);
      }
    });

    const list = Object.values(courses).sort(
      (a, b) => b.students.size - a.students.size
    );

    const result = [];
    const base = new Date();

    list.forEach((course, i) => {
      const date = new Date(base);
      date.setDate(base.getDate() + i);

      const period = (i % 2) + 1;

      result.push({
        course: course.name,
        trainer: course.trainer,
        date: date.toLocaleDateString("ar-SA"),
        hijri: getHijri(date),
        period,
        invigilators: useInvigilators
          ? Array.from(invigilators)
              .filter((name) => name !== course.trainer)
              .slice(0, 2)
          : [],
      });
    });

    setSchedule(result);
    showToast("تم إنشاء الجدول");
  };

  return (
    <div style={{ padding: 20, direction: "rtl", fontFamily: "Arial, sans-serif" }}>
      <h1>📊 جدول الاختبارات</h1>

      <input
        type="file"
        accept=".csv"
        onChange={(e) => handleFile(e.target.files[0])}
      />

      <br />
      <br />

      <label>
        <input
          type="checkbox"
          checked={useInvigilators}
          onChange={() => setUseInvigilators(!useInvigilators)}
        />{" "}
        إضافة المراقبين
      </label>

      <br />
      <br />

      <button onClick={generateSchedule}>إنشاء الجدول</button>

      <Toast msg={toast} />

      <div style={{ marginTop: 20 }}>
        {schedule.map((e, i) => (
          <div
            key={i}
            style={{
              border: "1px solid #ccc",
              padding: 10,
              marginBottom: 10,
              borderRadius: 8,
              background: "#fff",
            }}
          >
            <b>{e.course}</b>
            <br />
            المدرب: {e.trainer}
            <br />
            التاريخ: {e.date}
            <br />
            الهجري: {e.hijri}
            <br />
            الفترة: {e.period}
            <br />
            المراقبون: {e.invigilators.join(", ")}
          </div>
        ))}
      </div>
    </div>
  );
}
