// ============================================
// Telegram Bot API Client
// Sends messages using the HTTP API (no heavy SDK)
// ============================================

export class TelegramClient {
  private token: string;
  private defaultChatId: string;

  constructor(token: string, defaultChatId: string) {
    this.token = token;
    this.defaultChatId = defaultChatId;
  }

  /**
   * Send a text message to a specific chat (or the default user)
   */
  async sendMessage(text: string, chatId?: string): Promise<{ success: boolean; messageId?: number }> {
    const targetChat = chatId || this.defaultChatId;
    if (!this.token || !targetChat) {
      throw new Error("Telegram client token or chat ID is missing");
    }

    const url = `https://api.telegram.org/bot${this.token}/sendMessage`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: targetChat,
          text: text,
          parse_mode: "HTML",
        }),
      });

      const data: any = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.description || "Failed to send message to Telegram");
      }

      return {
        success: true,
        messageId: data.result?.message_id,
      };
    } catch (err: any) {
      throw new Error(`Telegram Send Error: ${err.message || String(err)}`);
    }
  }
}
