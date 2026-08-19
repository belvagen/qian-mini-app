import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const { prompt, image } = req.body;

    if (!prompt) {
      return res.status(400).json({
        error: "Prompt is required",
      });
    }

    const result = await openai.images.edit({
      model: "gpt-image-2",
      prompt,
      image,
    });

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    console.error("OpenAI Image Error:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Image generation failed",
    });
  }
}
