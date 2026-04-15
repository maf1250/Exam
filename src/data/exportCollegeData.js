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
  selectedDepartment = "__all__",
  selectedMajor = "__all__",
}) {
  const filtered = schedule.filter((item) => {
    const depOk =
      selectedDepartment === "__all__" ||
      normalizeArabic(item.department || "").includes(normalizeArabic(selectedDepartment));

    const majorOk =
      selectedMajor === "__all__" ||
      normalizeArabic(item.major || "").includes(normalizeArabic(selectedMajor));

    return depOk && majorOk;
  });

  const map = new Map();

  filtered.forEach((item) => {
    const studentId = String(item.studentId || item["رقم المتدرب"] || "").trim();
    const studentName = String(item.studentName || item["اسم المتدرب"] || "").trim();

    if (!studentId && !studentName) return;

    const key = studentId || studentName;

    if (!map.has(key)) {
      map.set(key, {
        id: studentId,
        name: studentName,
        department: item.department || "",
        major: item.major || "",
        schedule: [],
      });
    }

    map.get(key).schedule.push({
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

  const output = {
    slug,
    collegeName,
    students: Array.from(map.values()),
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
