import http from "node:http";
import { Firestore } from "@google-cloud/firestore";
import { createHandlers } from "./src/handlers.js";
import { createFirestoreStore } from "./src/store.js";

const PORT = process.env.PORT || 8080;
const SERVER_SECRET = process.env.SERVER_SECRET;
const DAILY_LIMIT = Number(process.env.DAILY_LIMIT || 500);

if (!SERVER_SECRET) {
  throw new Error("SERVER_SECRET env var is required");
}

const store = createFirestoreStore(new Firestore());
const { handleTokenRequest, handleAnswerRequest } = createHandlers({
  secret: SERVER_SECRET,
  dailyLimit: DAILY_LIMIT,
  store,
});

const ROUTES = {
  "/analytics/token": handleTokenRequest,
  "/analytics/answer": handleAnswerRequest,
};

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  const handler = req.method === "POST" ? ROUTES[req.url] : undefined;
  if (!handler) {
    sendJson(res, 404, { error: "not found" });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const { status, body: responseBody } = await handler(body);
    sendJson(res, status, responseBody);
  } catch (err) {
    // Never let a parse error or unexpected failure surface to the client -
    // analytics submission must fail silently. See ANALYTICS.md.
    console.error(err);
    sendJson(res, 200, {});
  }
});

server.listen(PORT, () => {
  console.log(`memory-game-analytics listening on ${PORT}`);
});
