import OpenAI from "openai";
import {
    S3Client,
    GetObjectCommand
} from "@aws-sdk/client-s3";


const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});


const s3 = new S3Client({

    region: "auto",

    endpoint: process.env.R2_ENDPOINT,

    credentials: {

        accessKeyId:
            process.env.R2_ACCESS_KEY_ID,

        secretAccessKey:
            process.env.R2_SECRET_ACCESS_KEY

    }

});


async function streamToBuffer(stream) {

    const chunks = [];

    for await (const chunk of stream) {
        chunks.push(chunk);
    }

    return Buffer.concat(chunks);

}


function getMimeType(key) {

    const extension =
        key.split(".").pop().toLowerCase();

    if (extension === "png") {
        return "image/png";
    }

    if (extension === "webp") {
        return "image/webp";
    }

    return "image/jpeg";

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


        if (!process.env.OPENAI_API_KEY) {

            throw new Error(
                "OPENAI_API_KEY is missing"
            );

        }


        /*
         * Получаем оригинал из R2
         */

        console.log(
            "QIAN: loading image from R2:",
            imageKey
        );


        const r2Object =
            await s3.send(

                new GetObjectCommand({

                    Bucket: "qian-images",

                    Key: imageKey

                })

            );


        if (!r2Object.Body) {

            throw new Error(
                "Image not found in R2"
            );

        }


        const imageBuffer =
            await streamToBuffer(
                r2Object.Body
            );


        if (!imageBuffer.length) {

            throw new Error(
                "Image is empty"
            );

        }


        console.log(
            "QIAN: image loaded:",
            imageBuffer.length,
            "bytes"
        );


        /*
         * MIME
         */

        const mimeType =
            getMimeType(imageKey);


        /*
         * Создаём настоящий File,
         * а не передаём строку.
         */

        const imageFile =
            new File(
                [
                    imageBuffer
                ],
                "qian-input",
                {
                    type: mimeType
                }
            );


        /*
         * OpenAI Image Edit
         */

        console.log(
            "QIAN: sending image to OpenAI..."
        );


        const result =
            await openai.images.edit({

                model:
                    "gpt-image-2",

                image:
                    [imageFile],

                prompt:
                    prompt,

                size:
                    "1024x1536",

                quality:
                    "medium"

            });


        /*
         * Проверяем результат
         */

        if (
            !result ||
            !result.data ||
            !result.data.length
        ) {

            throw new Error(
                "OpenAI did not return an image"
            );

        }


        const generatedImage =
            result.data[0];


        if (
            !generatedImage.b64_json
        ) {

            throw new Error(
                "OpenAI returned an empty image"
            );

        }


        console.log(
            "QIAN: image generated successfully"
        );


        /*
         * Возвращаем результат
         */

        return res.status(200).json({

            success: true,

            data: [

                {

                    b64_json:
                        generatedImage.b64_json

                }

            ]

        });


    } catch (error) {

        console.error(
            "QIAN OpenAI generation error:",
            error
        );


        const status =
            error.status || 500;


        let message =
            error.message ||
            "Image generation failed";


        if (status === 401) {

            message =
                "OpenAI API: проверьте OPENAI_API_KEY.";

        }


        if (
            status === 400 &&
            message
                .toLowerCase()
                .includes("billing")
        ) {

            message =
                "OpenAI API: недостаточно доступного баланса.";

        }


        if (status === 429) {

            message =
                "OpenAI API: превышен лимит или недостаточно доступного баланса.";

        }


        return res.status(status).json({

            success: false,

            message:
                message

        });

    }

}
