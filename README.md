# TalkCRM

A self-hosted, lightweight CRM designed to run in Docker on your local network. It connects your **UniFi Talk PBX** with **QuickBooks Online** and **Google Workspace (Gmail)** to deliver instant call screen-pops, live customer billing summaries, and recent email correspondence.

---

## Features

- **Live UniFi Talk Screen-Pop**: Receives incoming call webhooks on your local LAN and matches caller phone numbers in real-time (<50ms).
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

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Running in Docker

Once [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/) is installed and running on your machine:

```bash
docker compose up -d --build
```

The application will start on port `3000` with database files persisted in the `./data` directory.

---

## Setting up UniFi Talk PBX Webhooks

1. Find your Docker host's local IP address on your network (e.g., `192.168.1.50`).
2. Open your **UniFi OS Console** (UDM Pro, Cloud Gateway, etc.).
3. Open the **Talk** application &rarr; Click **Settings** &rarr; **System** (or **Integrations**).
4. Under **Webhooks / Third-Party Integration**, set:
   - **URL**: `http://<YOUR-HOST-IP>:3000/api/webhooks/unifi-talk`
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
   - Add Redirect URI: `http://localhost:3000/api/auth/quickbooks/callback`
   - Copy your **Client ID** and **Client Secret** into your `.env` file:
     ```env
     QBO_CLIENT_ID="your_client_id"
     QBO_CLIENT_SECRET="your_client_secret"
     QBO_ENVIRONMENT="sandbox" # switch to "production" when live
     ```
4. In TalkCRM, navigate to **Settings** and click **"Connect to QuickBooks"**.
5. Once connected, click **"Sync Customers Now"** to pull all customer cards and open invoices.

---

## Connecting Google Workspace (Gmail)

1. Open the [Google Cloud Console](https://console.cloud.google.com).
2. Create a project and enable the **Gmail API**.
3. Under **OAuth consent screen**, configure your app and add the scope `https://www.googleapis.com/auth/gmail.readonly`.
4. Under **Credentials**, create an **OAuth 2.0 Client ID (Web Application)**:
   - Authorized redirect URI: `http://localhost:3000/api/auth/google/callback`
5. Copy your credentials into `.env`:
   ```env
   GOOGLE_CLIENT_ID="your_client_id"
   GOOGLE_CLIENT_SECRET="your_client_secret"
   ```
6. In TalkCRM, navigate to **Settings** and click **"Connect Google Workspace"**.
