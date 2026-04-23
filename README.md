# ReviewBoost SaaS

Platformă SaaS care automatizează colectarea recenziilor Google pentru afaceri locale (Saloane, Clinici, Restaurante). Sistemul trimite automat cereri de feedback pe WhatsApp după finalizarea serviciului, filtrând experiențele negative și direcționând recenziile pozitive spre Google Maps.

---

## Cuprins

- [Arhitectură](#arhitectură)
- [Stack tehnic](#stack-tehnic)
- [Structura proiectului](#structura-proiectului)
- [Setup rapid](#setup-rapid)
- [Variabile de mediu](#variabile-de-mediu)
- [API Endpoints](#api-endpoints)
- [Logica de business](#logica-de-business)
- [Teste](#teste)
- [Deployment](#deployment)

---

## Arhitectură

```
┌─────────────────────────────────────────────────────────────┐
│                    Surse externe                             │
│   Mero/Stailer (webhook/polling) │ Import CSV │ API extern  │
└─────────────────┬───────────────────────────────────────────┘
                  │
          ┌───────▼────────┐
          │  NestJS API    │  ←── JWT Auth, Multi-tenant, Rate limiting
          │  (Port 3001)   │
          └──┬──────┬──────┘
             │      │
    ┌────────▼──┐  ┌▼──────────────┐
    │ PostgreSQL│  │ Redis + BullMQ │
    │  (5432)   │  │ Job Queue      │
    └───────────┘  └───────┬────────┘
                           │ delay 60min
                    ┌──────▼──────┐
                    │  WhatsApp   │  ←── Twilio / Meta Business API
                    │  Provider   │
                    └──────┬──────┘
                           │ link unic
                    ┌──────▼──────────────────────┐
                    │   reviewboost.ro/f/:token    │
                    │   4-5★ → Google Maps         │
                    │   1-3★ → Formular intern     │
                    └─────────────────────────────┘
```

---

## Stack tehnic

| Layer | Tehnologie |
|-------|-----------|
| Backend | NestJS (Node.js), TypeORM |
| Baza de date | PostgreSQL 16 |
| Queue | Redis 7 + BullMQ |
| Frontend | Next.js 14, React 18, Tailwind CSS |
| WhatsApp | Twilio / Meta Business API |
| Billing | Stripe |
| Email | Nodemailer (SMTP) |
| Infrastructură | Docker, Docker Compose |
| Securitate | AES-256-GCM (telefoane), JWT, HMAC-SHA256 (webhooks) |

---

## Structura proiectului

```
reviewboost/
├── apps/
│   ├── api/                          # NestJS Backend
│   │   └── src/
│   │       ├── modules/
│   │       │   ├── auth/             # JWT auth, register, login
│   │       │   ├── tenants/          # Firme/patroni
│   │       │   ├── customers/        # Clienți (AES-256 encrypted phones)
│   │       │   ├── appointments/     # Programări
│   │       │   ├── feedback/         # Review gating logic ⭐
│   │       │   ├── scheduler/        # BullMQ + spam filter ⭐
│   │       │   ├── whatsapp/         # Twilio + Meta providers
│   │       │   ├── webhooks/         # Mero/Stailer webhook listener
│   │       │   ├── settings/         # Setări tenant + locații
│   │       │   └── billing/          # Stripe subscriptions
│   │       ├── common/
│   │       │   ├── services/         # EncryptionService (AES-256)
│   │       │   ├── guards/           # JwtAuthGuard
│   │       │   ├── decorators/       # @CurrentTenant, @Public
│   │       │   ├── filters/          # HttpExceptionFilter
│   │       │   └── interceptors/     # Transform, Logging
│   │       └── config/               # DB, BullMQ, env validation
│   └── web/                          # Next.js 14 Frontend
│       └── src/app/
│           ├── f/[token]/            # Pagina feedback publică ⭐
│           ├── dashboard/            # Dashboard patron
│           │   ├── page.tsx          # Overview + charts
│           │   ├── feedback/         # Feed feedback negativ
│           │   └── settings/         # Template mesaj, setări
│           ├── login/
│           └── register/
├── docker-compose.yml
└── .env.example
```

---

## Setup rapid

### 1. Clonează și configurează

```bash
git clone <repo>
cd reviewboost
cp .env.example .env
# Editează .env cu credențialele tale
```

### 2. Pornește cu Docker Compose

```bash
docker-compose up -d
```

Aceasta pornește:
- PostgreSQL pe portul 5432
- Redis pe portul 6379
- API NestJS pe portul 3001
- Frontend Next.js pe portul 3000

### 3. Accesează aplicația

- **Frontend:** http://localhost:3000
- **API Docs (Swagger):** http://localhost:3001/api/docs
- **Dashboard:** http://localhost:3000/dashboard

### 4. Rulează local (fără Docker)

```bash
# Pornește doar DB și Redis
docker-compose up -d postgres redis

# API
cd apps/api
npm install
npm run start:dev

# Frontend (alt terminal)
cd apps/web
npm install
npm run dev
```

---

## Variabile de mediu

Copiază `.env.example` în `.env` și completează:

| Variabilă | Descriere | Obligatorie |
|-----------|-----------|-------------|
| `DB_*` | PostgreSQL connection | ✅ |
| `REDIS_*` | Redis connection | ✅ |
| `JWT_SECRET` | Minim 32 caractere | ✅ |
| `ENCRYPTION_KEY` | Exact 32 caractere (AES-256) | ✅ |
| `TWILIO_*` | Credențiale Twilio WhatsApp | ✅ (dacă WHATSAPP_PROVIDER=twilio) |
| `META_*` | Meta Business API | ✅ (dacă WHATSAPP_PROVIDER=meta) |
| `STRIPE_*` | Billing | ⚠️ Opțional pentru MVP |
| `SMTP_*` | Email alerts | ✅ |

---

## API Endpoints

### Auth
```
POST /api/v1/auth/register     - Înregistrare tenant
POST /api/v1/auth/login        - Login
POST /api/v1/auth/refresh      - Refresh token
GET  /api/v1/auth/me           - Profil curent
```

### Customers
```
GET    /api/v1/customers           - Listă clienți
POST   /api/v1/customers           - Adaugă client
POST   /api/v1/customers/import/csv - Import CSV
DELETE /api/v1/customers/:id/gdpr-erase - Ștergere GDPR
```

### Appointments
```
GET   /api/v1/appointments         - Listă programări
POST  /api/v1/appointments         - Creare programare
PATCH /api/v1/appointments/:id/complete - Marchează completat → trimite WhatsApp
```

### Feedback (Public — fără auth)
```
GET  /api/v1/feedback/:token       - Date pagina feedback
POST /api/v1/feedback/:token/rate  - Trimite rating (1-5⭐)
POST /api/v1/feedback/:token/comment - Comentariu negativ
```

### Dashboard
```
GET /api/v1/feedback/dashboard/stats         - Statistici
GET /api/v1/feedback/dashboard/negative-feed - Feed negativ
```

### Webhooks (Public — HMAC validat)
```
POST /api/v1/webhooks/mero/:locationId    - Mero webhook
POST /api/v1/webhooks/generic/:locationId - Generic webhook
```

### WhatsApp
```
POST /api/v1/whatsapp/twilio/incoming - STOP opt-out
POST /api/v1/whatsapp/twilio/status   - Delivery status
GET  /api/v1/whatsapp/meta/webhook    - Meta verification
POST /api/v1/whatsapp/meta/webhook    - Meta events
```

### Settings & Billing
```
GET   /api/v1/settings                    - Setări curente
PATCH /api/v1/settings                    - Actualizare setări
POST  /api/v1/settings/template/preview   - Preview template
POST  /api/v1/billing/checkout            - Stripe checkout
POST  /api/v1/billing/portal              - Stripe portal
```

---

## Logica de business

### Review Gating Flow

```
Programare completată
        ↓
SchedulerService.scheduleReviewRequest()
        ↓
   ┌────┴─────┐
   │ Blacklist?│ → DA: SKIP
   └────┬─────┘
        ↓ NU
   ┌────┴──────────┐
   │ Spam filter?  │ → DA: SKIP (trimis în ultimele 30 zile)
   └────┬──────────┘
        ↓ NU
   Crează FeedbackLog (token unic)
        ↓
   Enqueează BullMQ job (delay: 60 min)
        ↓ (după delay)
   ReviewJobProcessor (re-verifică blacklist + spam)
        ↓
   Trimite WhatsApp cu link: reviewboost.ro/f/{token}
        ↓
   User votează (1-5 stele)
        ↓
   ┌────┴────────┐
   │ Score >= 4? │ → DA: Redirect Google Maps ⭐
   └────┬────────┘
        ↓ NU
   Formular intern + Alert instant patron 🔔
```

### Spam Filter

Sistemul verifică `Customer.lastReviewSentAt`:
- Dacă au trecut mai puțin de `spamFilterDays` (default: 30) → se anulează job-ul
- Verificarea se face atât la **enqueue** cât și la **execuție** (double-check)
- `jobId: review-{appointmentId}` previne duplicate în coadă

### Securitate GDPR

- Telefoanele sunt **AES-256-GCM encrypted** în DB
- Căutarea se face prin **HMAC-SHA256 hash** (nu poate fi reversat)
- Endpoint `DELETE /customers/:id/gdpr-erase` anonimizează datele
- Opt-out prin STOP → blacklist automat

---

## Teste

```bash
cd apps/api

# Rulează toate testele
npm run test

# Cu acoperire (coverage)
npm run test:cov

# Watch mode
npm run test:watch
```

### Test suites incluse:

| Fișier | Teste | Ce acoperă |
|--------|-------|------------|
| `scheduler.service.spec.ts` | 9 | Spam filter, blacklist, idempotency, delay, fallback |
| `feedback.service.spec.ts` | 11 | Review gating, threshold, alert, expirat, idempotent |
| `encryption.service.spec.ts` | 7 | Encrypt/decrypt, random IV, tamper detection, hash |

---

## Deployment

### AWS / DigitalOcean

```bash
# Build imagini
docker-compose -f docker-compose.prod.yml build

# Push la registry
docker-compose -f docker-compose.prod.yml push

# Deploy
docker-compose -f docker-compose.prod.yml up -d
```

### Variabile pentru producție

```env
NODE_ENV=production
DB_SSL=true
# Schimbă toate secretele!
```

### Mero Webhook URL

Configurează în panoul Mero:
```
https://api.reviewboost.ro/api/v1/webhooks/mero/{LOCATION_ID}
```

### Twilio WhatsApp Webhook

```
Incoming: https://api.reviewboost.ro/api/v1/whatsapp/twilio/incoming
Status:   https://api.reviewboost.ro/api/v1/whatsapp/twilio/status
```

---

## Roadmap MVP

- [x] **Faza 1:** Import CSV + WhatsApp + Review Gating
- [x] **Faza 2:** Webhook Mero/Stailer + Polling automat
- [x] **Faza 3:** Dashboard analytics + Stripe billing
- [ ] **Faza 4:** App mobile patron (React Native)
- [ ] **Faza 5:** Integrare Appointfix, Fresha, Treatwell

---

## Licență

Proprietar — ReviewBoost SaaS © 2024
