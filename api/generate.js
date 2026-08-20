import {
    S3Client,
    GetObjectCommand
} from "@aws-sdk/client-s3";


const s3 = new S3Client({

    region: "auto",

    endpoint:
        process.env.R2_ENDPOINT,

    credentials: {

        accessKeyId:
            process.env.R2_ACCESS_KEY_ID,

        secretAccessKey:
            process.env.R2_SECRET_ACCESS_KEY

    }

});


async function streamToBuffer(stream) {

    const chunks = [];

    for await (
        const chunk of stream
    ) {

        chunks.push(chunk);

    }

    return Buffer.concat(chunks);

}


export default async function handler(
    req,
    res
) {

    if (req.method !== "POST") {

        return res.status(405).json({

            success: false,

            message:
                "Method not allowed"

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

                message:
                    "Image key is required"

            });

        }


        if (!prompt) {

            return res.status(400).json({

                success: false,

                message:
                    "Prompt is required"

            });

        }


        /*
         * 1.
         * Получаем изображение
         * непосредственно из приватного R2
         */

        const r2Response =
            await s3.send(

                new GetObjectCommand({

                    Bucket:
                        "qian-images",

                    Key:
                        imageKey

                })

            );


        if (!r2Response.Body) {

            throw new Error(
                "Image not found in R2"
            );

        }


        const imageBuffer =
            await streamToBuffer(
                r2Response.Body
            );


        /*
         * 2.
         * Преобразуем изображение
         * в base64
         */

        const imageBase64 =
            imageBuffer.toString(
                "base64"
            );


        /*
         * 3.
         * Отправляем изображение
         * в Cloudflare Workers AI
         */

        const accountId =
            process.env.CF_ACCOUNT_ID;

        const apiToken =
            process.env.CF_API_TOKEN;


        if (
            !accountId ||
            !apiToken
        ) {

            throw new Error(
                "Cloudflare AI credentials are missing"
            );

        }


        const aiResponse =
            await fetch(

                `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/runwayml/stable-diffusion-v1-5-img2img`,

                {

                    method:
                        "POST",

                    headers: {

                        "Authorization":
                            `Bearer ${apiToken}`,

                        "Content-Type":
                            "application/json"

                    },

                    body:
                        JSON.stringify({

                            prompt:
                                prompt,

                            image_b64:
                                imageBase64,

                            strength:
                                0.65,

                            num_steps:
                                20,

                            guidance:
                                7.5

                        })

                }

            );


        /*
         * 4.
         * Получаем ответ
         */

        const aiData =
            await aiResponse.json();


        console.log(
            "Cloudflare AI:",
            aiData
        );


        if (
            !aiResponse.ok ||
            !aiData.success
        ) {

            throw new Error(

                aiData.errors?.[0]?.message ||

                "Cloudflare AI generation failed"

            );

        }


        /*
         * 5.
         * Изображение возвращается
         * в формате base64
         */

        let outputBase64;


        if (
            typeof aiData.result ===
            "string"
        ) {

            outputBase64 =
                aiData.result;

        }

        else if (
            aiData.result?.image
        ) {

            outputBase64 =
                aiData.result.image;

        }

        else {

            throw new Error(
                "Unexpected Cloudflare AI response"
            );

        }


        /*
         * 6.
         * Возвращаем результат
         * в формате, который уже
         * понимает наш index.html
         */

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

    catch (error) {

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
