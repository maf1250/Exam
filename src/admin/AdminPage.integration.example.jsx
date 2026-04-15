import React from "react";
import { useParsedExamData } from "../hooks/useParsedExamData";

export default function AdminPageExample({
  rows,
  excludeInactive,
  includeAllDepartmentsAndMajors,
  excludedDepartmentMajors,
  excludedCourses,
}) {
  const parsed = useParsedExamData({
    rows,
    excludeInactive,
    includeAllDepartmentsAndMajors,
    excludedDepartmentMajors,
    excludedCourses,
  });

  if (parsed.missingColumns.length) {
    return (
      <div dir="rtl">
        الأعمدة الناقصة:
        <ul>
          {parsed.missingColumns.map((col) => (
            <li key={col}>{col}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div dir="rtl">
      <h3>ملخص التحليل</h3>
      <p>عدد الصفوف الفعالة: {parsed.filteredRows.length}</p>
      <p>عدد المتدربين: {parsed.studentsCount}</p>
      <p>عدد المقررات: {parsed.courses.length}</p>
      <p>عدد المراقبين: {parsed.invigilators.length}</p>

      <hr />

      <h4>أعلى 10 مقررات حسب الأولوية</h4>
      <ul>
        {parsed.courses.slice(0, 10).map((course) => (
          <li key={course.key}>
            {course.courseName} - {course.courseCode} |
            الطلاب: {course.studentCount} |
            التعارضات: {course.conflictCount} |
            الدرجة: {course.priorityScore}
          </li>
        ))}
      </ul>
    </div>
  );
}
