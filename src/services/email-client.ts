// ============================================
// Email Report Client
// Sends rich HTML daily dashboard emails
// Uses Gmail SMTP (free) + QuickChart.io (free charts)
// ============================================

import nodemailer from "nodemailer";

export interface EmailReportData {
  // Instagram
  instagram?: {
    username: string;
    followers: number;
    following: number;
    mediaCount: number;
    impressions: number;
    reach: number;
    profileViews: number;
    recentMedia: Array<{
      caption?: string;
      likes: number;
      comments: number;
      timestamp: string;
    }>;
  };
  // Notion tasks
  notion: {
    todo: number;
    inProgress: number;
    done: number;
    failed: number;
    recentTasks: Array<{ name: string; platform: string; status: string }>;
  };
  // AI credits
  credits: {
    geminiReqsToday: number;
    geminiTokensUsed: number;
    geminiRemaining: number;
    opencodeTokensTotal: number;
    opencodeSessions: number;
    opencodeModel: string;
  };
}

// Build a QuickChart.io URL (free, no API key)
function chartUrl(config: object, w = 400, h = 260): string {
  const encoded = encodeURIComponent(JSON.stringify(config));
  return `https://quickchart.io/chart?c=${encoded}&width=${w}&height=${h}&backgroundColor=white`;
}

function notionPieChart(todo: number, inProgress: number, done: number, failed: number): string {
  return chartUrl({
    type: "doughnut",
    data: {
      labels: ["Todo", "In Progress", "Done", "Failed"],
      datasets: [{
        data: [todo, inProgress, done, failed],
        backgroundColor: ["#6366f1", "#f59e0b", "#10b981", "#ef4444"],
        borderWidth: 2,
        borderColor: "#ffffff",
      }],
    },
    options: {
      plugins: {
        legend: { position: "bottom", labels: { font: { size: 13 } } },
        title: { display: true, text: "Notion Tasks Breakdown", font: { size: 16, weight: "bold" } },
      },
      cutout: "60%",
    },
  });
}

function instagramBarChart(impressions: number, reach: number, profileViews: number): string {
  return chartUrl({
    type: "bar",
    data: {
      labels: ["Impressions", "Reach", "Profile Views"],
      datasets: [{
        label: "Last 7 Days",
        data: [impressions, reach, profileViews],
        backgroundColor: ["#8b5cf6", "#06b6d4", "#f97316"],
        borderRadius: 8,
        borderWidth: 0,
      }],
    },
    options: {
      plugins: {
        legend: { display: false },
        title: { display: true, text: "Instagram Analytics — Last 7 Days", font: { size: 16, weight: "bold" } },
      },
      scales: {
        y: { beginAtZero: true, grid: { color: "#f0f0f0" } },
        x: { grid: { display: false } },
      },
    },
  }, 450, 280);
}

function geminiGaugeChart(used: number, limit: number): string {
  const pct = Math.min((used / limit) * 100, 100);
  return chartUrl({
    type: "radialGauge",
    data: { datasets: [{ data: [pct], backgroundColor: pct > 80 ? "#ef4444" : pct > 50 ? "#f59e0b" : "#10b981" }] },
    options: {
      plugins: {
        title: { display: true, text: `Gemini Daily Tokens: ${used.toLocaleString()} / ${limit.toLocaleString()}`, font: { size: 13 } },
      },
      trackColor: "#e5e7eb",
      centerPercentage: 80,
    },
  }, 300, 220);
}

