import OpenAI, { toFile } from "openai";

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
    const { prompt, imageUrl } = req.body;

    if (!prompt) {
      return res.status(400).json({
        error: "Prompt is required",
      });
    }

    if (!imageUrl) {
      return res.status(400).json({
        error: "imageUrl is required",
      });
    }

    // Загружаем исходную фотографию из R2
    const imageResponse = await fetch(imageUrl);

    if (!imageResponse.ok) {
      throw new Error(
        `Не удалось получить изображение из R2: ${imageResponse.status}`
      );
    }

    const imageBuffer = Buffer.from(
      await imageResponse.arrayBuffer()
    );

    // Передаём изображение в OpenAI как файл
    const imageFile = await toFile(
      imageBuffer,
      "product.png",
      {
        type: "image/png",
      }
    );

    // Отправляем изображение на редактирование
    const result = await openai.images.edit({
      model: "gpt-image-2",
      image: imageFile,
      prompt: prompt,
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
