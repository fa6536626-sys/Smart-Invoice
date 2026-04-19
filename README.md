# نظام استخراج البيانات الذكي - Smart Invoice Processor

نظام متقدم لاستخراج بيانات الفواتير والإيصالات باستخدام الذكاء الاصطناعي (Gemini AI)، مع دعم المزامنة السحابية (Supabase) وتصدير البيانات إلى Excel.

## المميزات (Features)
- **AI Extraction**: استخراج دقيق للبيانات من الصور وملفات PDF.
- **Cloud Sync**: مزامنة تلقائية مع Supabase لضمان حفظ البيانات.
- **Unlimited Processing**: معالجة عدد غير محدود من الملفات بنظام الدفعات (Batch Processing).
- **Auto Tax Calculation**: حساب تلقائي للضريبة (15%) للجهات الرئيسية (كهرباء، مياه، اتصالات، بوكينج).
- **Excel Export**: تصدير كافة البيانات المستخرجة إلى ملف Excel بضغطة زر.

## المتطلبات (Prerequisites)
- Node.js (v18+)
- مفتاح API لـ [Google Gemini](https://aistudio.google.com/app/apikey)
- مشروع [Supabase](https://supabase.com) (اختياري للمزامنة السحابية)

## التشغيل المحلي (Local Setup)

1. **تثبيت المكتبات**:
   ```bash
   npm install
   ```

2. **إعداد المتغيرات البيئية**:
   قم بإنشاء ملف `.env` في المجلد الرئيسي وأضف القيم التالية:
   ```env
   GEMINI_API_KEY=your_gemini_api_key
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

3. **تشغيل التطبيق**:
   ```bash
   npm run dev
   ```

## النشر (Deployment)
يمكن نشر هذا التطبيق بسهولة على منصات مثل **Vercel** أو **Netlify**. تأكد من إضافة المتغيرات البيئية (Environment Variables) في إعدادات المنصة.

---

## English Description
An advanced AI-powered system to extract data from invoices and receipts using Gemini AI, featuring cloud synchronization with Supabase and Excel export capabilities.

### Key Capabilities:
- High-precision OCR and data extraction.
- Real-time cloud sync.
- Batch processing for large volumes of documents.
- Automatic VAT calculation for major utility providers.
