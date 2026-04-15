import {
  REQUIRED_COLUMNS,
  EXCLUDED_REGISTRATION,
  EXCLUDED_TRAINEE,
} from "./constants";
import { normalizeArabic, splitBySlash } from "./helpers";

export function validateRequiredColumns(rows) {
  if (!rows?.length) return [];
  return REQUIRED_COLUMNS.filter((column) => !(column in (rows[0] || {})));
}

export function filterActiveRows(rows, excludeInactive = true) {
  if (!excludeInactive) return rows;

  return rows.filter((row) => {
    const regStatus = normalizeArabic(row["حالة تسجيل"]);
    const traineeStatus = normalizeArabic(row["حالة المتدرب"]);

    const badReg = EXCLUDED_REGISTRATION.some((item) =>
      regStatus.includes(normalizeArabic(item))
    );
    const badTrainee = EXCLUDED_TRAINEE.some((item) =>
      traineeStatus.includes(normalizeArabic(item))
    );

    return !badReg && !badTrainee;
  });
}

export function filterRowsByDepartmentMajor(
  rows,
  includeAllDepartmentsAndMajors = true,
  excludedDepartmentMajors = []
) {
  if (includeAllDepartmentsAndMajors) return rows;

  return rows.filter((row) => {
    const departments = splitBySlash(String(row["القسم"] ?? "").trim() || "-");
    const majors = splitBySlash(String(row["التخصص"] ?? "").trim() || "-");

    for (const dep of departments) {
      for (const maj of majors) {
        const pairKey = `${normalizeArabic(dep || "-")}|${normalizeArabic(maj || "-")}`;
        if (excludedDepartmentMajors.includes(pairKey)) {
          return false;
        }
      }
    }

    return true;
  });
}

export function buildParsedCourseData(rowsAfterFilters) {
  const courseMap = new Map();
  const studentSet = new Set();
  const studentCourseMap = new Map();
  const studentDepartmentMap = new Map();
  const invigilatorSet = new Set();
  const sectionSet = new Set();

  rowsAfterFilters.forEach((row) => {
    const courseCode = String(row["المقرر"] ?? "").trim();
    const courseName = String(row["اسم المقرر"] ?? "").trim();
    const trainer = String(row["المدرب"] ?? "").trim();
    const studentId = String(row["رقم المتدرب"] ?? "").trim();
    const department = String(row["القسم"] ?? "").trim();
    const major = String(row["التخصص"] ?? "").trim();
    const scheduleType = String(row["نوع الجدولة"] ?? "").trim();
    const sectionName = `${department || "-"} / ${major || "-"}`;

    if (!courseCode && !courseName) return;

    if (studentId && department) {
      const dept = normalizeArabic(department);
      if (!studentDepartmentMap.has(studentId)) {
        studentDepartmentMap.set(studentId, new Set());
      }
      studentDepartmentMap.get(studentId).add(dept);
    }

    const key = [normalizeArabic(courseCode), normalizeArabic(courseName)].join("|");

    if (trainer) invigilatorSet.add(trainer);
    if (studentId) studentSet.add(studentId);
    if (sectionName !== "- / -") sectionSet.add(sectionName);

    if (!courseMap.has(key)) {
      courseMap.set(key, {
        key,
        courseCode,
        courseName,
        trainers: new Set(),
        departments: new Set(),
        majors: new Set(),
        sectionNames: new Set(),
        scheduleTypes: new Set(),
        students: new Set(),
        departmentRoots: new Set(),
      });
    }

    const course = courseMap.get(key);

    if (trainer) course.trainers.add(trainer);
    if (department) course.departments.add(department);
    if (major) course.majors.add(major);
    if (sectionName !== "- / -") course.sectionNames.add(sectionName);
    if (scheduleType) course.scheduleTypes.add(scheduleType);

    splitBySlash(department).forEach((value) => {
      const clean = normalizeArabic(value);
      if (clean && clean !== normalizeArabic("الدراسات العامة")) {
        course.departmentRoots.add(clean);
      }
    });

    splitBySlash(major).forEach((value) => {
      const clean = normalizeArabic(value);
      if (clean) course.departmentRoots.add(clean);
    });

    splitBySlash(sectionName).forEach((value) => {
      const clean = normalizeArabic(value);
      if (clean && clean !== normalizeArabic("-")) {
        course.departmentRoots.add(clean);
      }
    });

    if (studentId) {
      course.students.add(studentId);
      if (!studentCourseMap.has(studentId)) {
        studentCourseMap.set(studentId, new Set());
      }
      studentCourseMap.get(studentId).add(key);
    }
  });

  courseMap.forEach((course) => {
    course.students.forEach((studentId) => {
      const studentDepts = studentDepartmentMap.get(studentId) || new Set();
      studentDepts.forEach((d) => course.departmentRoots.add(d));
    });
  });

  return {
    courseMap,
    studentSet,
    studentCourseMap,
    studentDepartmentMap,
    invigilatorSet,
    sectionSet,
  };
}

