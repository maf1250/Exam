import React, { useMemo, useRef, useState } from "react";
import Papa from "papaparse";

const REQUIRED_COLUMNS = [
  "المقرر",
  "اسم المقرر",
  "الرقم المرجعي",
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
const EXCLUDED_TRAINEE = ["مطوي قيده"];

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

function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function buildSlots({ startDate, weeks, periodsPerDay, periodHours, startHour, selectedDays }) {
  if (!startDate || !selectedDays.length) return [];

  const allowed = new Set(selectedDays);
  const slots = [];
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);

  let countedWeeks = 0;
  let safety = 0;

  while (countedWeeks < weeks && safety < 500) {
    const dayName = new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(cursor);

    if (allowed.has(dayName)) {
      for (let p = 0; p < periodsPerDay; p += 1) {
        const examStartHour = startHour + p * periodHours;
        const examEndHour = examStartHour + periodHours;

        slots.push({
          id: `${cursor.toISOString().slice(0, 10)}-${p + 1}`,
          dateISO: cursor.toISOString().slice(0, 10),
          dayName,
          period: p + 1,
          startHour: examStartHour,
          endHour: examEndHour,
          gregorian: formatGregorian(cursor),
          hijri: formatHijri(cursor),
          timeText: `${String(examStartHour).padStart(2, "0")}:00 - ${String(examEndHour).padStart(2, "0")}:00`,
        });
      }
    }

    if (dayName === "الخميس") countedWeeks += 1;
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

function Toast({ item, onClose }) {
  if (!item) return null;

  const bg = item.type === "error" ? "#fef2f2" : item.type === "warning" ? "#fff7ed" : "#ecfdf5";
  const border = item.type === "error" ? "#fecaca" : item.type === "warning" ? "#fdba74" : "#a7f3d0";
  const color = item.type === "error" ? "#991b1b" : item.type === "warning" ? "#9a3412" : "#065f46";

  return (
    <div style={{
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
      boxShadow: "0 16px 35px rgba(15,23,42,0.12)",
    }}>
      <div style={{ fontWeight: 800, marginBottom: 6 }}>{item.title}</div>
      <div style={{ fontSize: 14, lineHeight: 1.7 }}>{item.description}</div>
      <button onClick={onClose} style={{ marginTop: 10, background: "transparent", border: "none", color, fontWeight: 700, cursor: "pointer" }}>
        إغلاق
      </button>
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div style={{
      background: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: 28,
      padding: 20,
      boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
      ...style,
    }}>
      {children}
    </div>
  );
}

function SectionHeader({ title, description }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 24, fontWeight: 900, color: "#0f172a" }}>{title}</div>
      {description ? <div style={{ color: "#64748b", marginTop: 6, lineHeight: 1.8 }}>{description}</div> : null}
    </div>
  );
}

function StatBox({ label, value }) {
  return (
    <div style={{ background: "#fff", borderRadius: 22, padding: 18, border: "1px solid #e5e7eb", boxShadow: "0 8px 24px rgba(15,23,42,0.05)" }}>
      <div style={{ fontSize: 14, color: "#64748b", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color: "#0f172a" }}>{value}</div>
    </div>
  );
}

function fieldStyle() {
  return {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #d1d5db",
    borderRadius: 16,
    padding: "12px 14px",
    background: "#fff",
    outline: "none",
    fontFamily: "inherit",
    fontSize: 15,
  };
}

function toggleDay(list, day) {
  return list.includes(day) ? list.filter((d) => d !== day) : [...list, day];
}

