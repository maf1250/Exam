export function buildConflictData(studentCourseMap, excludedCourses = []) {
  const excludedSet = new Set(excludedCourses);
  const activeCourseKeys = new Set();

  studentCourseMap.forEach((courseSet) => {
    Array.from(courseSet).forEach((key) => {
      if (!excludedSet.has(key)) {
        activeCourseKeys.add(key);
      }
    });
  });

  const conflictMap = new Map();
  const conflictDetailsMap = new Map();

  Array.from(activeCourseKeys).forEach((key) => {
    conflictMap.set(key, new Set());
    conflictDetailsMap.set(key, new Map());
  });

  studentCourseMap.forEach((courseSet) => {
    const list = Array.from(courseSet).filter((key) => !excludedSet.has(key));

    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];

        if (!conflictMap.has(a) || !conflictMap.has(b)) continue;

        conflictMap.get(a).add(b);
        conflictMap.get(b).add(a);

        const aDetails = conflictDetailsMap.get(a);
        const bDetails = conflictDetailsMap.get(b);

        aDetails.set(b, (aDetails.get(b) || 0) + 1);
        bDetails.set(a, (bDetails.get(a) || 0) + 1);
      }
    }
  });

  return {
    conflictMap,
    conflictDetailsMap,
  };
}

export function attachConflictMetadata(courses, conflictMap, conflictDetailsMap) {
  return courses.map((course) => {
    const conflictSet = conflictMap.get(course.key) || new Set();
    const detailsMap = conflictDetailsMap.get(course.key) || new Map();

    const conflictCount = conflictSet.size;
    const sharedStudentsCount = Array.from(detailsMap.values()).reduce((sum, n) => sum + n, 0);

    return {
      ...course,
      conflicts: Array.from(conflictSet),
      conflictCount,
      sharedStudentsCount,
      priorityScore: (course.studentCount || 0) + sharedStudentsCount + conflictCount,
    };
  }).sort((a, b) => {
    const byPriority = b.priorityScore - a.priorityScore;
    if (byPriority !== 0) return byPriority;

    const byStudents = b.studentCount - a.studentCount;
    if (byStudents !== 0) return byStudents;

    return `${a.courseName} ${a.courseCode}`.localeCompare(
      `${b.courseName} ${b.courseCode}`,
      "ar"
    );
  });
}
