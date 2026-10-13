# TalkCRM

A self-hosted, lightweight CRM designed to run in Docker on your local network. It connects your **UniFi Talk PBX** with **QuickBooks Online** and **Google Workspace (Gmail)** to deliver instant call screen-pops, live customer billing summaries, and recent email correspondence.

---

## Features

- **Live UniFi Talk Screen-Pop**: Receives incoming call webhooks on your local LAN and matches caller phone numbers in real-time (<50ms).
- **Google Workspace Employee Login**: Secure sign-in restricted to your company domain (e.g. `@platcomco.com`) or specific employee emails.
- **QuickBooks Online (QBO) Sync**: Pulls customer profiles, phone numbers, open invoice balances, and overdue notices.
- **Gmail Thread Lookup**: Queries customer email threads on-demand via the Google Workspace API.
- **In-Call Note Taking**: Log notes directly inside the floating call popup without interrupting your workflow.
- **Dockerized**: Zero-hassle deployment with `docker compose up -d` and persistent volume storage.
- **Built-in Webhook Simulator**: Test and demo incoming calls with a single click or CLI command.

---

## Quickstart (Local Development)

### 1. Prerequisites
- Node.js 18+ (Node.js 24 LTS installed)
- npm

### 2. Run the App
```bash
# In the talkcrm directory:
npm run dev
```

Open [http://localhost:3050](http://localhost:3050) in your browser.

---

## Running in Docker

Once [Docker Desktop](https://www.docker.com/products/docker-desktop/) or Docker engine is installed on your server:

```bash
docker compose up -d --build
```

The application will start on port `3050` by default (configurable via `HOST_PORT` in `.env`) with database files persisted in the `./data` directory.

> [!TIP]
> **Changing the Port**: You can change the port to any number (e.g. `8080`, `3001`, `5000`) simply by setting `HOST_PORT=8080` in your `.env` file before running `docker compose up -d`.

---

## Setting up UniFi Talk PBX Webhooks

1. Find your Docker host's local IP address on your network (e.g., `192.168.1.50`).
2. Open your **UniFi OS Console** (UDM Pro, Cloud Gateway, etc.).
3. Open the **Talk** application &rarr; Click **Settings** &rarr; **System** (or **Integrations**).
4. Under **Webhooks / Third-Party Integration**, set:
   - **URL**: `http://<YOUR-HOST-IP>:3050/api/webhooks/unifi-talk`
   - **Method**: `POST`
   - **Secret Header**: `x-unifi-secret: talkcrm-secret-token` (matches your `.env`)
5. Save the configuration. Inbound and outbound calls will now instantly trigger screen-pops in TalkCRM!

---

## Testing Call Popups

You can test the real-time call popup without a physical phone call:

1. **Via UI**: Click the **"Test Call Pop"** button in the top navigation bar.
2. **Via Terminal**:
   ```bash
   node scripts/simulate-call.js 5552345678 ringing
   ```
   Or simulate an unknown caller:
   ```bash
   node scripts/simulate-call.js 5559998877 ringing
   ```

---

## Connecting QuickBooks Online (QBO)

1. Register an Intuit Developer account at [developer.intuit.com](https://developer.intuit.com).
2. Create an app (select **Accounting** scope).
3. In App Settings &rarr; **Keys & OAuth**:
   - Add Redirect URI: `http://localhost:3050/api/auth/quickbooks/callback`
   - Copy your **Client ID** and **Client Secret** into your `.env` file:
     ```env
     QBO_CLIENT_ID="your_client_id"
     QBO_CLIENT_SECRET="your_client_secret"
     QBO_ENVIRONMENT="sandbox" # switch to "production" when live
     ```
4. In TalkCRM, navigate to **Settings** and click **"Connect to QuickBooks"**.
5. Once connected, click **"Sync Customers Now"** to pull all customer cards and open invoices.

---

## Google Workspace Employee Login (Security)

TalkCRM includes built-in Google OAuth authentication to restrict access to your team:

1. In your [Google Cloud Console](https://console.cloud.google.com), under **OAuth 2.0 Client IDs**, add the Authorized Redirect URI:
   ```text
   http://<YOUR-SERVER-IP>:3050/api/auth/callback
   ```
2. In your `.env` file, configure the security variables:
   ```env
   # Enable or disable auth (set to "false" to bypass during local tests)
   ENABLE_AUTH="true"

   # Random 32+ character string to securely sign employee session cookies
   AUTH_SECRET="your_random_secret_string"

   # Only allow employees with your company Google Workspace domain
   ALLOWED_EMAIL_DOMAINS="platcomco.com"

   # Or specify allowed employee emails:
   # ALLOWED_USERS="alice@company.com,bob@company.com"
   ```
3. When employees visit the CRM, they are presented with a **"Sign in with Google Workspace"** screen. Accounts outside your allowed domain are automatically rejected.
4. **PBX Webhook Safety**: Machine-to-machine webhooks from your UniFi Talk PBX (`/api/webhooks/unifi-talk`) bypass browser employee logins and continue using token authentication.

---

## Connecting Google Workspace (Gmail Customer Search)

1. Open the [Google Cloud Console](https://console.cloud.google.com).
2. Create a project and enable the **Gmail API**.
3. Under **OAuth consent screen**, configure your app and add the scope `https://www.googleapis.com/auth/gmail.readonly`.
4. Under **Credentials**, create an **OAuth 2.0 Client ID (Web Application)**:
   - Authorized redirect URI: `http://localhost:3050/api/auth/google/callback`
5. Copy your credentials into `.env`:
   ```env
   GOOGLE_CLIENT_ID="your_client_id"
   GOOGLE_CLIENT_SECRET="your_client_secret"
   ```
6. In TalkCRM, navigate to **Settings** and click **"Connect Google Workspace"**.
