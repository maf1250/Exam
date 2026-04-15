import React, { useCallback, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import Card from "../components/Card";
import Toast from "../components/Toast";
import StepButton from "../components/StepButton";
import SectionHeader from "../components/SectionHeader";
import {
  COLORS,
  DAY_OPTIONS,
} from "../utils/constants";
import {
  buildSlots,
  cardButtonStyle,
  downloadFile,
  fieldStyle,
  hasMeaningfulSessionData,
  parsePeriodsText,
  serializeScheduleItem,
  deserializeScheduleItem,
  toggleDay,
} from "../utils/helpers";
import {
  clearSavedStateFromStorage,
  persistSessionToStorage,
  loadSavedSessionFromStorage,
} from "../utils/storage";

/**
 * هذه النسخة أخف من الملف الأصلي.
 * المنطق الثقيل مثل:
 * - parsed
 * - conflict map
 * - invigilator allocation
 * - schedule generation
 * يجب نقله لاحقًا لملفات مستقلة.
 */
export default function AdminPage() {
  const fileRef = useRef(null);
  const toastTimerRef = useRef(null);

  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [toast, setToast] = useState(null);
  const [currentStep, setCurrentStep] = useState(1);

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });

  const [numberOfDays, setNumberOfDays] = useState(8);
  const [selectedDays, setSelectedDays] = useState(["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"]);
  const [periodsText, setPeriodsText] = useState("07:45-09:00\n09:15-11:00");
  const [schedule, setSchedule] = useState([]);
  const [storageMode, setStorageMode] = useState("localStorage");
  const [didRestore, setDidRestore] = useState(false);

  const parsedPeriods = useMemo(() => parsePeriodsText(periodsText), [periodsText]);
  const slots = useMemo(
    () => buildSlots({ startDate, numberOfDays, selectedDays, parsedPeriods }),
    [startDate, numberOfDays, selectedDays, parsedPeriods]
  );

  const showToast = useCallback((title, description, type = "success", options = {}) => {
    const nextToast = { title, description, type, ...options };
    setToast(nextToast);

    const duration =
      options.persistent || options.action === "restore_session"
        ? null
        : type === "error"
        ? 7000
        : type === "warning"
        ? 6000
        : 4000;

    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }

    if (duration) {
      toastTimerRef.current = window.setTimeout(() => setToast(null), duration);
    }
  }, []);

  const buildPersistedState = useCallback(() => ({
    rows,
    fileName,
    currentStep,
    startDate,
    numberOfDays,
    selectedDays,
    periodsText,
    schedule: schedule.map(serializeScheduleItem),
  }), [rows, fileName, currentStep, startDate, numberOfDays, selectedDays, periodsText, schedule]);

  const restorePersistedState = useCallback((saved) => {
    setRows(saved.rows || []);
    setFileName(saved.fileName || "");
    setCurrentStep(saved.currentStep || 1);
    setStartDate(saved.startDate || "");
    setNumberOfDays(saved.numberOfDays || 8);
    setSelectedDays(saved.selectedDays || ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"]);
    setPeriodsText(saved.periodsText || "07:45-09:00\n09:15-11:00");
    setSchedule((saved.schedule || []).map(deserializeScheduleItem));
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function loadSaved() {
      try {
        const { mode, saved } = await loadSavedSessionFromStorage();
        if (cancelled) return;

        setStorageMode(mode);

        if (!saved || !hasMeaningfulSessionData(saved)) {
          setDidRestore(true);
          return;
        }

        restorePersistedState(saved);
        setDidRestore(true);
        showToast("تم الاسترجاع", "تم استرجاع آخر جلسة محفوظة.", "success");
      } catch (error) {
        console.error(error);
        setDidRestore(true);
      }
    }

    loadSaved();
    return () => {
      cancelled = true;
    };
  }, [restorePersistedState, showToast]);

  React.useEffect(() => {
    if (!didRestore) return;

    const timer = window.setTimeout(async () => {
      try {
        const data = buildPersistedState();

        if (!hasMeaningfulSessionData(data)) {
          await clearSavedStateFromStorage();
          setStorageMode("localStorage");
          return;
        }

        const mode = await persistSessionToStorage(data);
        setStorageMode(mode);
      } catch (error) {
        console.error("Failed to persist session:", error);
      }
    }, 700);

    return () => window.clearTimeout(timer);
  }, [didRestore, buildPersistedState]);

  const handleUpload = useCallback((file) => {
    if (!file) return;

    setFileName(file.name);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: "UTF-8",
      complete: (result) => {
        const cleanRows = (result.data || []).filter((row) =>
          Object.values(row).some((v) => String(v ?? "").trim() !== "")
        );

        setRows(cleanRows);
        setSchedule([]);
        setCurrentStep(1);

        showToast("تم رفع الملف", `تم تحليل الملف ${file.name} بنجاح.`, "success");
      },
      error: (err) => {
        showToast("تعذر قراءة الملف", err.message || "تحقق من صحة ملف CSV.", "error");
      },
    });
  }, [showToast]);

  const exportSavedSession = useCallback(() => {
    const data = buildPersistedState();
    downloadFile(
      `exam-session-${(fileName || "technical-college").replace(/\.[^.]+$/, "")}.json`,
      JSON.stringify(data, null, 2),
      "application/json;charset=utf-8"
    );
    showToast("تم التصدير", "تم تنزيل ملف الجلسة بنجاح.", "success");
  }, [buildPersistedState, fileName, showToast]);

  return (
    <div dir="rtl" style={{ padding: 20, background: COLORS.bg2, minHeight: "100vh" }}>
      <Toast item={toast} onClose={() => setToast(null)} />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <StepButton active={currentStep === 1} onClick={() => setCurrentStep(1)}>1. رفع الملف</StepButton>
        <StepButton active={currentStep === 2} onClick={() => setCurrentStep(2)}>2. الفترات</StepButton>
        <StepButton active={currentStep === 3} onClick={() => setCurrentStep(3)}>3. المعاينة</StepButton>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <SectionHeader
          title="نسخة إدارية أنظف"
          description="تم فصل التخزين والمساعدات والمكونات الأساسية. ما بقي هو نقل منطق الجدولة والتعارضات والمراقبين إلى ملفات مستقلة."
        />
        <div style={{ color: COLORS.charcoalSoft, lineHeight: 1.9 }}>
          وضع التخزين الحالي: <strong>{storageMode}</strong>
          <br />
          عدد الصفوف: <strong>{rows.length}</strong>
          <br />
          عدد الفترات المتولدة: <strong>{slots.length}</strong>
        </div>
      </Card>

      {currentStep === 1 && (
        <Card style={{ marginBottom: 16 }}>
          <SectionHeader title="رفع ملف CSV" />
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            onChange={(e) => handleUpload(e.target.files?.[0])}
            style={fieldStyle()}
          />
          {fileName ? (
            <div style={{ marginTop: 12, color: COLORS.charcoalSoft }}>
              الملف الحالي: <strong>{fileName}</strong>
            </div>
          ) : null}
        </Card>
      )}

      {currentStep === 2 && (
        <Card style={{ marginBottom: 16 }}>
          <SectionHeader title="إعداد الفترات" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
            <div>
              <div style={{ marginBottom: 8, fontWeight: 800 }}>تاريخ البداية</div>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={fieldStyle()} />
            </div>
            <div>
              <div style={{ marginBottom: 8, fontWeight: 800 }}>عدد الأيام</div>
              <input
                type="number"
                min="1"
                value={numberOfDays}
                onChange={(e) => setNumberOfDays(Number(e.target.value) || 1)}
                style={fieldStyle()}
              />
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ marginBottom: 8, fontWeight: 800 }}>الأيام المختارة</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {DAY_OPTIONS.map((day) => (
                <button
                  key={day}
                  onClick={() => setSelectedDays((prev) => toggleDay(prev, day))}
                  style={cardButtonStyle({ active: selectedDays.includes(day) })}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ marginBottom: 8, fontWeight: 800 }}>الفترات</div>
            <textarea
              value={periodsText}
              onChange={(e) => setPeriodsText(e.target.value)}
              rows={5}
              style={{ ...fieldStyle(), resize: "vertical" }}
            />
          </div>
        </Card>
      )}

      {currentStep === 3 && (
        <Card>
          <SectionHeader title="المعاينة" />
          <div style={{ color: COLORS.charcoalSoft, lineHeight: 1.9 }}>
            هنا تنقل لاحقًا:
            <ul>
              <li>منطق parsed</li>
              <li>تحليل التعارضات</li>
              <li>توزيع المراقبين</li>
              <li>توليد الجدول النهائي</li>
            </ul>
            لكن البنية الآن صارت أخف وأسهل للصيانة.
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <button onClick={exportSavedSession} style={cardButtonStyle({ active: true })}>
              تصدير الجلسة
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
