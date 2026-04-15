import { useMemo } from "react";
import { buildBaseParsedState } from "../utils/parser";
import { buildConflictData, attachConflictMetadata } from "../utils/conflicts";

export function useParsedExamData({
  rows,
  excludeInactive,
  includeAllDepartmentsAndMajors,
  excludedDepartmentMajors,
  excludedCourses,
}) {
  return useMemo(() => {
    const base = buildBaseParsedState({
      rows,
      excludeInactive,
      includeAllDepartmentsAndMajors,
      excludedDepartmentMajors,
      excludedCourses,
    });

    if (base.missingColumns.length || !rows?.length) {
      return {
        ...base,
        conflictMap: new Map(),
        conflictDetailsMap: new Map(),
      };
    }

    const { conflictMap, conflictDetailsMap } = buildConflictData(
      base.studentCourseMap,
      excludedCourses
    );

    const courses = attachConflictMetadata(
      base.courses,
      conflictMap,
      conflictDetailsMap
    );

    return {
      ...base,
      courses,
      conflictMap,
      conflictDetailsMap,
    };
  }, [
    rows,
    excludeInactive,
    includeAllDepartmentsAndMajors,
    excludedDepartmentMajors,
    excludedCourses,
  ]);
}
