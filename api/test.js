export default async function handler(request, response) {

    if (request.method !== "POST") {
        return response.status(405).json({
            success: false,
            message: "Используйте POST-запрос"
        });
    }

    return response.status(200).json({
        success: true,
        message: "QIAN получил изображение"
    });
}
