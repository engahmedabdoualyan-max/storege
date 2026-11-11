# Storege WMS — نظام إدارة المخازن الاحترافي

نظام إدارة مخازن (WMS) عربي أولًا، احترافي، يعمل على الويب وعلى أجهزة الكف (Handheld) مع دعم كامل للباركود والعمل بدون إنترنت. مبني على **Node.js + React PWA + Prisma**، ويعمل فورًا على **SQLite** مع دعم **PostgreSQL** للإنتاج.

> A professional Arabic-first Warehouse Management System with barcode scanning, offline handheld mode, lot/serial tracking, multi-warehouse transfers, purchasing, sales, invoicing, reports and a REST API with webhooks.

---

## المحتويات

- [المميزات](#المميزات)
- [التقنيات](#التقنيات)
- [التشغيل السريع](#التشغيل-السريع)
- [بيانات الدخول التجريبية](#بيانات-الدخول-التجريبية)
- [جهاز الكف والوضع بدون إنترنت](#جهاز-الكف-والوضع-بدون-إنترنت)
- [بنية المشروع](#بنية-المشروع)
- [الأوامر المتاحة](#الأوامر-المتاحة)
- [الانتقال إلى PostgreSQL](#الانتقال-إلى-postgresql)
- [التشغيل بـ Docker](#التشغيل-بـ-docker)
- [واجهة REST API](#واجهة-rest-api)
- [الأدوار والصلاحيات](#الأدوار-والصلاحيات)
- [اختبار الدخان](#اختبار-الدخان)
- [النشر للإنتاج](#النشر-للإنتاج)
- [استكشاف الأخطاء](#استكشاف-الأخطاء)
- [English quick start](#english-quick-start)
- [الترخيص](#الترخيص)

---

## المميزات

| المجال | التفاصيل |
| --- | --- |
| **المخزون** | رصيد فوري لكل صنف/موقع/لوط/سيريال، تعديل يدوي مع سبب، نقل بين المواقع، سجل حركات كامل (Stock Ledger) |
| **المستودعات** | مستودعات متعددة، مناطق (Zones)، مواقع (PICK / DOCK / STAGING / SHIPPING / QUARANTINE)، سعات وباركود لكل موقع، **ترقيم الرف/العمود** (R01-C01) لتحديد physical location |
| **المشتريات** | موردون، أوامر شراء، استلام جزئي/كامل، إلغاء استلام بعكس الحركات، Putaway للمواقع |
| **المبيعات** | عملاء، أوامر بيع، تخصيص FEFO تلقائي، Pick → Pack → Ship، شحنات |
| **التحويلات** | تحويل بين المستودعات: مسودة → صرف (In Transit) → استلام مع تتبع أرقام اللوط/السيريال |
| **الجرد** | جرد دوري (Cycle Count) بالموقع/المنطقة/المستودع، إدخال كميات، فروقات، اعتماد يعدّل المخزون |
| **اللوط والصلاحية** | تواريخ إنتاج/انتهاء، تنبيهات انتهاء الصلاحية، منع صرف المنتهي (FEFO) |
| **السيريال** | تتبع أرقام تسلسلي كامل عند الاستلام والصرف |
| **الفواتير** | فواتير مبيعات/مشتريات، دفع، إلغاء، طباعة/تصدير CSV |
| **المخزون الاستراتيجي** | حد `strategicStock` لكل صنف، تحذيرات في لوحة التحكم وصفحة **إجمالي البضائع** عند النزول عن الحد |
| **إجمالي البضائع** | شاشة مجمّعة: الوحدات، الأصناف، قيمة المخزون، محجوز/متاح، توزيع حسب المخزن والتصنيف، تنبيهات استراتيجية |
| **العملة** | جميع الأسعار بالريال السعودي (SAR) افتراضيًا، ضريبة 15% |
| **اللوجو** | رفع شعار الشركة/المصنع في الإعدادات وعرضه في الشريط الجانبي ولوحة التحكم |
| **التقارير** | تقييم المخزون، مخزون منخفض، صلاحية، حركة المخزون، مخزون راكد، إنتاجية، أفضل الأصناف، تحليل ABC، دقة الجرد، **مطابقة فواتير الشراء بالمخزون** (quantities invoiced vs received vs on hand) |
| **الباركود** | ماسح بالكاميرا، ماسح USB (Keyboard Wedge)، مولّد باركود EAN-13/Code128، مصمم ملصقات وطباعة A4/حرارية |
| **جهاز الكف** | واجهة `/m` محسّنة للشاشات الصغيرة: استلام، Putaway، Pick، جرد — تعمل أوفلاين بالكامل |
| **الأوفلاين** | PWA + IndexedDB queue + إعادة إرسال تلقائية + منع التكرار عبر `X-Op-Id` |
| **الإدارة** | مستخدمون وأدوار، إعدادات الشركة والعملة والضريبة، سجل تدقيق، مفاتيح API، Webhooks |
| **اللغات** | 9 لغات: عربي RTL + إنجليزي + أردو RTL + هندي + بنغالي + ألماني + إيطالي + صيني + ياباني، أرقام وتواريخ محلية |

---

## التقنيات

- **الخادم:** Node.js 20+، Fastify 5، TypeScript، Prisma 6، JWT، Zod، bcrypt
- **الواجهة:** React 19، Vite 6، TypeScript، Tailwind CSS 3، TanStack Query، React Router 7، Recharts
- **PWA:** vite-plugin-pwa + Workbox (قشرة التطبيق تُخزَّن، وطلبات API دائمًا Online)
- **قواعد البيانات:** SQLite (افتراضي) / PostgreSQL 16
- **الباركود:** `@zxing/browser` للكاميرا، `jsbarcode` + `qrcode.react` للملصقات

---

## التشغيل السريع

### المتطلبات

- Node.js **20 أو أحدث** (مُختبر على 22)
- npm 10+
- لا تحتاج قاعدة بيانات لتشغيل SQLite

### الخطوات

```bash
git clone https://github.com/engahmedabdoualyan-max/storege.git
cd storege

# 1) تثبيت الحزم + توليد Prisma + إنشاء قاعدة البيانات + بيانات تجريبية
npm run setup

# 2) التشغيل في وضع التطوير (API + الواجهة معًا)
npm run dev
```

| الخدمة | الرابط |
| --- | --- |
| الواجهة | http://localhost:5173 |
| API | http://localhost:4000 |
| فحص الصحة | http://localhost:4000/api/health |
| جهاز الكف | http://localhost:5173/m |

> إن لم تكن نسخة `.env` موجودة، انسخ `server/.env.example` إلى `server/.env` ثم عدّل `JWT_SECRET` قبل النشر.

### تشغيل نسخة الإنتاج محليًا

```bash
npm run build     # يبني الواجهة + يتحقق من TypeScript للخادم
npm start         # خادم Fastify يقدّم API + ملفات الواجهة المبنية
```

ثم افتح http://localhost:4000 — الخادم يقدّم `web/dist` تلقائيًا إن وُجد.

---

## بيانات الدخول التجريبية

| الدور | البريد | كلمة المرور | الصلاحيات |
| --- | --- | --- | --- |
| مدير النظام | `admin@storege.app` | `Admin@12345` | كل شيء |
| مدير مخازن | `manager@storege.app` | `Manager@12345` | إدارة + كتابة + إعدادات |
| مشغّل | `operator@storege.app` | `Operator@12345` | عمليات المخزون والكتابة |
| مشاهد | `viewer@storege.app` | `Viewer@12345` | قراءة فقط |

> **مهم:** غيّر كلمات المرور و`JWT_SECRET` قبل أي استخدام حقيقي.

البيانات التجريبية تشمل: مستودعين، 23 موقعًا، 24 صنفًا، 112 رصيدًا، 303 حركة، أوامر شراء وبيع، فواتير، وجردين.

---

## جهاز الكف والوضع بدون إنترنت

1. سجّل الدخول من المتصفح على الهاتف/الجهاز اللوحي.
2. افتح `/m` أو أضف التطبيق إلى الشاشة الرئيسية (PWA).
3. بعد أول فتح وأنت متصل، يقوم التطبيق بتخزين بياناتك في IndexedDB:
   - الأصناف والمواقع والمستودعات
   - أوامر الشراء المفتوحة
   - مهام الالتقاط (Picking) و Putaway
   - تفاصيل الجرد المفتوح
4. عند انقطاع الشبكة تستمر عمليات **الاستلام، Putaway، الالتقاط، والجرد** وتُحفظ في طابور.
5. عند عودة الاتصال يُرسل الطابور تلقائيًا، ولكل عملية `X-Op-Id` فريد يمنع التكرار حتى لو أُعيد الإرسال.

**الماسحات:**
- ماسح USB/Bluetooth يعمل كلوحة مفاتيح: امسح ثم Enter.
- ماسح الكاميرا يعمل من زر الكاميرا داخل حقول المسح (يتطلب HTTPS أو localhost).

---

## بنية المشروع

```
storege/
├── server/                  # Fastify API + Prisma
│   ├── prisma/schema.prisma # نموذج البيانات الكامل
│   └── src/
│       ├── lib/             # auth, inventory, settings, webhooks, numbering…
│       ├── routes/          # كل نقاط API
│       ├── seed.ts          # بيانات تجريبية واقعية
│       └── index.ts         # نقطة التشغيل + تقديم الواجهة
├── web/                     # React PWA
│   └── src/
│       ├── components/      # Design system, Layout, Barcode, CameraScanner…
│       ├── lib/             # api, offline queue, auth, i18n, types
│       └── pages/           # 24 صفحة تشغيلية
├── scripts/
│   ├── use-postgres.mjs     # تبديل SQLite ↔ PostgreSQL
│   └── smoke.mjs            # اختبار API شامل
├── Dockerfile
├── docker-compose.yml
└── LICENSE
```

---

## الأوامر المتاحة

| الأمر | الوظيفة |
| --- | --- |
| `npm run setup` | تثبيت + توليد Prisma + إنشاء الجداول + Seed |
| `npm run dev` | API + Vite معًا (تطوير) |
| `npm run build` | فحص TypeScript + بناء الواجهة |
| `npm start` | تشغيل الخادم (يقدّم الواجهة المبنية) |
| `npm run db:push` | مزامنة المخطط مع قاعدة البيانات |
| `npm run db:seed` | إعادة تعبئة البيانات التجريبية (يمسح البيانات الحالية) |
| `npm run db:reset` | إعادة إنشاء القاعدة من الصفر + Seed |
| `npm run db:postgres` | التحويل إلى PostgreSQL |
| `npm run smoke` | اختبار شامل لواجهات API |
| `npm run smoke -- --write` | اختبار الكتابة وإعادة الإرسال (Idempotency) |
| `npm run db:generate -w server` | توليد Prisma Client |
| `npm run db:studio -w server` | Prisma Studio لتصفح البيانات |

---

## الانتقال إلى PostgreSQL

### محليًا

```bash
# 1) شغّل PostgreSQL (محلي أو Docker)
docker compose up -d db

# 2) حوّل المخطط والاتصال (يعدّل schema.prisma و server/.env)
npm run db:postgres
# أو: node scripts/use-postgres.mjs --url "postgresql://user:pass@host:5432/storege?schema=public"

# 3) أعد التوليد والمزامنة والبيانات التجريبية
npm run db:generate
npm run db:push
npm run db:seed

# للعودة إلى SQLite:
node scripts/use-postgres.mjs --sqlite && npm run db:generate && npm run db:push
```

> يُنشئ السكربت نسخة متوافقة من `schema.prisma` (يغيّر `provider` فقط)، فلا حاجة لصيانة ملفين.

---

## التشغيل بـ Docker

```bash
# PostgreSQL + التطبيق مع بيانات تجريبية
docker compose up -d --build

# المتابعة
docker compose logs -f app
```

- التطبيق: http://localhost:4000
- PostgreSQL: `localhost:5432` (المستخدم/كلمة المرور/القاعدة: `storege`)
- يُشغّل الـ entrypoint تلقائيًا: تبديل المزود، `prisma generate`، `prisma db push`، ثم Seed **فقط إذا كانت قاعدة البيانات فارغة** (لن يمسح بياناتك عند إعادة التشغيل).

**قبل الإنتاج:** غيّر `JWT_SECRET` وكلمة مرور PostgreSQL في `docker-compose.yml`، واضبط `SEED_DB=false` إن لم ترغب في أي تعبئة تجريبية.

---

## واجهة REST API

جميع المسارات تحت `/api`. المصادقة عبر `Authorization: Bearer <JWT>` أو مفتاح API عبر `X-API-Key`.

### تسجيل الدخول

```bash
curl -s http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@storege.app","password":"Admin@12345"}'
```

```json
{ "token": "eyJhbGciOi...", "user": { "id": "…", "role": "ADMIN" } }
```

### أمثلة قراءة

```bash
TOKEN="<ضع التوكن هنا>"

curl -s "http://localhost:4000/api/dashboard" -H "Authorization: Bearer $TOKEN"
curl -s "http://localhost:4000/api/items?search=ELC&pageSize=10" -H "Authorization: Bearer $TOKEN"
curl -s "http://localhost:4000/api/inventory?warehouseId=<id>&pageSize=20" -H "Authorization: Bearer $TOKEN"
curl -s "http://localhost:4000/api/reports/stock-valuation" -H "Authorization: Bearer $TOKEN"
```

### مفتاح API

من الواجهة: **التكاملات → مفاتيح API**، أو:

```bash
curl -s -X POST http://localhost:4000/api/tokens \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"ERP Integration","scopes":"write"}'

# الاستخدام
curl -s http://localhost:4000/api/items -H "X-API-Key: stg_xxx"
```

الصلاحيات: `read` → VIEWER، `write` → OPERATOR، `manage` → MANAGER، `*` → ADMIN.

### Idempotency (مهم للأجهزة والأوفلاين)

أرسل رأس `X-Op-Id` (8–80 حرفًا: حروف/أرقام/`-`/`_`) مع أي عملية كتابة. إعادة نفس المعرّف تُرجع نفس النتيجة مع الرأس `X-Idempotent-Replay: true` بدل تنفيذ العملية مرتين.

```bash
curl -s -X POST http://localhost:4000/api/cycle-counts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Op-Id: handheld-7f3a91c2" \
  -d '{"warehouseId":"<id>","type":"WAREHOUSE"}'
```

### Webhooks

تُوقَّع الحمولة بـ HMAC-SHA256 في الرأس `X-Storege-Signature` باستخدام سر الـ endpoint. الأحداث المدعومة:

`item.created` · `items.imported` · `purchase_order.created` · `receipt.posted` · `receipt.cancelled` · `putaway.confirmed` · `stock.adjusted` · `stock.moved` · `sales_order.created` · `sales_order.allocated` · `sales_order.picked` · `sales_order.shipped` · `sales_order.cancelled` · `transfer.dispatched` · `transfer.received` · `cycle_count.completed` · `invoice.created`

```bash
curl -s -X POST http://localhost:4000/api/webhooks \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"ERP","url":"https://example.com/hooks/storege","events":"*"}'
```

### أهم نقاط النهاية

| المجموعة | المسارات |
| --- | --- |
| المصادقة | `POST /auth/login` · `GET /auth/me` · `POST /auth/change-password` |
| الأصناف | `GET/POST /items` · `GET/PATCH /items/:id` · `POST /items/import` · `GET /items/export.csv` · `GET /categories` · `GET /lots` · `GET /serials` |
| المخزون | `GET /inventory` · `GET /inventory/summary` · `POST /inventory/adjust` · `POST /inventory/move` · `GET /inventory/movements` |
| المستودعات | `GET/POST /warehouses` · `GET/POST /zones` · `GET/POST/PATCH/DELETE /locations` |
| المشتريات | `GET/POST /purchase-orders` · `POST /purchase-orders/:id/receive` · `POST /receipts/:id/cancel` · `GET /putaway/pending` · `POST /putaway/confirm` |
| المبيعات | `GET/POST /sales-orders` · `POST /:id/allocate` · `POST /:id/pick` · `POST /:id/pack` · `POST /:id/ship` · `GET /picking/queue` · `GET /shipping/queue` |
| التحويلات | `GET/POST /transfers` · `POST /transfers/:id/dispatch` · `POST /transfers/:id/receive` |
| الجرد | `GET/POST /cycle-counts` · `PATCH /:id/lines` · `POST /:id/submit` · `POST /:id/cancel` |
| الفواتير | `GET/POST /invoices` · `POST /:id/pay` · `POST /:id/cancel` · `GET /invoices/export.csv` |
| التقارير | `GET /reports/{stock-valuation,low-stock,expiry,movement,dead-stock,productivity,top-items,abc,count-accuracy}` |
| الإدارة | `GET/PATCH /settings` · `GET/POST/DELETE /tokens` · `GET/POST/PATCH/DELETE /webhooks` · `GET /audit` · `GET /audit/export.csv` · `GET /system/info` · `GET /users` |

مثال استلام أمر شراء:

```bash
curl -s -X POST http://localhost:4000/api/purchase-orders/<poId>/receive \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "X-Op-Id: receipt-demo-0001" \
  -d '{
    "locationId": "<dockLocationId>",
    "lines": [{ "lineId": "<poLineId>", "qty": 5 }]
  }'
```

> راجع `server/src/routes/*.ts` لمعرفة الحقول الدقيقة لكل نقطة نهاية؛ جميع المدخلات مُتحقَّق منها بـ Zod.

---

## الأدوار والصلاحيات

| العملية | ADMIN | MANAGER | OPERATOR | VIEWER |
| --- | :---: | :---: | :---: | :---: |
| قراءة البيانات والتقارير | ✅ | ✅ | ✅ | ✅ |
| استلام / صرف / تحويل / جرد / فواتير | ✅ | ✅ | ✅ | — |
| إدارة الأصناف والمستودعات والمواقع | ✅ | ✅ | ✅ (كتابة) | — |
| إعدادات الشركة و Webhooks | ✅ | ✅ | — | — |
| المستخدمون ومفاتيح API وحذف المواقع | ✅ | — | — | — |

---

## اختبار الدخان

```bash
npm start            # في نافذة أولى
npm run smoke        # في نافذة ثانية (قراءة فقط)
npm run smoke -- --write   # يختبر أيضًا الكتابة وتكرار X-Op-Id
```

يغطي الاختبار: الصحة، تسجيل الدخول، رفض كلمة المرور الخاطئة، منع المشاهد من الكتابة، جميع قوائم البيانات، البحث والباركود، كل التقارير، تصدير CSV، وإعادة الإرسال الآمنة.

---


## النشر على Vercel

1. **المستودع:** اربط GitHub repo بـ Vercel (Import Project).
2. **متغيرات البيئة (Production):**
   - `DATABASE_URL` — PostgreSQL (Vercel Postgres / Neon / Supabase)
   - `JWT_SECRET` — عشوائي طويل
   - `JWT_EXPIRES_IN=12h`
   - `CORS_ORIGIN=https://your-app.vercel.app`
   - `APP_URL=https://your-app.vercel.app`
   - `COMPANY_TIMEZONE=Asia/Riyadh`
   - `NODE_ENV=production`
3. **البناء:** Vercel يشغّل `npm run vercel-build` (يحوّل Prisma إلى PostgreSQL، يولّد Client، يبني الواجهة). مخرجات `web/dist`.
4. **الـ API:** كل `/api/*` يُوجّه إلى serverless function `api/[...path].ts` التي تستخدم نفس Fastify app (`buildApp()`).
5. **قاعدة البيانات:** `npm run db:push` (أو Prisma migrate) على PostgreSQL antes de usar. لبيانات تجريبية: `npm run db:seed`.
6. **الشعارات:** تُحفظ كـ data URL (base64) في `Setting.logoUrl` (حد 650KB) — لا Nota: no external storage needed.

> SQLite لا يدعم Vercel serverless (نظام الملفات للقراءة فقط)، لذا استخدم PostgreSQL.

## تطبيق Android (APK قابل للتحميل)

1. **الإعداد:**
   ```bash
   npm run build -w web
   npx cap init "Storege WMS" "sa.storege.wms" --web-dir web/dist
   npx cap add android
   npx cap sync android
   ```
2. **البناء:**
   ```bash
   cd android
   ./gradlew assembleDebug
   ```
   ملف APK: `android/app/build/outputs/apk/debug/app-debug.apk`
3. **الربط بـ Vercel:** عدّل `capacitor.config.ts` لاستخدام `server.url = "https://your-app.vercel.app"` (أو احتفظ بالملفات المضمنة للاستخدام الأوفلاين).
4. **GitHub Actions:** workflow `build-apk.yml` (في `.github/workflows`) يبني APK تلقائيًا عند كل push ويحمّله كـ artifact.

> يتطلب Java 17 و Android SDK 34+. لا ترفع `*.keystore` أو `.env` (موجودان في `.gitignore`).

---

## النشر للإنتاج

1. **البيئة:** انسخ `server/.env.example` إلى `server/.env` واضبط:
   - `NODE_ENV=production`
   - `JWT_SECRET` عشوائي طويل (32+ حرفًا)
   - `DATABASE_URL` (PostgreSQL مُفضّل)
   - `CORS_ORIGIN=https://your-domain.com`
   - `APP_URL` و`COMPANY_TIMEZONE`
2. **البناء:** `npm ci && npm run db:generate && npm run build`
3. **القاعدة:** `npm run db:push` (أو `prisma migrate deploy` إن استخدمت الترحيلات)
4. **التشغيل:** `npm start` خلف Nginx/Caddy مع HTTPS (شرط لعمل كاميرا الماسح و PWA).
5. **النسخ الاحتياطي:** جدولة نسخ قاعدة البيانات + مجلد الرفع/الشعارات.
6. **الأمان:** عطّل `SEED_DB`، غيّر كلمات مرور الحسابات التجريبية، وقيّد المنافذ.

مثال systemd:

```ini
[Unit]
Description=Storege WMS
After=network.target

[Service]
WorkingDirectory=/opt/storege
ExecStart=/usr/bin/npm start
EnvironmentFile=/opt/storege/server/.env
Restart=always
User=storege

[Install]
WantedBy=multi-user.target
```

---

## استكشاف الأخطاء

| المشكلة | الحل |
| --- | --- |
| `Cannot find module '.prisma/client'` | `npm run db:generate` |
| `The table does not exist` | `npm run db:push` |
| الواجهة لا تتصل بالـ API في التطوير | تأكد أن الخادم على 4000 وأن Vite proxy يعمل |
| الكاميرا لا تعمل | استخدم localhost أو HTTPS، واسمح بإذن الكاميرا |
| تسجيل الدخول يعيد 401 | شغّل `npm run db:seed` للتأكد من الحسابات التجريبية |
| تغيير مزود قاعدة البيانات | أعد `npm run db:generate` بعد `db:postgres` أو `--sqlite` |
| PWA لا يعمل أوفلاين | احمِ الموقع بـ HTTPS وافتحه مرة واحدة متصلًا |

---

## English quick start

```bash
git clone https://github.com/engahmedabdoualyan-max/storege.git
cd storege
npm run setup     # install, generate Prisma, create DB, seed demo data
npm run dev       # API :4000 + web :5173
# or production:
npm run build && npm start   # http://localhost:4000
```

Demo accounts: `admin@storege.app / Admin@12345`, `manager@storege.app / Manager@12345`, `operator@storege.app / Operator@12345`, `viewer@storege.app / Viewer@12345`.

PostgreSQL: `docker compose up -d db && npm run db:postgres && npm run db:generate && npm run db:push && npm run db:seed`. Full stack: `docker compose up -d --build`.

The handheld UI is at `/m`; it is a PWA with a full offline mutation queue (IndexedDB) and `X-Op-Id` idempotency. API docs and examples are in the Arabic section above; routes live in `server/src/routes/`.

---

## الترخيص

[MIT](LICENSE) © 2026 Storege WMS
