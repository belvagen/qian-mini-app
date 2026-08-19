import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import Busboy from "busboy";
import crypto from "crypto";

export const config = {
    api: {
        bodyParser: false,
    },
};

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

        const busboy = Busboy({
            headers: request.headers,
        });

        let uploadPromise = null;

        busboy.on(
            "file",
            (fieldname, file, info) => {

                const {
                    filename,
                    mimeType,
                } = info;

                if (!mimeType.startsWith("image/")) {

                    file.resume();

                    return;
                }

                const extension =
                    filename.includes(".")
                        ? filename.split(".").pop()
                        : "jpg";

                const uniqueName =
                    `uploads/${Date.now()}-${crypto.randomUUID()}.${extension}`;

                uploadPromise =
                    new Promise((resolve, reject) => {

                        const chunks = [];

                        file.on("data", (chunk) => {
                            chunks.push(chunk);
                        });

                        file.on("end", async () => {

                            try {

                                const buffer =
                                    Buffer.concat(chunks);

                                await s3.send(
                                    new PutObjectCommand({
                                        Bucket: "qian-images",
                                        Key: uniqueName,
                                        Body: buffer,
                                        ContentType: mimeType,
                                    })
                                );

                                resolve({
                                    key: uniqueName,
                                    size: buffer.length,
                                    type: mimeType,
                                });

                            } catch (error) {

                                reject(error);

                            }

                        });

                        file.on("error", reject);

                    });
            }
        );

        busboy.on("error", (error) => {
            throw error;
        });

        request.pipe(busboy);

        const result = await new Promise(
            (resolve, reject) => {

                busboy.on("finish", async () => {

                    try {

                        if (!uploadPromise) {

                            reject(
                                new Error(
                                    "Изображение не найдено"
                                )
                            );

                            return;
                        }

                        resolve(
                            await uploadPromise
                        );

                    } catch (error) {

                        reject(error);

                    }

                });

            }
        );

        return response.status(200).json({

            success: true,

            message: "Фото сохранено в QIAN",

            file: result,

        });

    } catch (error) {

        console.error(
            "R2 upload error:",
            error
        );

        return response.status(500).json({

            success: false,

            message:
                "Не удалось сохранить фотографию",

        });

    }
}
