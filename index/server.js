const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const port = Number(process.env.PORT) || 3000;

const GOOGLE_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbywzDtJ8vKB2Ze1Hkv-Ujl2WIPLiDY5zxhDrprMUuCgy3M7U63057-DZNr4Saoc_gfMPw/exec";

const publicDirectory = __dirname;


// ===============================
// CONTENT TYPES
// ===============================

const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
};


// ===============================
// SEND JSON
// ===============================

function sendJson(response, statusCode, body) {
    response.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*"
    });

    response.end(JSON.stringify(body));
}


// ===============================
// READ REQUEST BODY
// ===============================

function readRequestBody(request) {
    return new Promise((resolve, reject) => {
        let body = "";

        request.on("data", (chunk) => {
            body += chunk;

            if (body.length > 10000) {
                reject(new Error("Request body is too large"));
                request.destroy();
            }
        });

        request.on("end", () => resolve(body));
        request.on("error", reject);
    });
}


// ===============================
// SEND TO GOOGLE SHEET
// ===============================

function sendToGoogleSheet(data) {
    return new Promise((resolve, reject) => {
        const url = new URL(GOOGLE_SCRIPT_URL);
        const postData = JSON.stringify(data);

        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(postData)
            }
        };

        const googleRequest = https.request(options, (googleResponse) => {
            let responseData = "";

            googleResponse.on("data", (chunk) => {
                responseData += chunk;
            });

            googleResponse.on("end", () => {
                if (
                    googleResponse.statusCode >= 200 &&
                    googleResponse.statusCode < 400
                ) {
                    resolve(responseData);
                } else {
                    reject(
                        new Error(
                            `Google Sheet request failed: ${googleResponse.statusCode}`
                        )
                    );
                }
            });
        });

        googleRequest.on("error", reject);

        googleRequest.write(postData);
        googleRequest.end();
    });
}


// ===============================
// SERVE FILES
// ===============================

function serveStaticFile(request, response) {

    let urlPath;

    try {
        urlPath = decodeURIComponent(request.url.split("?")[0]);
    } catch (error) {
        response.writeHead(400, {
            "Content-Type": "text/plain; charset=utf-8"
        });

        response.end("Invalid file path");
        return;
    }

    // Home page
    if (urlPath === "/") {
        urlPath = "/index.html";
    }

    // Prevent accessing files outside project folder
    const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");

    const filePath = path.join(
        publicDirectory,
        safePath
    );

    fs.stat(filePath, (statError, stats) => {

        if (statError || !stats.isFile()) {

            response.writeHead(404, {
                "Content-Type": "text/plain; charset=utf-8"
            });

            response.end("File not found");
            return;
        }


        const extension = path.extname(filePath).toLowerCase();

        const contentType =
            contentTypes[extension] ||
            "application/octet-stream";


        fs.readFile(filePath, (error, content) => {

            if (error) {

                response.writeHead(500, {
                    "Content-Type": "text/plain; charset=utf-8"
                });

                response.end("Unable to load file");
                return;
            }


            response.writeHead(200, {
                "Content-Type": contentType
            });

            response.end(content);

        });

    });

}


// ===============================
// SERVER
// ===============================

const server = http.createServer(
    async (request, response) => {

        // CORS
        if (request.method === "OPTIONS") {

            response.writeHead(204, {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
            });

            response.end();
            return;
        }


        // =========================
        // CONSULTATION API
        // =========================

        if (
            request.method === "POST" &&
            request.url === "/api/contact"
        ) {

            try {

                const rawBody =
                    await readRequestBody(request);

                const body =
                    JSON.parse(rawBody);


                const name =
                    typeof body.name === "string"
                        ? body.name.trim()
                        : "";

                const phone =
                    typeof body.phone === "string"
                        ? body.phone.trim()
                        : "";

                const email =
                    typeof body.email === "string"
                        ? body.email.trim()
                        : "";

                const message =
                    typeof body.message === "string"
                        ? body.message.trim()
                        : "";


                if (!name || !phone || !message) {

                    sendJson(response, 400, {
                        status: "error",
                        message:
                            "Name, phone and requirement are required"
                    });

                    return;
                }


                await sendToGoogleSheet({
                    name,
                    phone,
                    email,
                    message
                });


                sendJson(response, 201, {
                    status: "success",
                    message:
                        "Consultation request submitted successfully"
                });

            } catch (error) {

                console.error(
                    "Submission error:",
                    error
                );

                sendJson(response, 500, {
                    status: "error",
                    message:
                        "Unable to submit your request. Please try again."
                });
            }

            return;
        }


        // =========================
        // SERVE WEBSITE + IMAGES
        // =========================

        if (request.method === "GET") {
            serveStaticFile(request, response);
            return;
        }


        // =========================
        // 404
        // =========================

        response.writeHead(404, {
            "Content-Type": "text/plain; charset=utf-8"
        });

        response.end("Not found");

    }
);


// ===============================
// START SERVER
// ===============================

server.listen(port, () => {
    console.log(
        `Website running at http://localhost:${port}`
    );
});