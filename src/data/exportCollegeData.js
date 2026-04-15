function normalizeArabic(value) {
  return String(value ?? "")
    .trim()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/أ|إ|آ/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ");
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

  const filteredSchedule = (Array.isArray(schedule) ? schedule : []).filter((item) => {
    const depOk =
      selectedDepartment === "__all__" ||
      normalizeArabic(item.department || "").includes(normalizeArabic(selectedDepartment));

    const majorOk =
      selectedMajor === "__all__" ||
      normalizeArabic(item.major || "").includes(normalizeArabic(selectedMajor));

    return depOk && majorOk;
  });

  filteredSchedule.forEach((item) => {
    const students = Array.isArray(item.students) ? item.students : [];

    students.forEach((studentId) => {
      const key = String(studentId ?? "").trim();
      if (!key) return;

      const info = effectiveStudentInfoMap.get(key) || {
        id: key,
        name: "",
        department: item.department || "",
        major: item.major || "",
      };

      if (!studentMap.has(key)) {
        studentMap.set(key, {
          id: info.id || key,
          name: info.name || "",
          department: info.department || item.department || "",
          major: info.major || item.major || "",
          schedule: [],
        });
      }

      studentMap.get(key).schedule.push({
        courseName: item.courseName || "",
        courseCode: item.courseCode || "",
        dayName: item.dayName || "",
        gregorian: item.gregorian || "",
        hijriNumeric: item.hijriNumeric || "",
        period: item.period || "",
        timeText: item.timeText || "",
        examHall: item.examHall || "",
      });
    });
  });

  const output = {
    slug,
    collegeName,
    students: Array.from(studentMap.values()).filter(
      (student) => Array.isArray(student.schedule) && student.schedule.length > 0
    ),
  };

  const blob = new Blob([JSON.stringify(output, null, 2)], {
    type: "application/json;charset=utf-8",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