export function materializeCourses(courseMap, excludedCourses = []) {
  return Array.from(courseMap.values())
    .filter((course) => !excludedCourses.includes(course.key))
    .map((course) => ({
      ...course,
      trainers: Array.from(course.trainers),
      departments: Array.from(course.departments),
      majors: Array.from(course.majors),
      sectionNames: Array.from(course.sectionNames),
      scheduleTypes: Array.from(course.scheduleTypes),
      students: Array.from(course.students),
      departmentRoots: Array.from(course.departmentRoots),
      studentCount: course.students.size,
    }))
    .sort((a, b) => {
      const countDiff = b.studentCount - a.studentCount;
      if (countDiff !== 0) return countDiff;
      return `${a.courseName} ${a.courseCode}`.localeCompare(
        `${b.courseName} ${b.courseCode}`,
        "ar"
      );
    });
}

export function buildBaseParsedState({
  rows,
  excludeInactive,
  includeAllDepartmentsAndMajors,
  excludedDepartmentMajors,
  excludedCourses,
}) {
  if (!rows?.length) {
    return {
      missingColumns: [],
      filteredRows: [],
      rowsAfterDepartmentMajorFilter: [],
      collegeName: "",
      courses: [],
      studentsCount: 0,
      invigilators: [],
      sections: [],
      courseMap: new Map(),
      studentCourseMap: new Map(),
      studentDepartmentMap: new Map(),
      invigilatorSet: new Set(),
      sectionSet: new Set(),
    };
  }

  const missingColumns = validateRequiredColumns(rows);

  if (missingColumns.length) {
    return {
      missingColumns,
      filteredRows: [],
      rowsAfterDepartmentMajorFilter: [],
      collegeName: "",
      courses: [],
      studentsCount: 0,
      invigilators: [],
      sections: [],
      courseMap: new Map(),
      studentCourseMap: new Map(),
      studentDepartmentMap: new Map(),
      invigilatorSet: new Set(),
      sectionSet: new Set(),
    };
  }

  const filteredRows = filterActiveRows(rows, excludeInactive);
  const rowsAfterDepartmentMajorFilter = filterRowsByDepartmentMajor(
    filteredRows,
    includeAllDepartmentsAndMajors,
    excludedDepartmentMajors
  );

  const {
    courseMap,
    studentSet,
    studentCourseMap,
    studentDepartmentMap,
    invigilatorSet,
    sectionSet,
  } = buildParsedCourseData(rowsAfterDepartmentMajorFilter);

  const courses = materializeCourses(courseMap, excludedCourses);

  return {
    missingColumns,
    filteredRows,
    rowsAfterDepartmentMajorFilter,
    collegeName: String(rowsAfterDepartmentMajorFilter[0]?.["الوحدة"] ?? rows[0]?.["الوحدة"] ?? "").trim(),
    courses,
    studentsCount: studentSet.size,
    invigilators: Array.from(invigilatorSet).sort((a, b) => a.localeCompare(b, "ar")),
    sections: Array.from(sectionSet).sort((a, b) => a.localeCompare(b, "ar")),
    courseMap,
    studentCourseMap,
    studentDepartmentMap,
    invigilatorSet,
    sectionSet,
  };
}
