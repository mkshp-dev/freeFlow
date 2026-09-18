# freeFlow 🌊
> Modern habit & repeated task workflow automation engine powered by **Next.js**, **Supabase Cloud**, and **Todoist**.

---

## 💡 Overview

**freeFlow** connects your daily habit tracking and task workflows with Todoist:
1. **Define Habits / Workflows**: Register repeated tasks like `"Swimming"`, `"Read 30 mins"`, or `"Daily Workout"`.
2. **Instant Sync to Todoist**: When a task is created, freeFlow automatically pushes it to your Todoist account with habit tags.
3. **Automated Recreation Loop**: As soon as you complete the task in Todoist (on web, mobile, or desktop), Todoist fires a webhook to freeFlow.
4. **Immediate Task Spawning**: freeFlow catches the `item:completed` event, increments your habit streak, logs the audit record, and **immediately recreates the task in Todoist**!
5. **Real-Time Analytics & Webhook Feed**: Every webhook event is registered and displayed on an interactive dashboard with streaks and execution logs.

---

## 🚀 Quick Start

### 1. Configure Environment Variables
Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```
Ensure your Supabase keys are present:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Add your Todoist API token (optional at start, can also be configured directly in the Dashboard UI):
- `TODOIST_API_TOKEN`
- `TODOIST_CLIENT_SECRET` (optional, for HMAC signature validation)

### 2. Set Up Supabase Database
Run the SQL migration in your [Supabase SQL Editor](https://supabase.com/dashboard):
```sql
-- Located in supabase/schema.sql
```
This creates:
- `tasks`: Tracks task titles, Todoist IDs, habit streaks, and workflow configurations.
- `workflows`: Configurable automation rules.
- `webhook_logs`: Audit trail of all incoming webhooks.
- `workflow_runs`: Execution logs when a workflow fires.
- `app_settings`: Stores integration tokens securely.

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ⚡ Features

- **🔄 Immediate Task Recreation Workflow**: Check off a task in Todoist; freeFlow immediately recreates it, keeping your routine seamless without manual resets.
- **🔥 Habit Streaks**: Automatically tracks and increments streaks every time you complete a task.
- **⚡ Built-in Webhook Simulator**: Test and verify the entire end-to-end webhook workflow with a single click right from the browser—no tunneling required during development!
- **📊 Real-Time Webhook Logs**: Inspect raw payloads, response statuses, timestamps, and execution notes for all captured webhooks.
- **🛡️ Secure HMAC Signature Verification**: Verifies incoming Todoist requests using `X-Todoist-Hmac-SHA256`.

---

## 📡 Configuring Todoist Webhooks for Production

1. Go to the [Todoist App Management Console](https://developer.todoist.com/appconsole.html) and create an App.
2. In the **Webhook callback URL** field, enter:
   ```
   https://<your-public-domain>/api/webhooks/todoist
   ```
3. Under **Watched events**, check:
   - `item:completed`
   - `item:added`
   - `item:deleted`
4. Copy your **Client Secret** into `.env` as `TODOIST_CLIENT_SECRET` to enable cryptographic signature verification.
