import {
    S3Client,
    GetObjectCommand
} from "@aws-sdk/client-s3";

const s3 = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
    }
});

async function streamToBuffer(stream) {
    const chunks = [];

    for await (const chunk of stream) {
        chunks.push(chunk);
    }

    return Buffer.concat(chunks);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export default async function handler(req, res) {

    if (req.method !== "POST") {
        return res.status(405).json({
            success: false,
            message: "Method not allowed"
        });
    }

    try {

        const {
            imageKey,
            prompt
        } = req.body;

        if (!imageKey) {
            return res.status(400).json({
                success: false,
                message: "Image key is required"
            });
        }

        if (!prompt) {
            return res.status(400).json({
                success: false,
                message: "Prompt is required"
            });
        }

        /*
         * Получаем изображение из R2
         */

        const r2Object = await s3.send(
            new GetObjectCommand({
                Bucket: "qian-images",
                Key: imageKey
            })
        );

        if (!r2Object.Body) {
            throw new Error("Image not found in R2");
        }

        const imageBuffer =
            await streamToBuffer(r2Object.Body);

        const imageBase64 =
            imageBuffer.toString("base64");

        console.log(
            "QIAN input image:",
            imageBuffer.length,
            "bytes"
        );

        /*
         * Cloudflare
         */

        const accountId =
            process.env.CF_ACCOUNT_ID;

        const apiToken =
            process.env.CF_API_TOKEN;

        if (!accountId || !apiToken) {
            throw new Error(
                "Cloudflare AI credentials are missing"
            );
        }

        const endpoint =
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/runwayml/stable-diffusion-v1-5-img2img`;

        /*
         * Максимум 3 попытки
         */

        const delays = [
            0,
            3000,
            6000
        ];

        let lastError = null;

        for (let attempt = 0; attempt < 3; attempt++) {

            if (delays[attempt] > 0) {

                console.log(
                    `QIAN retry ${attempt + 1}/3 after ${delays[attempt]}ms`
                );

                await sleep(
                    delays[attempt]
                );

            }

            console.log(
                `QIAN AI attempt ${attempt + 1}/3`
            );

            const aiResponse =
                await fetch(
                    endpoint,
                    {
                        method: "POST",

                        headers: {
                            "Authorization":
                                `Bearer ${apiToken}`,

                            "Content-Type":
                                "application/json"
                        },

                        body: JSON.stringify({

                            prompt:
                                prompt,

                            image_b64:
                                imageBase64,

                            strength:
                                0.45,

                            num_steps:
                                20,

                            width:
                                768,

                            height:
                                1024

                        })
                    }
                );

            /*
             * Успешный ответ
             */

            if (aiResponse.ok) {

                const outputBuffer =
                    Buffer.from(
                        await aiResponse.arrayBuffer()
                    );

                if (!outputBuffer.length) {
                    throw new Error(
                        "Cloudflare returned an empty image"
                    );
                }

                const outputBase64 =
                    outputBuffer.toString(
                        "base64"
                    );

                console.log(
                    "QIAN output image:",
                    outputBuffer.length,
                    "bytes"
                );

                return res.status(200).json({

                    success: true,

                    data: [
                        {
                            b64_json:
                                outputBase64
                        }
                    ]

                });
            }

            /*
             * Ошибка
             */

            const errorText =
                await aiResponse.text();

            console.error(
                `Cloudflare AI attempt ${attempt + 1}:`,
                errorText
            );

            lastError =
                new Error(
                    `Cloudflare AI HTTP ${aiResponse.status}: ${errorText}`
                );

            /*
             * Повторяем только 429
             */

            if (aiResponse.status !== 429) {
                break;
            }
        }

        /*
         * Все попытки закончились
         */

        throw lastError ||
            new Error(
                "Cloudflare AI generation failed"
            );

    } catch (error) {

        console.error(
            "QIAN generation error:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                error.message ||
                "Image generation failed"

        });
    }
}
