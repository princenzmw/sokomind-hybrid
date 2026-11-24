# SokoMind: Privacy-First Hybrid AI Retail Ledger

Built for **#BuildHybridAI 2026** using the **Firebase AI Logic Hybrid Inference SDK (`firebase/ai`)**, **Firebase App Check**, and offline-capable Firestore persistence.

SokoMind helps micro-retailers record daily Swahili, Sheng, and English shop notes (`madeni` credit tabs, M-PESA payments, and cash sales) locally with Chrome Gemini Nano, scrub sensitive customer identifiers before any cloud fallback, and escalate anonymized aggregate summaries or supplier invoice images to Gemini 2.5 Flash in the cloud.

---

## Hybrid Inference Architecture

```text
[Shopkeeper Note / JPEG Receipt]
        |
        v
[On-Device PII Firewall]  --> Masks +254/07/01 phones, M-PESA refs, customer names
        |
        v
[Firebase AI Logic Hybrid Router]  (guarded by Firebase App Check)
  |-- PREFER_ON_DEVICE / ONLY_ON_DEVICE --> Chrome Gemini Nano ($0, low latency, works offline)
  |-- Fallback or ONLY_IN_CLOUD         --> Cloud Gemini 2.5 Flash (multimodal receipts & margin strategy)
        |
        v
[Telemetry Tracker]  --> Reads response.inferenceSource (ON_DEVICE vs IN_CLOUD), latency ms, tokens saved
```

### Why Hybrid Inference Fits Micro-Retail
1. **Privacy:** Customer phone numbers (`0712...`, `+254...`), customer names, and M-PESA confirmation codes stay masked locally before any prompt can reach a cloud model.
2. **Offline resilience:** Routine daily entries parse locally when Chrome's on-device model is available, while supplier receipts and anonymized multi-day strategy summaries route to Cloud Gemini when connected.
3. **Zero wasted cloud cost:** Routine single-turn extractions run locally when `response.inferenceSource === "on_device"`, saving cloud tokens and cutting round-trip latency.

---

## Setup & Running Locally

### 1. Install Dependencies & Run Tests
```bash
npm install
npm run test
npx tsc --noEmit
npm run build
```

### 2. Connect Your Firebase Project & App Check
1. Create a Web App in the [Firebase Console](https://console.firebase.google.com/) and enable **Firebase AI Logic** (Gemini Developer API).
2. Enable **Firebase App Check** for your Web App:
   - Either configure **reCAPTCHA v3 / Enterprise** and add your site key, OR
   - Open **App Check -> Apps -> Manage debug tokens** to create a debug token (supported for #BuildHybridAI hackathon judging).
3. Copy `.env.example` to `.env` and fill in your values:
```bash
cp .env.example .env
```
```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_RECAPTCHA_SITE_KEY=...
VITE_FIREBASE_APPCHECK_DEBUG_TOKEN=...
```

When `.env` is empty, SokoMind runs in **Preview Mode** (`PREVIEW_LOCAL`) with deterministic local parsing so the UI and privacy firewall can be explored immediately without credentials. Once `.env` contains valid Firebase credentials, every inference call executes directly through `firebase/ai` (`getGenerativeModel`) with real `InferenceMode` routing and `response.inferenceSource` telemetry.

### 3. Deploy to Firebase Hosting
```bash
npm run build
firebase deploy --only hosting
```

---

## Hackathon Compliance Checklist
- [x] **Firebase AI Logic Hybrid Inference SDK (`firebase` >= 12.5.0):** Supports `PREFER_ON_DEVICE`, `ONLY_ON_DEVICE`, `PREFER_IN_CLOUD`, and `ONLY_IN_CLOUD` and reads `response.inferenceSource`.
- [x] **Firebase App Check:** Wired in `src/lib/firebaseClient.ts` with `ReCaptchaV3Provider` / `ReCaptchaEnterpriseProvider` and `FIREBASE_APPCHECK_DEBUG_TOKEN` support.
- [x] **Cloud Escalation with Privacy Audit:** `generateMarginStrategyCloud` uses strictly anonymized `AnonymizedLedgerSummary` payloads inspectable inside the UI.
- [x] **Deadline Target:** Monday, November 30, 2026 at 2:00 PM PST.
