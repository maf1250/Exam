# Exam Scheduler Cleanup Kit

هذه حزمة تنظيف هيكلية للمشروع، هدفها فصل الملف المتضخم إلى وحدات واضحة.

## ماذا تم تنظيفه
- نقل الثوابت والألوان والأيام المطلوبة إلى `src/utils/constants.js`
- نقل المساعدات العامة إلى `src/utils/helpers.js`
- نقل التخزين المحلي و IndexedDB إلى `src/utils/storage.js`
- نقل منطق الطباعة إلى `src/utils/print.js`
- إنشاء hook للحفظ التلقائي مع debounce في `src/hooks/usePersistedSession.js`
- إنشاء مكونات UI صغيرة: `Card`, `SectionHeader`, `StepButton`, `Toast`
- إنشاء نسخة أخف من `AdminPage.jsx` توضح طريقة التقسيم

## مهم
هذه الحزمة **ليست استبدالًا كاملًا 1:1** لكل منطق الجدولة الحالي، لكنها تنظف البنية وتزيل أكبر مسببات المشاكل:
- تضخم ملف واحد
- تكرار helpers داخل الصفحة
- الحفظ المستمر بدون debounce
- تداخل منطق الطباعة والتخزين والواجهة

## طريقة الدمج
1. انسخ الملفات إلى مشروعك.
2. استبدل ملف `AdminPage.jsx` الحالي تدريجيًا بالنسخة النظيفة.
3. انقل منطق `parsed`, `schedule generation`, `invigilator allocation`, و `conflict analysis`
   إلى ملفات مستقلة لاحقًا:
   - `src/utils/parser.js`
   - `src/utils/scheduler.js`
   - `src/utils/conflicts.js`

## اقتراح عملي
ابدأ أولًا بهذا الترتيب:
1. constants
2. helpers
3. storage
4. print
5. hook الحفظ
6. UI components
7. تقسيم Step 1..Step N لاحقًا
