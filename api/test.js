export default async function handler(request, response) {

    if (request.method !== "POST") {
        return response.status(405).json({
            success: false,
            message: "Используйте POST-запрос"
        });
    }

    const contentType = request.headers["content-type"] || "";

    const hasImage = contentType.includes("multipart/form-data");

    return response.status(200).json({
        success: true,
        imageReceived: hasImage,
        message: hasImage
            ? "QIAN получил фотографию"
            : "QIAN получил запрос без фотографии"
    });
}
