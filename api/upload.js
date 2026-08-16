export const config = {
    api: {
        bodyParser: false,
    },
};

export default async function handler(request, response) {

    if (request.method !== "POST") {
        return response.status(405).json({
            success: false,
            message: "Используйте POST-запрос"
        });
    }

    const contentType =
        request.headers["content-type"] || "";

    if (!contentType.includes("multipart/form-data")) {
        return response.status(400).json({
            success: false,
            message: "Файл не передан"
        });
    }

    let totalBytes = 0;

    request.on("data", (chunk) => {
        totalBytes += chunk.length;
    });

    request.on("end", () => {

        return response.status(200).json({
            success: true,
            message: "QIAN получил файл",
            bytesReceived: totalBytes
        });

    });

    request.on("error", () => {

        return response.status(500).json({
            success: false,
            message: "Ошибка получения файла"
        });

    });
}
