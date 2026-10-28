# Wasel — Social starter

واجهة عربية تجريبية للتواصل الاجتماعي باستخدام GitHub Pages + Supabase.

## الميزات التجريبية
- دخول تلقائي عبر Supabase Anonymous Auth.
- ملفات تعريف بأسماء زوار افتراضية.
- منشورات نصية وصور حتى 5MB.
- رسائل خاصة فورية بشكل أساسي.

## إعداد Supabase
1. أنشئ مشروعًا في https://supabase.com/
2. فعّل Anonymous Sign-Ins من إعدادات Authentication.
3. افتح SQL Editor والصق محتويات schema.sql ثم نفّذها.
4. من Project Settings > API انسخ Project URL ومفتاح anon/publishable فقط.
5. في app.js استبدل YOUR_SUPABASE_PROJECT_URL وYOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY.
6. لا تضع service_role أو secret key في ملفات المتصفح أو GitHub.

## النشر عبر GitHub Pages
من Settings > Pages اختر Deploy from a branch ثم main و /(root) واحفظ.
الرابط المتوقع: https://seifjaballah77-eng.github.io/wasel-social/

## حدود مهمة
هذه نسخة MVP تعليمية وليست جاهزة للإطلاق العام. يجب اختبار سياسات RLS والأمان، وإضافة CAPTCHA وتحديد معدل ومراجعة المحتوى قبل فتحها للجمهور. لا توجد مكالمات صوت/فيديو في هذه النسخة المبسطة. لا تشارك بيانات شخصية حساسة.
