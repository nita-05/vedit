// 📁 /pages/api/check-models.js

// 🧠 VEDIT AI – Model Access Checker (Next.js version)

import OpenAI from "openai";

export default async function handler(req, res) {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "YOUR_COMPANY_API_KEY_HERE",
  });

  try {
    const list = await client.models.list();
    const models = list.data.map((m) => m.id);

    const hasGPT5 = models.some((m) => m.includes("gpt-5"));
    const hasGPT4o = models.some((m) => m.includes("gpt-4o"));
    const hasGPT4 = models.some((m) => m.includes("gpt-4"));
    const hasGPT35 = models.some((m) => m.includes("gpt-3.5"));

    res.status(200).json({
      success: true,
      availableModels: models,
      summary: {
        "GPT-5": hasGPT5 ? "✅ Available" : "❌ Not available",
        "GPT-4o": hasGPT4o ? "✅ Available" : "❌ Not available",
        "GPT-4": hasGPT4 ? "✅ Available" : "❌ Not available",
        "GPT-3.5": hasGPT35 ? "✅ Available" : "❌ Not available",
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
      tip: "Make sure your OPENAI_API_KEY is valid in .env.local",
    });
  }
}

