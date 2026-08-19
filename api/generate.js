import OpenAI, { toFile } from "openai";
import {
    S3Client,
    GetObjectCommand,
} from "@aws-sdk/client-s3";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const s3 = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

export default async function handler(request, response) {

    if (request.method !== "POST") {
        return response.status(405).json({
            success: false,
            message: "Используйте POST-запрос",
        });
    }

    try {

        const { prompt, imageKey } = request.body;

        if (!prompt) {
            return response.status(400).json({
                success: false,
                message: "Не указан prompt",
            });
        }

        if (!imageKey) {
            return response.status(400).json({
                success: false,
                message: "Не указан imageKey",
            });
        }

        // Получаем фотографию из R2
        const object = await s3.send(
            new GetObjectCommand({
                Bucket: "qian-images",
                Key: imageKey,
            })
        );

        if (!object.Body) {
            throw new Error("Фотография не найдена в R2");
        }

        // Преобразуем файл R2 в Buffer
        const imageBuffer = Buffer.from(
            await object.Body.transformToByteArray()
        );

        // Определяем тип изображения
        const contentType =
            object.ContentType || "image/jpeg";

        // Превращаем Buffer в файл для OpenAI
        const imageFile = await toFile(
            imageBuffer,
            "qian-image",
            {
                type: contentType,
            }
        );

        console.log("Отправляем изображение в GPT Image 2");

        // Редактируем изображение через GPT Image 2
        const result = await openai.images.edit({
            model: "gpt-image-2",
            image: imageFile,
            prompt: prompt,
        });

        return response.status(200).json({

            success: true,

            message: "Изображение создано",

            data: result.data,

        });

    } catch (error) {

        console.error(
            "GPT Image 2 error:",
            error
        );

        return response.status(500).json({

            success: false,

            message:
                error.message ||
                "Ошибка генерации изображения",

        });
    }
}
