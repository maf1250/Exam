# حزمة بوابة المتدرب

## الملفات الجديدة
- `src/App.jsx`
- `src/admin/AdminPage.jsx`
- `src/trainee/TraineePortalPage.jsx`
- `src/data/collegeRegistry.js`
- `src/data/exportCollegeData.js`

## أهم خطوة
خذ **ملف الإدارة الحالي الكبير** عندك والصقه داخل:
`src/admin/AdminPage.jsx`

ثم غيّر:
```jsx
export default function App() {
```
إلى:
```jsx
export default function AdminPage() {
```

وفي أعلى الملف أضف:
```jsx
import { exportCollegeDataFile } from "../data/exportCollegeData";
import { generateTraineeLink } from "../data/collegeRegistry";
```

## تثبيت الراوتر
```bash
npm install react-router-dom
```

## زر تصدير بيانات المتدربين
ضعه في الهيدر داخل ملف الإدارة:
```jsx
<button
  type="button"
  onClick={() =>
    exportCollegeDataFile({
      slug: "JDCTM",
      collegeName: "الكلية التقنية بجدة",
      schedule,
      selectedDepartment: "__all__",
      selectedMajor: "__all__",
    })
  }
>
  تصدير بيانات المتدربين
</button>
```

## زر نسخ رابط المتدربين
```jsx
<button
  type="button"
  onClick={() => {
    const link = generateTraineeLink("JDCTM");
    navigator.clipboard.writeText(link);
    alert("تم نسخ الرابط");
  }}
>
  نسخ رابط المتدربين
</button>
```

## أين تضع ملفات JSON؟
ضعها داخل:
`public/colleges/`

مثال:
- `public/colleges/JDCTM.json`
- `public/colleges/RDTTF.json`

## كيف يعمل المسار؟
الرابط:
`/trainee/JDCTM`

سيحمّل الملف:
`/colleges/JDCTM.json`
