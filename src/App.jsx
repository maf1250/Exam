import React, { useState } from "react";
import Papa from "papaparse";

// ===== Toast =====
function Toast({ message }) {import React, { useState } from "react";
import Papa from "papaparse";

// Toast
function Toast({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      position: "fixed",
      top: 20,
      left: 20,
      background: "#16a34a",
      color: "#fff",
      padding: "10px 20px",
      borderRadius: "10px"
    }}>
      {msg}
    </div>
  );
}

// Hijri
function getHijri(date) {
  return new Intl.DateTimeFormat("ar-SA-u-ca-islamic", {
    day: "numeric",
    month: "long",
    year: "numeric"
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
    Papa.parse(file, {
      header: true,
      complete: (res) => {
        setData(res.data);
        showToast("تم رفع الملف");
      }
    });
  };

  const generateSchedule = () => {
    if (!data.length) {
      showToast("ارفع الملف أولاً");
      return;
    }

    let courses = {};
    let invigilators = new Set();

    data.forEach(r => {
      let c = r["اسم المقرر"];
      let t = r["المدرب"];
      let s = r["رقم المتدرب"];

      if (!courses[c]) {
        courses[c] = { name: c, trainer: t, students: new Set() };
      }

      courses[c].students.add(s);
      if (t) invigilators.add(t);
    });

    let list = Object.values(courses);

    list.sort((a, b) => b.students.size - a.students.size);

    let result = [];
    let map = {};
    let base = new Date();

    list.forEach((course, i) => {
      let date = new Date(base);
      date.setDate(base.getDate() + i);

      let period = (i % 2) + 1;

      result.push({
        course: course.name,
        trainer: course.trainer,
        date: date.toLocaleDateString("ar-SA"),
        hijri: getHijri(date),
        period,
        invigilators: useInvigilators ? Array.from(invigilators).slice(0, 2) : []
      });
    });

    setSchedule(result);
    showToast("تم إنشاء الجدول");
  };

  return (
    <div style={{ padding: 20, direction: "rtl" }}>
      <h1>📊 جدول الاختبارات</h1>

      <input type="file" accept=".csv"
        onChange={(e) => handleFile(e.target.files[0])}
      />

      <br /><br />

      <label>
        <input
          type="checkbox"
          checked={useInvigilators}
          onChange={() => setUseInvigilators(!useInvigilators)}
        />
        إضافة المراقبين
      </label>

      <br /><br />

      <button onClick={generateSchedule}>
        إنشاء الجدول
      </button>

      <Toast msg={toast} />

      <div style={{ marginTop: 20 }}>
        {schedule.map((e, i) => (
          <div key={i} style={{
            border: "1px solid #ccc",
            padding: 10,
            marginBottom: 10
          }}>
            <b>{e.course}</b><br />
            {e.trainer}<br />
            {e.date} | {e.hijri}<br />
            الفترة {e.period}<br />
            المراقبين: {e.invigilators.join(", ")}
          </div>
        ))}
      </div>
    </div>
  );
}
  if (!message) return null;
  return (
    <div style={{
      position: "fixed",
      top: "20px",
      left: "20px",
      background: "#16a34a",
      color: "#fff",
      padding: "12px 20px",
      borderRadius: "10px",
      boxShadow: "0 5px 20px rgba(0,0,0,0.2)"
    }}>
      {message}
    </div>
  );
}

// ===== Hijri Date =====
function getHijri(date) {
  return new Intl.DateTimeFormat("ar-SA-u-ca-islamic", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

export default function App() {

  const [data, setData] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [toast, setToast] = useState("");
  const [useInvigilators, setUseInvigilators] = useState(true);

  // ===== Toast helper =====
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  // ===== Upload CSV =====
  const handleFile = (file) => {
    Papa.parse(file, {
      header: true,
      complete: (results) => {
        setData(results.data);
        showToast("✅ تم رفع الملف");
      }
    });
  };

  // ===== Generate Smart Schedule =====
  const generateSchedule = () => {
    if (!data.length) {
      showToast("❌ ارفع الملف أولاً");
      return;
    }

    // Group courses
    const courses = {};
    const invigilators = new Set();

    data.forEach(row => {
      const course = row["اسم المقرر"];
      const trainer = row["المدرب"];
      const student = row["رقم المتدرب"];

      if (!course) return;

      if (!courses[course]) {
        courses[course] = {
          name: course,
          trainer,
          students: new Set()
        };
      }

      courses[course].students.add(student);
      if (trainer) invigilators.add(trainer);
    });

    let courseList = Object.values(courses);

    // Sort (smart priority)
    courseList.sort((a, b) =>
      b.students.size - a.students.size
    );

    let result = [];
    let studentMap = {};

    let date = new Date();
    let dayOffset = 0;

    courseList.forEach((course, index) => {
      let assigned = false;

      while (!assigned) {
        let examDate = new Date();
        examDate.setDate(date.getDate() + dayOffset);

        let period = (index % 2) + 1;

        // check conflicts
        let conflict = false;

        course.students.forEach(st => {
          if (!studentMap[st]) studentMap[st] = [];

          let sameDay = studentMap[st].filter(e =>
            e.date === examDate.toDateString()
          );

          if (sameDay.length >= 2) conflict = true;
        });

        if (!conflict) {
          // assign
          course.students.forEach(st => {
            if (!studentMap[st]) studentMap[st] = [];
            studentMap[st].push({
              date: examDate.toDateString()
            });
          });

          result.push({
            course: course.name,
            trainer: course.trainer,
            date: examDate.toLocaleDateString("ar-SA"),
            hijri: getHijri(examDate),
            period,
            invigilators: useInvigilators
              ? Array.from(invigilators).slice(0, 2)
              : []
          });

          assigned = true;
        } else {
          dayOffset++;
        }
      }
    });

    setSchedule(result);
    showToast("🚀 تم إنشاء الجدول بدون تعارض");
  };

  return (
    <div style={{ padding: "20px", direction: "rtl", fontFamily: "Cairo" }}>

      <h1>📊 نظام جدول الاختبارات - الكلية التقنية</h1>

      {/* Upload */}
      <input
        type="file"
        accept=".csv"
        onChange={(e) => handleFile(e.target.files[0])}
      />

      <br /><br />

      {/* Invigilators toggle */}
      <label>
        <input
          type="checkbox"
          checked={useInvigilators}
          onChange={() => setUseInvigilators(!useInvigilators)}
        />
        إضافة المراقبين تلقائياً
      </label>

      <br /><br />

      {/* Generate */}
      <button onClick={generateSchedule}>
        إنشاء الجدول الذكي
      </button>

      <Toast message={toast} />

      {/* Result */}
      <div style={{ marginTop: "20px" }}>
        {schedule.map((item, i) => (
          <div key={i} style={{
            border: "1px solid #ddd",
            padding: "15px",
            marginBottom: "10px",
            borderRadius: "12px"
          }}>
            <h3>{item.course}</h3>
            <p>👨‍🏫 المدرب: {item.trainer}</p>
            <p>📅 التاريخ: {item.date}</p>
            <p>🕌 هجري: {item.hijri}</p>
            <p>⏰ الفترة: {item.period}</p>
            <p>👀 المراقبين: {item.invigilators.join(" , ")}</p>
          </div>
        ))}
      </div>

    </div>
  );
}
