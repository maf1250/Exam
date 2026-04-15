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
  selectedDepartment = "__all__",
  selectedMajor = "__all__",
}) {
  const studentMap = new Map();

  const filteredSchedule = schedule.filter((item) => {
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
      const info = parsed.studentInfoMap?.get(studentId);

      if (!info) return;

      if (!studentMap.has(studentId)) {
        studentMap.set(studentId, {
          id: studentId,
          name: info.name || "",
          department: info.department || "",
          major: info.major || "",
          schedule: [],
        });
      }

      studentMap.get(studentId).schedule.push({
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
      (student) => student.schedule.length > 0
    ),
  };

  const blob = new Blob([JSON.stringify(output, null, 2)], {
    type: "application/json;charset=utf-8",
  });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${slug}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
