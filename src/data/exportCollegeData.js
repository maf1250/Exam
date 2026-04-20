function normalizeArabic(value) {
  return String(value ?? "")
    .trim()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/أ|إ|آ/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ");
}

function safeCompareText(a, b) {
  return normalizeArabic(a).includes(normalizeArabic(b));
}

function sortStudentSchedule(schedule = []) {
  return [...schedule].sort((a, b) => {
    const dateA = String(a.dateISO || a.gregorian || "");
    const dateB = String(b.dateISO || b.gregorian || "");

    if (dateA !== dateB) {
      return dateA.localeCompare(dateB, "ar");
    }

    return String(a.period || "").localeCompare(String(b.period || ""), "ar", {
      numeric: true,
    });
  });
}

function isDeprivationStatus(status) {
  return normalizeArabic(status).includes(normalizeArabic("حرمان"));
}

function buildScheduleLookup(schedule = []) {
  const map = new Map();

  (Array.isArray(schedule) ? schedule : []).forEach((item) => {
    const students = Array.isArray(item.students) ? item.students : [];
    const studentSet = new Set(students.map((id) => normalizeArabic(String(id || "").trim())));

    const key = [
      normalizeArabic(item.courseCode || ""),
      normalizeArabic(item.courseName || ""),
      normalizeArabic(item.department || ""),
      normalizeArabic(item.major || ""),
    ].join("|");

    if (!map.has(key)) {
      map.set(key, []);
    }

    map.get(key).push({
      ...item,
      __studentSet: studentSet,
    });
  });

  return map;
}

function findScheduledItemForRow(scheduleLookup, row) {
  const courseCode = String(row["المقرر"] ?? "").trim();
  const courseName = String(row["اسم المقرر"] ?? "").trim();
  const department = String(row["القسم"] ?? "").trim();
  const major = String(row["التخصص"] ?? "").trim();
  const studentId = normalizeArabic(String(row["رقم المتدرب"] ?? "").trim());

  const key = [
    normalizeArabic(courseCode),
    normalizeArabic(courseName),
    normalizeArabic(department),
    normalizeArabic(major),
  ].join("|");

  const candidates = scheduleLookup.get(key) || [];
  if (!candidates.length) return null;

  const exactByStudent = candidates.find((item) => item.__studentSet?.has(studentId));
  return exactByStudent || candidates[0] || null;
}

export function exportCollegeDataFile({
  slug,
  collegeName,
  schedule,
  parsed,
  studentInfoMap,
  selectedDepartment = "__all__",
  selectedMajor = "__all__",
}) {
  const studentMap = new Map();

  const effectiveStudentInfoMap =
    studentInfoMap instanceof Map
      ? studentInfoMap
      : parsed?.studentInfoMap instanceof Map
      ? parsed.studentInfoMap
      : new Map();

  const sourceRows = Array.isArray(parsed?.filteredRows)
    ? parsed.filteredRows
    : Array.isArray(parsed?.rows)
    ? parsed.rows
    : [];

  const filteredRows = sourceRows.filter((row) => {
    const depOk =
      selectedDepartment === "__all__" ||
      safeCompareText(row["القسم"] || "", selectedDepartment);

    const majorOk =
      selectedMajor === "__all__" ||
      safeCompareText(row["التخصص"] || "", selectedMajor);

    return depOk && majorOk;
  });

  const scheduleLookup = buildScheduleLookup(schedule);

  filteredRows.forEach((row) => {
    const studentId = String(row["رقم المتدرب"] ?? "").trim();
    const studentName = String(row["إسم المتدرب"] ?? row["اسم المتدرب"] ?? "").trim();
    const courseCode = String(row["المقرر"] ?? "").trim();
    const courseName = String(row["اسم المقرر"] ?? "").trim();
    const registrationStatus = String(row["حالة تسجيل"] ?? "").trim();
    const department = String(row["القسم"] ?? "").trim();
    const major = String(row["التخصص"] ?? "").trim();

    if (!studentId || (!courseCode && !courseName)) return;

    const info = effectiveStudentInfoMap.get(studentId) || {
      id: studentId,
      name: studentName || "",
      department,
      major,
    };

    if (!studentMap.has(studentId)) {
      studentMap.set(studentId, {
        id: info.id || studentId,
        name: info.name || studentName || "",
        department: info.department || department || "",
        major: info.major || major || "",
        schedule: [],
      });
    }

    const scheduledItem = findScheduledItemForRow(scheduleLookup, row);
    const isDeprived = isDeprivationStatus(registrationStatus);

    studentMap.get(studentId).schedule.push({
      courseName,
      courseCode,
      dayName: scheduledItem?.dayName || "",
      dateISO: scheduledItem?.dateISO || "",
      gregorian: scheduledItem?.gregorian || "",
      hijriNumeric: scheduledItem?.hijriNumeric || "",
      period: scheduledItem?.period || "",
      timeText: scheduledItem?.timeText || "",
      examHall: scheduledItem?.examHall || "",
      registrationStatus,
      isDeprived,
      hasScheduledSlot: Boolean(scheduledItem),
    });
  });

  const students = Array.from(studentMap.values())
    .map((student) => ({
      ...student,
      schedule: sortStudentSchedule(student.schedule || []),
    }))
    .filter((student) => Array.isArray(student.schedule) && student.schedule.length > 0);

  const output = {
    slug: String(slug || "").trim(),
    collegeName: String(collegeName || "").trim(),
    students,
    exportedAt: new Date().toISOString(),
    filters: {
      selectedDepartment,
      selectedMajor,
    },
  };

  const fileName = `${String(slug || "college-data").trim() || "college-data"}.json`;

  const blob = new Blob([JSON.stringify(output, null, 2)], {
    type: "application/json;charset=utf-8",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}
