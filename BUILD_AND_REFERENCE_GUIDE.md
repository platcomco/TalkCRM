# TalkCRM - Complete Architecture, Build & Reference Guide

This document is the comprehensive reference manual for **TalkCRM**—a lightweight, self-hosted CRM built to integrate **UniFi Talk PBX**, **QuickBooks Online**, and **Google Workspace (Gmail)**.

---

## 1. System Architecture

```
                  +----------------------------------------------+
                  |           Local Area Network (LAN)           |
                  |                                              |
                  |  +--------------------+                      |
                  |  |   UniFi Talk PBX   |                      |
                  |  |  (UDM / Cloud GW)  |                      |
                  |  +---------+----------+                      |
                  |            | Webhook POST                    |
                  |            v                                 |
                  |  +----------------------------------------+  |
                  |  | TalkCRM Server (:3050)                 |  |
                  |  |                                        |  |
                  |  | - Next.js App Router (0.0.0.0:3050)   |  |
                  |  | - Prisma ORM / SQLite DB               |  |
                  |  | - Server-Sent Events (SSE) Bus         |  |
                  |  | - Employee Auth Middleware             |  |
                  |  +---------+------------------------------+  |
                  |            | SSE Push                        |
                  |            v                                 |
                  |  +--------------------+                      |
                  |  |  Browser Dashboard |                      |
                  |  |  (Call Screen-Pop) |                      |
                  |  +--------------------+                      |
                  +-----------------------+----------------------+
                                          |
                        Cloud REST APIs   |
                  +-----------------------v----------------------+
                  | QuickBooks Online API (Customers, Invoices)  |
                  | Google Workspace API  (Gmail Threads, OAuth) |
                  +----------------------------------------------+
```

---

## 2. Directory Structure

```text
talkcrm/
├── Dockerfile                         # Production multi-stage Alpine container
├── docker-compose.yml                 # Orchestration with persistent volume & port mapping
├── .dockerignore                      # Build exclusions
├── .gitignore                         # Excludes node_modules, .next, and local databases
├── .env.example                       # Configuration template
├── package.json                       # Scripts and project dependencies
├── next.config.js                     # Next.js standalone output config
├── tsconfig.json                      # TypeScript configuration
├── tailwind.config.js                 # Tailwind styling rules
├── postcss.config.js                  # CSS post-processing
├── prisma/
│   └── schema.prisma                  # Data models (Customer, CallLog, Note, InvoiceCache, Integration)
├── scripts/
│   ├── seed.js                        # Seeds realistic sample customers, invoices, calls, and notes
│   └── simulate-call.js               # Webhook testing runner to simulate incoming PBX calls
└── src/
    ├── middleware.ts                  # Route protection (requires login, bypasses PBX webhooks)
    ├── app/
    │   ├── layout.tsx                 # App layout with Navbar and floating CallScreenPop
    │   ├── page.tsx                   # Live dashboard, KPI metrics, recent calls feed
    │   ├── login/page.tsx             # Employee Google Workspace login portal
    │   ├── customers/
    │   │   ├── page.tsx               # Customer directory, search, and new customer modal
    │   │   └── [id]/page.tsx          # 360° customer dossier (Invoices, Emails, Calls, Notes)
    │   ├── calls/page.tsx             # Telephony ledger with status filters
    │   ├── settings/page.tsx          # Webhook URLs, QBO/Google OAuth status, and sync triggers
    │   └── api/
    │       ├── auth/
    │       │   ├── login/route.ts     # Google OAuth redirect
    │       │   ├── callback/route.ts  # Token exchange, domain validation, session cookie
    │       │   ├── logout/route.ts    # Clears session cookie
    │       │   ├── me/route.ts        # Returns logged-in user profile
    │       │   ├── google/callback/   # Gmail API authorization
    │       │   └── quickbooks/callback/ # Intuit QBO authorization
    │       ├── webhooks/unifi-talk/   # UniFi Talk PBX inbound/outbound webhook handler
    │       ├── events/route.ts        # Server-Sent Events (SSE) live push stream
    │       ├── customers/             # Customer search & creation APIs
    │       ├── calls/route.ts         # Telephony logs API
    │       ├── notes/route.ts         # In-call and customer note API
    │       └── integrations/          # QBO manual sync, status, demo seed
    ├── components/
    │   ├── CallScreenPop.tsx          # Real-time incoming call modal with audio chime & notes
    │   └── Navbar.tsx                 # Navigation, live PBX pill, search, employee profile
    └── lib/
        ├── auth.ts                    # Native Web Crypto HMAC-SHA256 session management
        ├── db.ts                      # Prisma client singleton
        ├── event-emitter.ts           # In-memory pub/sub for real-time SSE broadcasts
        ├── phone-utils.ts             # E.164 normalization & fuzzy matching
        ├── quickbooks.ts              # QBO API client, token refresh & sync engine
        └── gmail.ts                   # Google Workspace thread query client
```

---

## 3. Configuration & Environment Variables

Copy `.env.example` to `.env` on your target machine:

