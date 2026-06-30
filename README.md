# 🚀 Notion MCP Task Orchestrator

An automated, self-healing workflow orchestrator that reads tasks from your structured Notion database and executes them across **GitHub**, **Instagram**, and **VS Code**. 

It can run locally as a **Model Context Protocol (MCP) server** with OpenCode, or in the cloud as a **Vercel Serverless Function triggered by an automated Cron Job** every 30 minutes.

---

## 🛠️ Architecture Options

### Option 1: Vercel Cloud with Cron (Recommended for Cloud Tasks)
This executes **GitHub** and **Instagram** tasks automatically every 30 minutes in the background, without needing to keep a terminal window open.
*Note: VS Code tasks cannot be processed in the cloud because Vercel does not have access to your local machine.*

### Option 2: Local OpenCode (For Local & Cloud Tasks)
This runs the codebase as an MCP server. It handles **all** task types, including opening folders and executing commands inside your local VS Code application.

---

## 🚀 Step-by-Step Vercel Hosting & Cron Setup

1. **Deploy to Vercel**:
   - Go to [vercel.com](https://vercel.com) and sign in.
   - Click **Add New** → **Project**.
   - Import your repository `https://github.com/Shravan44s/MCP`.
   
2. **Add Environment Variables**:
   In your Vercel Project settings under **Environment Variables**, add the following:
   - `NOTION_TOKEN` — Your Notion integration token (`ntn_...`)
   - `NOTION_DATABASE_ID` — Your Notion task database ID (`38eed919-4589-81b4-a6fe-d092d6efecf1`)
   - `GITHUB_TOKEN` — Your GitHub Personal Access Token (`ghp_...`)
   - `CRON_SECRET` — A secure, secret password of your choice (e.g. `my-super-secret-cron-key`). Vercel uses this to authenticate the cron trigger.

3. **Deploy**:
   - Click **Deploy**. Vercel will build the project and map the automated cron job using the configuration in `vercel.json`.

---

## 📸 Connecting Instagram

Instagram content publishing requires a **Professional Business or Creator Account** connected to a **Facebook Page** under the Meta Graph API structure.

### Step 1: Account Preparation
1. Open the Instagram app → Go to **Settings** → **Account type and tools** → Switch to **Professional Account** (choose Business or Creator).
2. Create a Facebook Page (if you don't have one).
3. Connect your Instagram Professional Account to your Facebook Page (in Instagram Settings or Facebook Page Settings).

### Step 2: Meta App Setup
1. Go to the [Meta for Developers Portal](https://developers.facebook.com/) and register as a developer.
2. Click **Create App** → Select **Other** → **Business** app type.
3. Add the **Instagram Graph API** product to your app.

### Step 3: Get Credentials
1. Go to the **Graph API Explorer** tool.
2. Request the following permissions:
   - `instagram_basic`
   - `instagram_content_publish`
   - `instagram_manage_insights`
   - `pages_show_list`
   - `pages_read_engagement`
3. Generate a **long-lived user access token**.
4. Query the API (`GET /me/accounts`) to get your connected Facebook page access tokens and select your **Instagram Business Account ID**.

### Step 4: Configure `ig-mcp` on OpenCode
Once you have the credentials, add them to your `opencode.jsonc` file:
```jsonc
"ig-mcp": {
  "enabled": true,
  "type": "local",
  "command": ["uvx", "ig-mcp"],
  "environment": {
    "INSTAGRAM_ACCESS_TOKEN": "YOUR_LONG_LIVED_ACCESS_TOKEN",
    "INSTAGRAM_BUSINESS_ACCOUNT_ID": "YOUR_INSTAGRAM_BUSINESS_ACCOUNT_ID"
  }
}
```

---

## ✈️ Connecting Telegram

You can get instant notifications on your phone whenever a Notion task runs or execute custom Telegram notification tasks.

### Step 1: Create a Bot
1. Start a chat with [@BotFather](https://t.me/BotFather) on Telegram.
2. Send `/newbot` and follow the prompts to choose a name and username.
3. Save the **HTTP API Token** (looks like `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ`).

### Step 2: Get Your Chat ID
1. Start a chat with [@userinfobot](https://t.me/userinfobot) on Telegram and send a message.
2. It will reply with your `Id` (e.g. `987654321`). This is your **Chat ID**.

### Step 3: Configure Environment Variables
Add these to your local `.env` file or Vercel Environment Variables:
- `TELEGRAM_BOT_TOKEN` — Your Bot token from Step 1
- `TELEGRAM_CHAT_ID` — Your Chat ID from Step 2

Once set, the orchestrator will automatically notify your phone whenever any task is run in the background by Vercel! You can also target `Telegram` as a **Platform** in Notion, and it will forward the Task Name/Details to your Telegram.

---

## 📋 Notion Database Layout

The auto-generated database contains the following columns:

| Column | Type | Description |
|---|---|---|
| **Task Name** | Title | The task description/title |
| **Platform** | Select | `GitHub`, `Instagram`, `VSCode`, `General` |
| **Status** | Status | `Todo`, `In Progress`, `Done`, `Failed` |
| **Priority** | Select | `High`, `Medium`, `Low` |
| **GitHub Repo** | Text | Repository target (`owner/repo`) |
| **GitHub Action** | Select | `Create Repo`, `Create Issue`, `Create PR`, `Commit File`, `List Issues`, `Get Repo` |
| **VSCode Project Path**| Text | File path to project directory |
| **VSCode Command** | Text | CLI command to execute |
| **Details** | Text | Multi-line specifications or description |
| **Result** | Text | Read-only output logs from the engine |