export function buildEmailHTML(data: EmailReportData, recipientName = "there"): string {
  const date = new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const totalNotion = data.notion.todo + data.notion.inProgress + data.notion.done + data.notion.failed;

  const instagramSection = data.instagram ? `
    <tr><td style="padding: 0 0 32px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px; padding: 24px; color: white; margin-bottom: 20px;">
        <h2 style="margin: 0 0 16px; font-size: 20px;">📸 Instagram — @${data.instagram.username}</h2>
        <div style="display: flex; gap: 20px; flex-wrap: wrap;">
          <div style="background: rgba(255,255,255,0.15); border-radius: 12px; padding: 16px 24px; text-align: center; min-width: 110px;">
            <div style="font-size: 28px; font-weight: 800;">${data.instagram.followers.toLocaleString("en-IN")}</div>
            <div style="font-size: 12px; opacity: 0.9; margin-top: 4px;">👥 Followers</div>
          </div>
          <div style="background: rgba(255,255,255,0.15); border-radius: 12px; padding: 16px 24px; text-align: center; min-width: 110px;">
            <div style="font-size: 28px; font-weight: 800;">${data.instagram.following.toLocaleString("en-IN")}</div>
            <div style="font-size: 12px; opacity: 0.9; margin-top: 4px;">➡️ Following</div>
          </div>
          <div style="background: rgba(255,255,255,0.15); border-radius: 12px; padding: 16px 24px; text-align: center; min-width: 110px;">
            <div style="font-size: 28px; font-weight: 800;">${data.instagram.mediaCount}</div>
            <div style="font-size: 12px; opacity: 0.9; margin-top: 4px;">🖼️ Posts</div>
          </div>
        </div>
      </div>
      <img src="${instagramBarChart(data.instagram.impressions, data.instagram.reach, data.instagram.profileViews)}"
        alt="Instagram Analytics Chart" style="width: 100%; max-width: 480px; border-radius: 12px; border: 1px solid #e5e7eb;" />
      ${data.instagram.recentMedia.length > 0 ? `
      <h3 style="color: #374151; font-size: 16px; margin: 20px 0 12px;">🕒 Recent Posts</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr style="background: #f9fafb;">
          <th style="padding: 10px 14px; text-align: left; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Post</th>
          <th style="padding: 10px 14px; text-align: center; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">❤️ Likes</th>
          <th style="padding: 10px 14px; text-align: center; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">💬 Comments</th>
        </tr>
        ${data.instagram.recentMedia.map((m, i) => `
        <tr style="background: ${i % 2 === 0 ? "#ffffff" : "#f9fafb"};">
          <td style="padding: 10px 14px; font-size: 13px; color: #374151; border-bottom: 1px solid #f3f4f6;">${(m.caption || "No caption").substring(0, 50)}${m.caption && m.caption.length > 50 ? "…" : ""}</td>
          <td style="padding: 10px 14px; text-align: center; font-size: 13px; font-weight: 600; color: #ef4444; border-bottom: 1px solid #f3f4f6;">${m.likes}</td>
          <td style="padding: 10px 14px; text-align: center; font-size: 13px; font-weight: 600; color: #6366f1; border-bottom: 1px solid #f3f4f6;">${m.comments}</td>
        </tr>`).join("")}
      </table>` : ""}
    </td></tr>
  ` : "";

  const notionSection = `
    <tr><td style="padding: 0 0 32px;">
      <h2 style="color: #1f2937; font-size: 20px; margin: 0 0 16px;">📋 Notion Task Dashboard</h2>
      <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px;">
        ${[
          { label: "Todo", count: data.notion.todo, color: "#6366f1", bg: "#eef2ff" },
          { label: "In Progress", count: data.notion.inProgress, color: "#f59e0b", bg: "#fffbeb" },
          { label: "Done", count: data.notion.done, color: "#10b981", bg: "#ecfdf5" },
          { label: "Failed", count: data.notion.failed, color: "#ef4444", bg: "#fef2f2" },
        ].map(s => `
          <div style="background: ${s.bg}; border: 1px solid ${s.color}33; border-radius: 12px; padding: 16px 20px; text-align: center; min-width: 100px; flex: 1;">
            <div style="font-size: 26px; font-weight: 800; color: ${s.color};">${s.count}</div>
            <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">${s.label}</div>
          </div>`).join("")}
      </div>
      <img src="${notionPieChart(data.notion.todo, data.notion.inProgress, data.notion.done, data.notion.failed)}"
        alt="Notion Tasks Pie Chart" style="width: 100%; max-width: 420px; border-radius: 12px; border: 1px solid #e5e7eb;" />
      ${data.notion.recentTasks.length > 0 ? `
      <h3 style="color: #374151; font-size: 16px; margin: 20px 0 12px;">📌 Recent Tasks</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr style="background: #f9fafb;">
          <th style="padding: 10px 14px; text-align: left; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Task</th>
          <th style="padding: 10px 14px; text-align: center; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Platform</th>
          <th style="padding: 10px 14px; text-align: center; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Status</th>
        </tr>
        ${data.notion.recentTasks.slice(0, 8).map((t, i) => {
          const statusColors: Record<string, string> = { Todo: "#6366f1", "In Progress": "#f59e0b", Done: "#10b981", Failed: "#ef4444" };
          return `
        <tr style="background: ${i % 2 === 0 ? "#ffffff" : "#f9fafb"};">
          <td style="padding: 10px 14px; font-size: 13px; color: #374151; border-bottom: 1px solid #f3f4f6;">${t.name.substring(0, 55)}${t.name.length > 55 ? "…" : ""}</td>
          <td style="padding: 10px 14px; text-align: center; font-size: 12px; color: #6b7280; border-bottom: 1px solid #f3f4f6;">${t.platform}</td>
          <td style="padding: 10px 14px; text-align: center; border-bottom: 1px solid #f3f4f6;">
            <span style="background: ${(statusColors[t.status] || "#6b7280") + "22"}; color: ${statusColors[t.status] || "#6b7280"}; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600;">${t.status}</span>
          </td>
        </tr>`;
        }).join("")}
      </table>` : ""}
    </td></tr>
  `;

  const creditsSection = `
    <tr><td style="padding: 0 0 32px;">
      <h2 style="color: #1f2937; font-size: 20px; margin: 0 0 16px;">🤖 AI Credits & Usage</h2>
      <div style="display: grid; gap: 16px;">
        <!-- Gemini -->
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px;">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
            <span style="font-size: 22px;">🧠</span>
            <div>
              <div style="font-weight: 700; color: #166534;">Gemini 2.5 Flash</div>
              <div style="font-size: 12px; color: #6b7280;">Prompt Enhancer · Free Tier</div>
            </div>
          </div>
          <div style="background: #e5e7eb; border-radius: 999px; height: 8px; overflow: hidden; margin-bottom: 8px;">
            <div style="background: linear-gradient(90deg, #10b981, #6366f1); height: 100%; width: ${Math.min((data.credits.geminiTokensUsed / 1000000) * 100, 100).toFixed(1)}%; border-radius: 999px;"></div>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 12px; color: #6b7280;">
            <span>Used: ~${data.credits.geminiTokensUsed.toLocaleString("en-IN")} tokens</span>
            <span>Remaining: ~${data.credits.geminiRemaining.toLocaleString("en-IN")} / 1,000,000</span>
          </div>
        </div>
        <!-- Pollinations -->
        <div style="background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 12px; padding: 20px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 22px;">🎨</span>
            <div>
              <div style="font-weight: 700; color: #6b21a8;">Pollinations.ai FLUX</div>
              <div style="font-size: 12px; color: #6b7280;">Image Generator · Unlimited Free</div>
            </div>
            <span style="margin-left: auto; background: #dcfce7; color: #166534; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">∞ Unlimited</span>
          </div>
        </div>
        <!-- OpenCode -->
        <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 12px; padding: 20px;">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
            <span style="font-size: 22px;">💻</span>
            <div>
              <div style="font-weight: 700; color: #9a3412;">OpenCode — ${data.credits.opencodeModel}</div>
              <div style="font-size: 12px; color: #6b7280;">AI Coding Assistant · Dynamic Free Tier</div>
            </div>
          </div>
          <div style="display: flex; gap: 16px; flex-wrap: wrap;">
            <div style="text-align: center;">
              <div style="font-size: 22px; font-weight: 800; color: #9a3412;">${data.credits.opencodeSessions}</div>
              <div style="font-size: 11px; color: #6b7280;">Sessions</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 22px; font-weight: 800; color: #9a3412;">${data.credits.opencodeTokensTotal.toLocaleString("en-IN")}</div>
              <div style="font-size: 11px; color: #6b7280;">Total Tokens</div>
            </div>
          </div>
        </div>
      </div>
    </td></tr>
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Daily Dashboard</title>
</head>
<body style="margin: 0; padding: 0; background: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f3f4f6; padding: 32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width: 620px; background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
        <!-- HEADER -->
        <tr>
          <td style="background: linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%); padding: 36px 32px; text-align: center;">
            <div style="font-size: 36px; margin-bottom: 8px;">🚀</div>
            <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">Daily Dashboard Report</h1>
            <p style="margin: 8px 0 0; color: #c4b5fd; font-size: 14px;">${date}</p>
            <p style="margin: 4px 0 0; color: #a5b4fc; font-size: 13px;">Hey ${recipientName}! Here's your full summary 👋</p>
          </td>
        </tr>
        <!-- CONTENT -->
        <tr><td style="padding: 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${instagramSection}
            ${notionSection}
            ${creditsSection}
            <!-- FOOTER -->
            <tr><td style="padding-top: 24px; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                Sent by your <strong>Notion MCP Orchestrator</strong> via Telegram /email command<br />
                <a href="https://github.com/Shravan44s/MCP" style="color: #6366f1; text-decoration: none;">View on GitHub</a>
              </p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendDashboardEmail(
  to: string,
  data: EmailReportData,
  gmailUser: string,
  gmailAppPassword: string,
): Promise<void> {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailAppPassword },
  });

  const recipientName = to.split("@")[0];
  const html = buildEmailHTML(data, recipientName);

  await transporter.sendMail({
    from: `"🚀 MCP Dashboard" <${gmailUser}>`,
    to,
    subject: `📊 Daily Dashboard — ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`,
    html,
  });
}
