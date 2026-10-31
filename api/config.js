import { ALLOWED, send } from "./_lib.js";

export default async function handler(req, res) {
  send(res, 200, {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    allowed: ALLOWED,
    devNoAuth: process.env.DEV_NO_AUTH === "1",
    mock: process.env.MOCK_AI === "1",
    driveFolder: process.env.DRIVE_FOLDER_NAME || "럽리브_페이스분석결과지",
  });
}
