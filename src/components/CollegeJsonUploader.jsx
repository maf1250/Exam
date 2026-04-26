import React, { useState } from "react";
import { supabase } from "../lib/supabaseClient";

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

function normalizeSlug(value = "") {
  return String(value)
    .replace(/\.json$/i, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function normalizeSlugFromFileName(fileName = "") {
  return normalizeSlug(fileName);
}

function isValidSlug(slug = "") {
  // مثال: BDCTM / QSCTF / AHHIM3
  return /^[A-Z0-9]{4,10}$/.test(slug);
}

function validateCollegeJson(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("الملف غير صالح.");
  }

  if (!Array.isArray(parsed.students)) {
    throw new Error("الملف غير مطابق لبيانات بوابة المتدربين.");
  }

  if (!parsed.slug && !parsed.collegeName) {
    throw new Error("الملف لا يحتوي على بيانات وحدة تدريبية صحيحة.");
  }
}

export default function CollegeJsonUploader() {
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setStatus("");

      if (file.size > MAX_FILE_SIZE_BYTES) {
        throw new Error("حجم الملف كبير جدًا.");
      }

      if (!/\.json$/i.test(file.name)) {
        throw new Error(
          "يجب أن يكون الملف بصيغة صحيحة؛ نأمل التأكد من تصدير بيانات المتدربين بعد الانتهاء من الجدولة."
        );
      }

      const text = await file.text();

      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("الملف غير صالح.");
      }

      validateCollegeJson(parsed);

      const slugFromData = normalizeSlug(parsed?.slug);
      const fileSlug = normalizeSlugFromFileName(file.name);
      const finalSlug = slugFromData || fileSlug;

      if (!finalSlug || !isValidSlug(finalSlug)) {
        throw new Error("تعذر تحديد رمز الوحدة من الملف، أو أن اسم الملف غير صالح.");
      }

      const normalizedJson = JSON.stringify(
        {
          ...parsed,
          slug: finalSlug,
        },
        null,
        2
      );

      const { error } = await supabase.storage
        .from("colleges")
        .upload(
          `${finalSlug}.json`,
          new Blob([normalizedJson], { type: "application/json" }),
          {
            contentType: "application/json",
            upsert: true,
          }
        );

      if (error) throw error;

      setStatus(
        `تم رفع بيانات المتدربين بنجاح على الرابط: https://exam-tvtc.onrender.com/#/${finalSlug}`
      );

      event.target.value = "";
    } catch (err) {
      setStatus(err.message || "حدث خطأ أثناء الرفع.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <input type="file" onChange={handleFileChange} disabled={uploading} />
      {status ? <div>{status}</div> : null}
    </div>
  );
}
