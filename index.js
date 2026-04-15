import "./Configurations.js";
import ffmpegStatic from "ffmpeg-static";
process.env.FFMPEG_PATH = ffmpegStatic;
import {
  makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import pino from "pino";
import { Boom } from "@hapi/boom";
import { serialize } from "./System/whatsapp.js";
import express from "express";
import qrcode from "qrcode";
import mongoose from "mongoose";
import chalk from "chalk";
import { readcommands, commands } from "./System/ReadCommands.js";
import core from "./Core.js";

const app = express();
const PORT = process.env.PORT || 8080;

global.worktype = "public";
let QR_GENERATE = null;
let status = "initializing";

const startAtlas = async () => {
  const { default: MongoAuth } = await import("./System/MongoAuth/MongoAuth.js");
  const mongoAuth = new MongoAuth(process.env.SESSION_ID || "atlas_session");
  const { state, saveCreds, clearState } = await mongoAuth.init();
  const { version } = await fetchLatestBaileysVersion();

  const Atlas = makeWASocket({
    logger: pino({ level: "silent" }),
    auth: state,
    version,
    browser: ["Dante-MD", "Chrome", "1.0.0"],
    printQRInTerminal: false,
    // ✅ Optimized for High Latency / Public Groups
    defaultQueryTimeoutMs: 60000, 
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 10000,
    getMessage: async (key) => ({ conversation: "" }),
  });

  Atlas.ev.on("creds.update", saveCreds);

  Atlas.ev.on("connection.update", async (update) => {
    const { lastDisconnect, connection, qr } = update;
    if (qr) { QR_GENERATE = qr; status = "qr"; }
    if (connection === "open") {
      status = "open";
      QR_GENERATE = null;
      console.log(chalk.green.bold("\n[ STATUS ] Dante is Online (PUBLIC MODE) ✓"));
    }
    if (connection === "close") {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (statusCode !== DisconnectReason.loggedOut) {
        startAtlas();
      } else {
        await clearState();
        console.log(chalk.red("[ SESSION EXPIRED ] Scan again."));
      }
    }
  });

  Atlas.ev.on("messages.upsert", async (chatUpdate) => {
    try {
      if (chatUpdate.type !== "notify") return;
      const msg = chatUpdate.messages[0];
      if (!msg || !msg.message || msg.message.protocolMessage) return;

      const m = serialize(Atlas, msg);
      if (!m) return;

      core(Atlas, m, commands, chatUpdate);
    } catch (err) {
      console.log(chalk.red("[ MSG ERROR ] " + err.message));
    }
  });
};

// --- Web QR Logic ---
app.get("/", (req, res) => {
  res.send(`<html><body style="background:#0d1117;color:#58a6ff;font-family:monospace;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;">
    <div style="border:1px solid #30363d;padding:40px;border-radius:12px;background:#161b22;text-align:center;">
    <h1>DANTE-MD PUBLIC</h1><div id="qr">LOADING...</div><p id="st">INITIALIZING</p></div>
    <script>
      async function u(){
        const r=await fetch('/api/qr');const d=await r.json();
        const q=document.getElementById('qr');const s=document.getElementById('st');
        if(d.status==='qr'){q.innerHTML='<img src="'+d.qr+'" style="background:white;padding:10px;border-radius:8px;">';s.innerText='SCAN TO CONNECT';}
        if(d.status==='connected'){q.innerHTML='<h1 style="color:#238636;font-size:5rem;">✔</h1>';s.innerText='ONLINE';}
      } setInterval(u,5000);
    </script></body></html>`);
});

app.get("/api/qr", async (req, res) => {
  if (status === "open") return res.json({ status: "connected" });
  if (!QR_GENERATE) return res.json({ status: "loading" });
  res.json({ status: "qr", qr: await qrcode.toDataURL(QR_GENERATE) });
});

const bootstrap = async () => {
  app.listen(PORT, "0.0.0.0", () => console.log(chalk.cyan(`[ SERVER ] Running on port ${PORT}`)));
  await mongoose.connect(global.mongodb);
  await readcommands();
  await startAtlas();
};
bootstrap();