```env
# Database
DATABASE_URL="file:./dev.db"            # Local dev (in Docker, automatically file:/app/data/crm.db)

# Networking
PORT=3050                              # Server listening port
HOST_PORT=3050                         # Host machine port exposed by Docker
HOSTNAME="0.0.0.0"                     # Binds to all network interfaces (allows LAN access)
NEXT_PUBLIC_APP_URL="http://10.30.46.130:3050" # Set to your server's LAN IP or hostname

# Security & Employee Login
ENABLE_AUTH="true"                     # Set to "false" to bypass login during offline tests
AUTH_SECRET="your_32_character_secret" # Secret used to sign session cookies
ALLOWED_EMAIL_DOMAINS="platcomco.com"  # Restricts logins to your Google Workspace domain
ALLOWED_USERS=""                       # Optional: comma-separated list of specific allowed emails

# PBX Webhook Security
UNIFI_TALK_WEBHOOK_SECRET="talkcrm-secret-token"

# QuickBooks Online
QBO_CLIENT_ID="your_intuit_client_id"
QBO_CLIENT_SECRET="your_intuit_client_secret"
QBO_ENVIRONMENT="sandbox"              # Switch to "production" for live accounting

# Google Cloud (used for both Login and Gmail integration)
GOOGLE_CLIENT_ID="your_client_id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your_client_secret"
```

---

## 4. Deployment Instructions

### Method A: Docker Deployment (Recommended for Remote Host)

1. **Clone the repository**:
   ```bash
   git clone https://github.com/platcomco/TalkCRM.git
   cd TalkCRM
   ```
2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your LAN IP and credentials
   ```
3. **Start the container**:
   ```bash
   docker compose up -d --build
   ```
4. **Data Persistence**:
   The database is stored in `./data/crm.db` on the host machine. It automatically survives container updates and restarts.

### Method B: Local Host (Node.js)

1. Install dependencies:
   ```bash
   npm install
   ```
2. Initialize database:
   ```bash
   npx prisma db push
   node scripts/seed.js
   ```
3. Run dev server on `0.0.0.0:3050`:
   ```bash
   npm run dev
   ```
   Or run the standalone production build:
   ```bash
   npm run build
   npm start
   ```

---

## 5. Third-Party Integrations Setup

### 1. UniFi Talk PBX Setup
1. Log in to your **UniFi OS Console** (UDM Pro / Cloud Gateway).
2. Open **Talk** &rarr; **Settings** &rarr; **System** (or **Integrations**).
3. Find **Third-Party Webhooks**:
   - **URL**: `http://<SERVER-LAN-IP>:3050/api/webhooks/unifi-talk`
   - **Method**: `POST`
   - **Header**: `x-unifi-secret: talkcrm-secret-token`
4. Test by making an inbound or outbound call.

### 2. QuickBooks Online Setup
1. Register at [developer.intuit.com](https://developer.intuit.com) and create an app with the **Accounting** scope.
2. In App Settings &rarr; **Keys & OAuth**:
   - Add Redirect URI: `http://<SERVER-LAN-IP>:3050/api/auth/quickbooks/callback`
   - Copy `Client ID` and `Client Secret` into `.env`.
3. In TalkCRM Settings, click **"Connect to QuickBooks"**, then **"Sync Customers Now"**.

### 3. Google Workspace Setup (Login + Gmail Search)
1. Open the [Google Cloud Console](https://console.cloud.google.com).
2. Enable the **Gmail API**.
3. Under **OAuth Consent Screen**, configure your user type as **Internal** (only people in your Workspace domain).
4. Under **Credentials**, create an **OAuth 2.0 Client ID (Web Application)**:
   - Add Authorized Redirect URIs:
     - `http://<SERVER-LAN-IP>:3050/api/auth/callback` (for Employee Login)
     - `http://<SERVER-LAN-IP>:3050/api/auth/google/callback` (for Gmail Account Integration)
5. Copy credentials into `.env`.

---

## 6. Testing & Simulation Commands

You can verify the entire telephony pipeline without needing a live telephone call:

1. **Simulate a Call from an Existing Customer (Marcus Vance)**:
   ```bash
   node scripts/simulate-call.js 5552345678 ringing
   ```
2. **Simulate an Unknown Caller**:
   ```bash
   node scripts/simulate-call.js 5559990011 ringing
   ```
3. **Simulate a Full Answered Call (rings, answered, 120 seconds of talk time)**:
   ```bash
   node scripts/simulate-call.js 5552345678 answered 120
   ```
4. **Simulate a Missed Call (rings, caller hangs up)**:
   ```bash
   node scripts/simulate-call.js 5552345678 missed
   ```

The script sends the same events UniFi Talk sends (`call_started`, `call_answered`, `call_completed`) to `http://localhost:3050` by default. Set `TALKCRM_URL` to target another server and `UNIFI_TALK_WEBHOOK_SECRET` to match the server's secret.

---

## 7. Troubleshooting & FAQ

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **Connection Refused on LAN IP** | Server is only bound to `127.0.0.1` | Ensure `HOSTNAME="0.0.0.0"` is set in `.env` and `dev` runs with `-H 0.0.0.0`. |
| **Port Conflict** | Port 3000 is occupied by another app | Change `HOST_PORT=3050` (or `8080`) in `.env`. |
| **EPERM during `prisma generate`** | Running server has a Windows file lock on the query engine DLL | Stop the running node process before running `prisma generate`. |
| **Google Sign-in Blocked** | User's email domain doesn't match `ALLOWED_EMAIL_DOMAINS` | Verify the employee is logging in with their `@platcomco.com` company account. |
| **Database Backup** | Need to backup CRM records | Copy the `./data/crm.db` file (or `dev.db` locally). |