export default function App() {
  const fileRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [toast, setToast] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [weeks, setWeeks] = useState(3);
  const [periodsPerDay, setPeriodsPerDay] = useState(2);
  const [periodHours, setPeriodHours] = useState(2);
  const [startHour, setStartHour] = useState(8);
  const [selectedDays, setSelectedDays] = useState(["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"]);
  const [includeInvigilators, setIncludeInvigilators] = useState(true);
  const [excludedInvigilators, setExcludedInvigilators] = useState([]);
  const [excludeInactive, setExcludeInactive] = useState(true);
  const [prioritizeTrainer, setPrioritizeTrainer] = useState("");
  const [manualInvigilators, setManualInvigilators] = useState("");
  const [invigilatorsPerPeriod, setInvigilatorsPerPeriod] = useState(2);
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
        const cleanRows = (result.data || []).filter((row) => Object.values(row).some((v) => String(v ?? "").trim() !== ""));
        setRows(cleanRows);
        setSchedule([]);
        setUnscheduled([]);
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
      const badReg = EXCLUDED_REGISTRATION.some((item) => regStatus.includes(normalizeArabic(item)));
      const badTrainee = EXCLUDED_TRAINEE.some((item) => traineeStatus.includes(normalizeArabic(item)));
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
      const reference = String(row["الرقم المرجعي"] ?? "").trim();
      const trainer = String(row["المدرب"] ?? "").trim();
      const studentId = String(row["رقم المتدرب"] ?? "").trim();
      const department = String(row["القسم"] ?? "").trim();
      const major = String(row["التخصص"] ?? "").trim();
      const collegeName = String(row["الوحدة"] ?? "").trim();
      const scheduleType = String(row["نوع الجدولة"] ?? "").trim();
      const sectionName = `${department || "-"} / ${major || "-"}`;

      if (trainer) invigilatorSet.add(trainer);
      if (studentId) studentSet.add(studentId);
      if (sectionName !== "- / -") sectionSet.add(sectionName);

      const key = [reference, courseCode, courseName, trainer].join("|");

      if (!courseMap.has(key)) {
        courseMap.set(key, {
          key,
          reference,
          courseCode,
          courseName,
          trainer,
          department,
          major,
          collegeName,
          scheduleType,
          students: new Set(),
        });
      }

      if (studentId) {
        courseMap.get(key).students.add(studentId);
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
        const practicalWeight = normalizeArabic(course.scheduleType).includes("عملي") ? 3 : 2;
        const studentWeight = studentCount >= 80 ? 5 : studentCount >= 40 ? 4 : studentCount >= 20 ? 3 : 2;
        const lowOpportunityWeight = conflictDegree >= 15 ? 5 : conflictDegree >= 8 ? 4 : conflictDegree >= 4 ? 3 : 2;
        const trainerWeight = prioritizeTrainer && normalizeArabic(course.trainer).includes(normalizeArabic(prioritizeTrainer)) ? 5 : 0;
        const priorityScore = practicalWeight * 2 + studentWeight * 3 + lowOpportunityWeight * 3 + trainerWeight;

        return {
          ...course,
          studentCount,
          conflictDegree,
          priorityScore,
          conflictsWith: conflictMap.get(course.key) || new Set(),
          sectionName: `${course.department || "-"} / ${course.major || "-"}`,
        };
      })
      .sort((a, b) => b.priorityScore - a.priorityScore || b.studentCount - a.studentCount || b.conflictDegree - a.conflictDegree);

    return {
      missingColumns,
      filteredRows,
      collegeName: filteredRows[0]?.["الوحدة"] || rows[0]?.["الوحدة"] || "الكلية التقنية",
      courses,
      studentsCount: studentSet.size,
      invigilators: Array.from(invigilatorSet).sort((a, b) => a.localeCompare(b, "ar")),
      sections: Array.from(sectionSet).sort((a, b) => a.localeCompare(b, "ar")),
    };
  }, [rows, excludeInactive, prioritizeTrainer]);

  const slots = useMemo(() => buildSlots({
    startDate,
    weeks,
    periodsPerDay,
    periodHours,
    startHour,
    selectedDays,
  }), [startDate, weeks, periodsPerDay, periodHours, startHour, selectedDays]);

  const generateSchedule = () => {
    if (!rows.length) {
      showToast("لا يوجد ملف", "ارفع ملف CSV أولاً.", "error");
      return;
    }
    if (parsed.missingColumns.length) {
      showToast("أعمدة ناقصة", `الملف ينقصه: ${parsed.missingColumns.join("، ")}`, "error");
      return;
    }
    if (!slots.length) {
      showToast("لا توجد فترات", "اختر تاريخ بداية وأيامًا وفترات مناسبة.", "error");
      return;
    }

    const baseInvigilators = manualInvigilators
      ? manualInvigilators.split("\n").map((name) => name.trim()).filter(Boolean)
      : parsed.invigilators;

    const invigilatorPool = [
      ...new Set(
        baseInvigilators.filter(
          (name) => !excludedInvigilators.some((excluded) => normalizeArabic(excluded) === normalizeArabic(name))
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

      const eligible = invigilatorPool
        .filter((name) => normalizeArabic(name) !== normalizeArabic(course.trainer))
        .filter((name) => !invigilatorBusySlots.get(name)?.has(slot.id))
        .sort((a, b) => {
          const diff = (invigilatorLoad.get(a) || 0) - (invigilatorLoad.get(b) || 0);
          return diff || a.localeCompare(b, "ar");
        });

      const chosen = eligible.slice(0, Math.min(invigilatorsPerPeriod, eligible.length));
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
      if (normalizeArabic(course.scheduleType).includes("عملي") && slot.period === periodsPerDay) score += 2;
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

      slotCoursesMap.get(bestSlot.id).push(course.key);
      placed.push({
        ...course,
        ...bestSlot,
        invigilators: pickInvigilators(course, bestSlot),
      });
    });

    placed.sort((a, b) => a.dateISO.localeCompare(b.dateISO) || a.period - b.period || b.studentCount - a.studentCount);
    setSchedule(placed);
    setUnscheduled(notPlaced);

    if (notPlaced.length) {
      showToast("تم إنشاء الجدول جزئيًا", `تمت جدولة ${placed.length} مقرر وتعذر جدولة ${notPlaced.length} مقرر. زد عدد الأسابيع أو الفترات.`, "warning");
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
          reference: item.reference,
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

  const exportMainSchedule = () => {
    if (!schedule.length) {
      showToast("لا يوجد جدول", "أنشئ الجدول أولًا ثم صدّر الملف.", "error");
      return;
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
      الرقم_المرجعي: item.reference,
      المدرب: item.trainer,
      عدد_المتدربين: item.studentCount,
      المراقبون: item.invigilators.join(" | "),
    }));

    downloadFile(`final-exam-schedule-${(fileName || "technical-college").replace(/\.[^.]+$/, "")}.csv`, rowsToCsv(exportRows), "text/csv;charset=utf-8");
    showToast("تم التصدير", "تم تنزيل جدول الاختبارات CSV.", "success");
  };

  const exportInvigilatorsTable = () => {
    if (!invigilatorTable.length) {
      showToast("لا يوجد توزيع", "أنشئ الجدول أولًا ثم صدّر جدول المراقبين.", "error");
      return;
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
        الرقم_المرجعي: item.reference,
      }))
    );

    downloadFile("invigilators-periods.csv", rowsToCsv(rowsToExport), "text/csv;charset=utf-8");
    showToast("تم التصدير", "تم تنزيل جدول المراقبين والفترات.", "success");
  };

