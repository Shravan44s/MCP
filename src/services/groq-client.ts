// ============================================
// Groq Chat Client — OpenAI-compatible chat completions
// Fast Llama inference with a much higher free-tier rate
// limit than Gemini's flash models; preferred over Gemini
// for captions/chat to avoid the 429s Gemini's low RPM
// cap causes under normal app usage.
// ============================================

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

export class GroqClient {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model = model || process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  }

  /**
   * Sends a conversational message to Groq and returns the text response.
   * Throws on failure — callers decide how to fall back.
   */
  async chat(message: string, systemPrompt?: string): Promise<string> {
    const messages: { role: string; content: string }[] = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: message });

    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Groq chat API returned status ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
    }

    const data: any = await response.json();
    const text = data.choices?.[0]?.message?.content;

    if (!text) {
      throw new Error("No text returned from Groq");
    }

    return text.trim();
  }
}
