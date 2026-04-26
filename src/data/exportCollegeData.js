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

function isDeprivationRegistrationStatus(status) {
  const normalized = normalizeArabic(String(status || "").trim());

  const allowedCases = [
    "اعاده القيد",
    "اعاده القيد بسبب الحرمان",
    "مقرر معاد قيده لتعديل الحرمان",
  ];

  const blockedCases = [
    "حرمان",
  ];

  if (allowedCases.some((s) => normalized.includes(normalizeArabic(s)))) {
    return false;
  }

  if (blockedCases.some((s) => normalized.includes(normalizeArabic(s)))) {
    return true;
  }

  return false;
}

function getCourseStudentStatusKey(courseKey, studentId) {
  return `${String(courseKey || "").trim()}__${String(studentId || "").trim()}`;
}

function buildDeprivationMap(rows = []) {
  const map = new Map();

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const studentId = String(row["رقم المتدرب"] || "").trim();
    const registrationStatus = String(row["حالة تسجيل"] || "").trim();

    if (!studentId) return;
    if (!isDeprivationRegistrationStatus(registrationStatus)) return;

    const courseCode = String(row["المقرر"] || "").trim();
    const courseName = String(row["اسم المقرر"] || "").trim();

    const possibleKeys = [
      [normalizeArabic(courseCode), normalizeArabic(courseName)].join("|"),
      normalizeArabic(courseCode),
      normalizeArabic(courseName),
    ].filter(Boolean);

    possibleKeys.forEach((courseKey) => {
      map.set(getCourseStudentStatusKey(courseKey, studentId), registrationStatus);
    });
  });

  return map;
}

function buildScheduledLookup(schedule = []) {
  const map = new Map();

  (Array.isArray(schedule) ? schedule : []).forEach((item) => {
    const courseCode = String(item.courseCode || "").trim();
    const courseName = String(item.courseName || "").trim();

    const keys = [
      [normalizeArabic(courseCode), normalizeArabic(courseName)].join("|"),
      normalizeArabic(courseCode),
      normalizeArabic(courseName),
    ].filter(Boolean);

    keys.forEach((key) => {
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key).push(item);
    });
  });

  return map;
}

function findScheduledItemForStudent(scheduleLookup, row, studentId) {
  const courseCode = String(row["المقرر"] || "").trim();
  const courseName = String(row["اسم المقرر"] || "").trim();

  const keys = [
    [normalizeArabic(courseCode), normalizeArabic(courseName)].join("|"),
    normalizeArabic(courseCode),
    normalizeArabic(courseName),
  ].filter(Boolean);

  for (const key of keys) {
    const candidates = scheduleLookup.get(key) || [];
    if (!candidates.length) continue;

    const normalizedStudentId = String(studentId || "").trim();

    const exact = candidates.find((item) =>
      Array.isArray(item.students) &&
      item.students.map((x) => String(x).trim()).includes(normalizedStudentId)
    );

    if (exact) return exact;
  }

  return null;
}

function getStudentDisplayInfo(studentId, row, studentInfoMap) {
  const fallback = {
    id: String(studentId || "").trim(),
    name: String(row["إسم المتدرب"] || row["اسم المتدرب"] || "").trim(),
    department: String(row["القسم"] || "").trim(),
    major: String(row["التخصص"] || "").trim(),
  };

  if (!(studentInfoMap instanceof Map)) return fallback;

  const info =
    studentInfoMap.get(String(studentId || "").trim()) ||
    studentInfoMap.get(Number(studentId)) ||
    fallback;

  return {
    id: String(info?.id || fallback.id).trim(),
    name: String(info?.name || fallback.name).trim(),
    department: String(info?.department || fallback.department).trim(),
    major: String(info?.major || fallback.major).trim(),
  };
}
function dedupeStudentSchedule(schedule = []) {
  const map = new Map();

  schedule.forEach((item) => {
    const key = [
      normalizeArabic(item.courseCode),
      normalizeArabic(item.courseName),
      String(item.dateISO || ""),
      String(item.period || ""),
      String(item.timeText || ""),
      normalizeArabic(item.examHall),
    ].join("__");

    const existing = map.get(key);

    if (!existing) {
      map.set(key, item);
      return;
    }

    if (!existing.isDeprived && item.isDeprived) {
      map.set(key, item);
    }
  });

  return Array.from(map.values());
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

  const deprivationMap = buildDeprivationMap(filteredRows);
  const scheduledLookup = buildScheduledLookup(schedule);

  filteredRows.forEach((row) => {
    const studentId = String(row["رقم المتدرب"] || "").trim();
    if (!studentId) return;

    const courseCode = String(row["المقرر"] || "").trim();
    const courseName = String(row["اسم المقرر"] || "").trim();
    if (!courseCode && !courseName) return;

    const registrationStatus = String(row["حالة تسجيل"] || "").trim();

    const studentInfo = getStudentDisplayInfo(studentId, row, effectiveStudentInfoMap);

    if (!studentMap.has(studentId)) {
      studentMap.set(studentId, {
        id: studentInfo.id,
        name: studentInfo.name,
        department: studentInfo.department,
        major: studentInfo.major,
        schedule: [],
      });
    }

 const scheduledItem = findScheduledItemForStudent(scheduledLookup, row, studentId);

const compoundCourseKey = [normalizeArabic(courseCode), normalizeArabic(courseName)].join("|");
const deprivationStatus = String(
  deprivationMap.get(getCourseStudentStatusKey(compoundCourseKey, studentId)) ||
    deprivationMap.get(getCourseStudentStatusKey(normalizeArabic(courseCode), studentId)) ||
    deprivationMap.get(getCourseStudentStatusKey(normalizeArabic(courseName), studentId)) ||
    (isDeprivationRegistrationStatus(registrationStatus) ? registrationStatus : "")
).trim();

const shouldIncludeRow = Boolean(scheduledItem) || Boolean(deprivationStatus);
if (!shouldIncludeRow) return;

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
  deprivationStatus,
  isDeprived: Boolean(deprivationStatus),
  hasScheduledSlot: Boolean(scheduledItem),
});
  });

  const students = Array.from(studentMap.values())
    .map((student) => ({
      ...student,
schedule: sortStudentSchedule(
  dedupeStudentSchedule(student.schedule || [])
),    }))
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
  return blob;
}
