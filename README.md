# SokoMind: Privacy-First Hybrid AI Retail Ledger

Built for **#BuildHybridAI 2026** using the **Firebase AI Logic Hybrid Inference SDK (`firebase/ai`)**, **Firebase App Check**, and offline-capable Firestore persistence.

**Live App:** [https://sokomind-hybrid-2026.web.app](https://sokomind-hybrid-2026.web.app)

SokoMind helps micro-retailers record daily Swahili, Sheng, and English shop notes (`madeni` credit tabs, M-PESA payments, and cash sales) locally with Chrome Gemini Nano, scrub sensitive customer identifiers before any cloud fallback, and escalate anonymized aggregate summaries or supplier invoice images to Gemini 3.8 Flash (with automatic fallback to Gemini 3.5 Flash-Lite on transient cloud spikes).

---

## Hybrid Inference Architecture

```text
[Shopkeeper Note / Voice / Receipt PNG]
        |
        v
[On-Device PII Firewall]  --> Masks +254/07/01 phones, M-PESA refs, National IDs, emails, customer names
        |
        v
[Firebase AI Logic Hybrid Router]  (guarded by Firebase App Check)
  |-- PREFER_ON_DEVICE / ONLY_ON_DEVICE --> Chrome Gemini Nano ($0, low latency, works offline)
  |-- Offline without Nano              --> Deterministic local fallback + local/Firestore queue
  |-- Fallback or ONLY_IN_CLOUD         --> Cloud Gemini 3.8 Flash (with 3.5 Flash-Lite retry)
        |
        v
[Telemetry & Sanitized Storage]  --> Reads response.inferenceSource, modelUsed, latency ms, strips rawInput
```

### Why Hybrid Inference Fits Micro-Retail
1. **Privacy:** Customer phone numbers (`0712...`, `+254...`), customer names, Kenyan national ID numbers, emails, and M-PESA confirmation codes stay masked locally before any prompt can reach a cloud model.
2. **Offline resilience:** Routine daily entries parse locally when Chrome Gemini Nano is available or via deterministic fallback when offline, and installable PWA caching keeps the workspace working without connectivity.
3. **Zero wasted cloud cost:** Routine single-turn extractions run locally when `response.inferenceSource === "on_device"`, saving cloud tokens and cutting round-trip latency, while a built-in benchmark tool measures on-device vs cloud timing side by side.

---

## Key Capabilities
- **Hybrid Inference Controls:** Live mode switching (`PREFER_ON_DEVICE`, `ONLY_ON_DEVICE`, `PREFER_IN_CLOUD`, `ONLY_IN_CLOUD`), offline simulation alongside `navigator.onLine` detection, and in-app Chrome Gemini Nano download trigger via `initializeDeviceModel`.
- **Multimodal Supplier Invoice Scanning:** Upload any JPEG/PNG receipt or click **Try Sample Receipt** to generate a realistic Kenyan wholesale invoice image on canvas and parse it via `ONLY_IN_CLOUD` / hybrid routing.
- **Voice & Swahili/Sheng Capture:** Supports browser speech dictation (`en-KE`) plus one-click Swahili, Sheng, and M-PESA note presets.
- **Madeni Credit Tab Ledger:** Aggregates net open credit balances per hashed customer alias (`Customer #XXXX`) with one-click settlement, line-item inspection, search/filter pills, and anonymized CSV export.
- **Firestore & Security Rules Ready:** `src/lib/ledgerStore.ts` strips `rawInput` via `sanitizeEntryForCloud` and syncs sanitized entries under `/shops/{uid}/entries/{entryId}`, paired with strict validation in [firestore.rules](firestore.rules).

---

## Setup & Running Locally

### 1. Install Dependencies & Verify
```bash
npm install
npm run test
npx tsc --noEmit
npm run lint
npm run build
```

### 2. Connect Your Firebase Project & App Check
1. Create a Web App in the [Firebase Console](https://console.firebase.google.com/) and enable **Firebase AI Logic** (Gemini Developer API).
2. Enable **Anonymous Authentication** and **Cloud Firestore** (deploy [firestore.rules](firestore.rules)) if you want multi-device cloud sync beyond local browser persistence.
3. Configure **Firebase App Check** for your Web App:
   - Register a **reCAPTCHA v3 / Enterprise** site key in `VITE_FIREBASE_RECAPTCHA_SITE_KEY`, or
   - Visit with `?appcheck_debug=1` (or `localhost`) while `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN=true` and add the debug token UUID under **App Check -> Apps -> Manage debug tokens**.
4. Copy `.env.example` to `.env` and fill in your Firebase keys.

### 3. Deploy to Firebase Hosting
```bash
npm run build
firebase deploy --only hosting
```

---

## Hackathon Compliance Checklist
- [x] **Firebase AI Logic Hybrid Inference SDK (`firebase` >= 13.4.0):** Uses `PREFER_ON_DEVICE`, `ONLY_ON_DEVICE`, `PREFER_IN_CLOUD`, and `ONLY_IN_CLOUD`, reads `response.inferenceSource`, and invokes `initializeDeviceModel`.
- [x] **Firebase App Check:** Wired in `src/lib/firebaseClient.ts` with `ReCaptchaV3Provider` / `ReCaptchaEnterpriseProvider` and host-safe debug token support.
- [x] **Firestore Offline Cache & Security Rules:** Configured with `persistentLocalCache` + `persistentMultipleTabManager` and strict schema rules blocking raw PII persistence.