const availableInvigilators = useMemo(() => {
  const baseInvigilators = manualInvigilators
    ? manualInvigilators.split("\n").map((name) => name.trim()).filter(Boolean)
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

  const stats = {
    rows: rows.length,
    students: parsed.studentsCount,
    courses: parsed.courses.length,
    invigilators: parsed.invigilators.length,
    sections: parsed.sections.length,
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #f8fafc 0%, #ffffff 50%, #f1f5f9 100%)",
      padding: 20,
      direction: "rtl",
      fontFamily: "Cairo, Tahoma, Arial, sans-serif",
      color: "#0f172a",
    }}>
      <Toast item={toast} onClose={() => setToast(null)} />

      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <div style={{
          background: "#0f172a",
          color: "#fff",
          borderRadius: 30,
          padding: 28,
          boxShadow: "0 18px 40px rgba(15,23,42,0.18)",
        }}>
          <div style={{ fontSize: 32, fontWeight: 900 }}>نظام بناء جدول الاختبارات النهائية</div>
          <div style={{ color: "#cbd5e1", marginTop: 10, lineHeight: 1.9 }}>
            نسخة احترافية مخصصة للكليات التقنية في المملكة العربية السعودية، تشمل الأقسام، تحديد تاريخ البداية، التقويم الهجري، وتوزيع المراقبين على الفترات.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, marginTop: 20 }}>
          <StatBox label="السجلات" value={stats.rows} />
          <StatBox label="المتدربون" value={stats.students} />
          <StatBox label="المقررات" value={stats.courses} />
          <StatBox label="المراقبون" value={stats.invigilators} />
          <StatBox label="الأقسام / الشعب" value={stats.sections} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(320px, 0.9fr)", gap: 20, marginTop: 20 }}>
          <Card>
            <SectionHeader title="رفع الملف والإعدادات" description="ارفع ملف CSV ثم اضبط إعدادات بناء الجدول قبل الإنشاء." />

            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                handleUpload(e.dataTransfer.files?.[0]);
              }}
              style={{
                minHeight: 170,
                borderRadius: 24,
                border: `2px dashed ${dragActive ? "#0f172a" : "#cbd5e1"}`,
                background: dragActive ? "#e2e8f0" : "#f8fafc",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                textAlign: "center",
                cursor: "pointer",
                transition: "0.2s",
              }}
            >
              <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={(e) => handleUpload(e.target.files?.[0])} />
              <div style={{ fontSize: 22, fontWeight: 900 }}>اسحب الملف هنا أو اضغط للاختيار</div>
              <div style={{ marginTop: 8, color: "#64748b" }}>CSV فقط</div>
              {fileName ? <div style={{ marginTop: 12, background: "#0f172a", color: "#fff", padding: "8px 14px", borderRadius: 999 }}>{fileName}</div> : null}
            </div>

            {parsed.missingColumns.length ? (
              <div style={{ marginTop: 14, borderRadius: 18, padding: 14, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b" }}>
                الأعمدة الناقصة: {parsed.missingColumns.join("، ")}
              </div>
            ) : null}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginTop: 18 }}>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 800 }}>تاريخ البداية</div>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={fieldStyle()} />
              </div>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 800 }}>عدد الأسابيع</div>
                <input type="number" min="1" max="12" value={weeks} onChange={(e) => setWeeks(safeNum(e.target.value, 3))} style={fieldStyle()} />
              </div>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 800 }}>عدد الفترات اليومية</div>
                <select value={periodsPerDay} onChange={(e) => setPeriodsPerDay(safeNum(e.target.value, 2))} style={fieldStyle()}>
                  <option value={1}>فترة واحدة</option>
                  <option value={2}>فترتان</option>
                  <option value={3}>3 فترات</option>
                </select>
              </div>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 800 }}>مدة الفترة</div>
                <select value={periodHours} onChange={(e) => setPeriodHours(safeNum(e.target.value, 2))} style={fieldStyle()}>
                  <option value={2}>ساعتان</option>
                  <option value={3}>3 ساعات</option>
                  <option value={4}>4 ساعات</option>
                </select>
              </div>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 800 }}>بداية أول فترة</div>
                <select value={startHour} onChange={(e) => setStartHour(safeNum(e.target.value, 8))} style={fieldStyle()}>
                  {[7, 8, 9, 10].map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                </select>
              </div>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 800 }}>مدرب له ظروف خاصة</div>
                <input value={prioritizeTrainer} onChange={(e) => setPrioritizeTrainer(e.target.value)} style={fieldStyle()} placeholder="اسم المدرب أو جزء منه" />
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
                        border: `1px solid ${active ? "#0f172a" : "#cbd5e1"}`,
                        background: active ? "#0f172a" : "#fff",
                        color: active ? "#fff" : "#334155",
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

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginTop: 18 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid #e5e7eb", borderRadius: 18, padding: 14 }}>
                <input type="checkbox" checked={excludeInactive} onChange={(e) => setExcludeInactive(e.target.checked)} />
                استبعاد المنسحبين والمطوي قيدهم
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid #e5e7eb", borderRadius: 18, padding: 14 }}>
                <input type="checkbox" checked={includeInvigilators} onChange={(e) => setIncludeInvigilators(e.target.checked)} />
                إضافة المراقبين تلقائيًا
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

                <div style={{ border: "1px solid #e5e7eb", borderRadius: 18, padding: 14 }}>
                  <div style={{ fontWeight: 800, marginBottom: 10 }}>استبعاد مراقبين من التوزيع</div>
                  <div style={{ color: "#64748b", fontSize: 14, marginBottom: 10 }}>
                    يتم جلب الأسماء تلقائيًا من الملف، ويمكنك اختيار من لا يراقب.
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {availableInvigilators.length ? availableInvigilators.map((name) => {
                      const excluded = excludedInvigilators.some((item) => normalizeArabic(item) === normalizeArabic(name));
                      return (
                        <button
                          key={name}
                          onClick={() => toggleExcludedInvigilator(name)}
                          style={{
                            border: `1px solid ${excluded ? "#991b1b" : "#cbd5e1"}`,
                            background: excluded ? "#fef2f2" : "#fff",
                            color: excluded ? "#991b1b" : "#334155",
                            borderRadius: 999,
                            padding: "8px 14px",
                            cursor: "pointer",
                            fontWeight: 700,
                          }}
                        >
                          {excluded ? `مستبعد: ${name}` : name}
                        </button>
                      );
                    }) : <span style={{ color: "#94a3b8" }}>لا توجد أسماء مراقبين بعد</span>}
                  </div>
                </div>
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
              <button onClick={generateSchedule} style={{ background: "#0f172a", color: "#fff", border: "none", borderRadius: 18, padding: "12px 20px", fontWeight: 800, cursor: "pointer" }}>
                إنشاء الجدول
              </button>
              <button onClick={exportMainSchedule} style={{ background: "#fff", color: "#0f172a", border: "1px solid #cbd5e1", borderRadius: 18, padding: "12px 20px", fontWeight: 800, cursor: "pointer" }}>
                تصدير جدول الاختبارات
              </button>
              <button onClick={exportInvigilatorsTable} style={{ background: "#fff", color: "#0f172a", border: "1px solid #cbd5e1", borderRadius: 18, padding: "12px 20px", fontWeight: 800, cursor: "pointer" }}>
                تصدير جدول المراقبين
              </button>
            </div>
          </Card>

          <Card>
            <SectionHeader title="ملخص البيانات" description="استعراض سريع قبل إنشاء الجدول." />
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 18, padding: 14 }}>
                <div style={{ color: "#64748b", marginBottom: 6 }}>الكلية</div>
                <div style={{ fontWeight: 900 }}>{parsed.collegeName || "-"}</div>
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 18, padding: 14 }}>
                <div style={{ color: "#64748b", marginBottom: 6 }}>الأقسام / الشعب</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {parsed.sections.length ? parsed.sections.slice(0, 12).map((section) => (
                    <span key={section} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 999, padding: "6px 12px", fontSize: 13 }}>
                      {section}
                    </span>
                  )) : <span style={{ color: "#94a3b8" }}>لا توجد بيانات بعد</span>}
                </div>
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 18, padding: 14 }}>
                <div style={{ color: "#64748b", marginBottom: 6 }}>عدد الفترات المتاحة</div>
                <div style={{ fontWeight: 900 }}>{slots.length}</div>
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 18, padding: 14 }}>
                <div style={{ color: "#64748b", marginBottom: 6 }}>المراقبون المكتشفون من الملف</div>
                <div style={{ maxHeight: 180, overflow: "auto", display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {parsed.invigilators.length ? parsed.invigilators.map((name) => (
                    <span key={name} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 999, padding: "6px 12px", fontSize: 13 }}>
                      {name}
                    </span>
                  )) : <span style={{ color: "#94a3b8" }}>لا توجد أسماء</span>}
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div style={{ marginTop: 20 }}>
          <Card>
            <SectionHeader title="المقررات مرتبة بالأولوية" description="يعتمد الترتيب على عدد المتدربين، شدة التعارض، ونوع الجدولة." />
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {[
                      "المقرر",
                      "الرمز",
                      "الرقم المرجعي",
                      "القسم / الشعبة",
                      "المدرب",
                      "عدد المتدربين",
                      "التعارضات",
                      "الأولوية",
                    ].map((label) => (
                      <th key={label} style={{ padding: 12, borderBottom: "1px solid #e5e7eb", textAlign: "right", whiteSpace: "nowrap" }}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.courses.slice(0, 30).map((course) => (
                    <tr key={course.key}>
                      <td style={{ padding: 12, borderBottom: "1px solid #f1f5f9" }}>{course.courseName}</td>
                      <td style={{ padding: 12, borderBottom: "1px solid #f1f5f9" }}>{course.courseCode}</td>
                      <td style={{ padding: 12, borderBottom: "1px solid #f1f5f9" }}>{course.reference}</td>
                      <td style={{ padding: 12, borderBottom: "1px solid #f1f5f9" }}>{course.sectionName}</td>
                      <td style={{ padding: 12, borderBottom: "1px solid #f1f5f9" }}>{course.trainer}</td>
                      <td style={{ padding: 12, borderBottom: "1px solid #f1f5f9" }}>{course.studentCount}</td>
                      <td style={{ padding: 12, borderBottom: "1px solid #f1f5f9" }}>{course.conflictDegree}</td>
                      <td style={{ padding: 12, borderBottom: "1px solid #f1f5f9", fontWeight: 800 }}>{course.priorityScore}</td>
                    </tr>
                  ))}
                  {!parsed.courses.length ? (
                    <tr>
                      <td colSpan={8} style={{ padding: 20, textAlign: "center", color: "#94a3b8" }}>لا توجد بيانات بعد</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div style={{ marginTop: 20 }}>
          <Card>
            <SectionHeader title="جدول الاختبارات النهائي" description="يتضمن التاريخ الميلادي والهجري والأقسام والمراقبين لكل فترة." />
            {!schedule.length ? (
              <div style={{ border: "2px dashed #cbd5e1", borderRadius: 22, padding: 30, textAlign: "center", color: "#64748b", background: "#f8fafc" }}>
                ارفع الملف ثم اضغط إنشاء الجدول ليظهر هنا.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 18 }}>
                {Object.entries(groupedSchedule).map(([dateISO, items]) => (
                  <div key={dateISO} style={{ border: "1px solid #e5e7eb", borderRadius: 22, overflow: "hidden" }}>
                    <div style={{ background: "#f8fafc", padding: 16, borderBottom: "1px solid #e5e7eb" }}>
                      <div style={{ fontWeight: 900, fontSize: 18 }}>{items[0].gregorian}</div>
                      <div style={{ marginTop: 4, color: "#64748b" }}>{items[0].hijri}</div>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: "#ffffff" }}>
                            {[
                              "الفترة",
                              "الوقت",
                              "اسم المقرر",
                              "الرمز",
                              "القسم / الشعبة",
                              "المدرب",
                              "عدد المتدربين",
                              "المراقبون",
                            ].map((head) => (
                              <th key={head} style={{ padding: 12, textAlign: "right", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>{head}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item) => (
                            <tr key={`${item.key}-${item.id}`}>
                              <td style={{ padding: 12, borderBottom: "1px solid #f1f5f9", fontWeight: 800 }}>{item.period}</td>
                              <td style={{ padding: 12, borderBottom: "1px solid #f1f5f9" }}>{item.timeText}</td>
                              <td style={{ padding: 12, borderBottom: "1px solid #f1f5f9" }}>{item.courseName}</td>
                              <td style={{ padding: 12, borderBottom: "1px solid #f1f5f9" }}>{item.courseCode}</td>
                              <td style={{ padding: 12, borderBottom: "1px solid #f1f5f9" }}>{item.sectionName}</td>
                              <td style={{ padding: 12, borderBottom: "1px solid #f1f5f9" }}>{item.trainer}</td>
                              <td style={{ padding: 12, borderBottom: "1px solid #f1f5f9" }}>{item.studentCount}</td>
                              <td style={{ padding: 12, borderBottom: "1px solid #f1f5f9" }}>{item.invigilators.join("، ") || "-"}</td>
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
              <div style={{ marginTop: 18, borderRadius: 18, background: "#fff7ed", border: "1px solid #fdba74", color: "#9a3412", padding: 14 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>مقررات لم يتم جدولة اختبارها</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {unscheduled.map((course) => (
                    <span key={course.key} style={{ background: "#fff", border: "1px solid #fed7aa", borderRadius: 999, padding: "6px 12px", fontSize: 13 }}>
                      {course.courseName} - {course.reference}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>
        </div>

        <div style={{ marginTop: 20 }}>
          <Card>
            <SectionHeader title="جدول المراقبين وفترات المراقبة" description="يعرض كل مراقب والفترات المسندة له بشكل منفصل." />
            {!invigilatorTable.length ? (
              <div style={{ border: "2px dashed #cbd5e1", borderRadius: 22, padding: 26, textAlign: "center", color: "#64748b", background: "#f8fafc" }}>
                أنشئ الجدول أولًا ليظهر توزيع المراقبين هنا.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 16 }}>
                {invigilatorTable.map((inv) => (
                  <div key={inv.name} style={{ border: "1px solid #e5e7eb", borderRadius: 22, overflow: "hidden" }}>
                    <div style={{ background: "#f8fafc", padding: 16, borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 900, fontSize: 18 }}>{inv.name}</div>
                      <div style={{ color: "#64748b" }}>عدد الفترات: {inv.periodsCount}</div>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            {[
                              "التاريخ",
                              "اليوم",
                              "الفترة",
                              "الوقت",
                              "المقرر",
                              "الرمز",
                              "الرقم المرجعي",
                            ].map((head) => (
                              <th key={head} style={{ padding: 12, textAlign: "right", borderBottom: "1px solid #e5e7eb", background: "#ffffff", whiteSpace: "nowrap" }}>{head}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {inv.items.map((item, index) => (
                            <tr key={`${inv.name}-${index}`}>
                              <td style={{ padding: 12, borderBottom: "1px solid #f1f5f9" }}>{item.gregorian}</td>
                              <td style={{ padding: 12, borderBottom: "1px solid #f1f5f9" }}>{item.dayName}</td>
                              <td style={{ padding: 12, borderBottom: "1px solid #f1f5f9", fontWeight: 800 }}>{item.period}</td>
                              <td style={{ padding: 12, borderBottom: "1px solid #f1f5f9" }}>{item.timeText}</td>
                              <td style={{ padding: 12, borderBottom: "1px solid #f1f5f9" }}>{item.courseName}</td>
                              <td style={{ padding: 12, borderBottom: "1px solid #f1f5f9" }}>{item.courseCode}</td>
                              <td style={{ padding: 12, borderBottom: "1px solid #f1f5f9" }}>{item.reference}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
