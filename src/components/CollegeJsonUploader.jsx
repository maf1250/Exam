import React, { useState } from "react";
import { supabase } from "../lib/supabaseClient";

function normalizeSlugFromFileName(fileName = "") {
  return fileName.replace(/\.json$/i, "").trim().toUpperCase();
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

      if (!/\.json$/i.test(file.name)) {
        throw new Error("يجب أن يكون الملف بصيغة صحيحة؛ نأمل التأكد من تحميل تصدير بيانات المتدربين بعد الانتهاء من الجدولة.");
      }

      const text = await file.text();

      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("ملف غير صالح.");
      }

      const slugFromData = String(parsed?.slug || "").trim().toUpperCase();
      const fileSlug = normalizeSlugFromFileName(file.name);
      const finalSlug = slugFromData || fileSlug;

      if (!finalSlug) {
        throw new Error("تعذر تحديد الاسم من الملف.");
      }

      const normalizedJson = JSON.stringify(
        { ...parsed, slug: finalSlug },
        null,
        2
      );

      const { error } = await supabase.storage
        .from("colleges")
        .upload(`${finalSlug}.json`, new Blob([normalizedJson], { type: "application/json" }), {
          contentType: "application/json",
          upsert: true,
        });

      if (error) throw error;

      setStatus(`تم رفع بيانات المتدربين بنجاح: ${finalSlug}`);
      event.target.value = "";
    } catch (err) {
      setStatus(err.message || "حدث خطأ أثناء الرفع.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ fontWeight: 800 }}>  رفع بيانات المتدربين إلى البوابة</div>
      <input
        type="file"
        accept=".json,application/json"
        onChange={handleFileChange}
        disabled={uploading}
      />
      {status ? <div>{status}</div> : null}
    </div>
  );
}
