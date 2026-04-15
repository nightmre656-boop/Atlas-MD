import "./Configurations.js";
import ffmpegStatic from "ffmpeg-static";
process.env.FFMPEG_PATH = ffmpegStatic;
import {
  makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidDecode,
} from "@whiskeysockets/baileys";
import fs from "fs";
import figlet from "figlet";
import pino from "pino";
import { Boom } from "@hapi/boom";
import { serialize } from "./System/whatsapp.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import got from "got";
import express from "express";
import qrcode from "qrcode";
import mongoose from "mongoose";
import chalk from "chalk";
import { readcommands, commands } from "./System/ReadCommands.js";
import core from "./Core.js";
import { getPluginURLs } from "./System/MongoDB/MongoDb_Core.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
const PORT = process.env.PORT || 8080;

// ✅ Global Worktype Set to Public
global.worktype = "public";
commands.prefix = global.prefa;

let QR_GENERATE = null;
let status = "initializing";
const mongodb = global.mongodb;

const startAtlas = async () => {
  const { default: MongoAuth } = await import("./System/MongoAuth/MongoAuth.js");
  const mongoAuth = new MongoAuth(process.env.SESSION_ID || "atlas_session");
  const { state, saveCreds, clearState } = await mongoAuth.init();
  const { version } = await fetchLatestBaileysVersion();

  const Atlas = makeWASocket({
    logger: pino({ level: "silent" }),
    auth: state,
    version,
    browser: ["Ubuntu", "Chrome", "20.0.04"],
    printQRInTerminal: false,
    getMessage: async (key) => ({ conversation: "" }),
  });

  Atlas.ev.on("creds.update", saveCreds);

  Atlas.ev.on("connection.update", async (update) => {
    const { lastDisconnect, connection, qr } = update;

    if (qr) {
      QR_GENERATE = qr;
      status = "qr";
      console.log(chalk.yellow("[ QR ] New QR Generated. Waiting for scan..."));
    }

    if (connection === "open") {
      status = "open";
      QR_GENERATE = null;
      console.log(chalk.green("[ STATUS ] Dante is Online (PUBLIC MODE) ✓"));
    }

    if (connection === "close") {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      status = "closed";
      QR_GENERATE = null;
      if (statusCode !== DisconnectReason.loggedOut) {
        console.log(chalk.yellow("[ RECONNECTING ]..."));
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

      // ✅ Send to Core for processing
      core(Atlas, m, commands, chatUpdate);
    } catch (err) {
      console.log(chalk.red("[ MSG ERROR ] " + err.message));
    }
  });
};

// --- QR INTERFACE ---
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>DANTE | Deployment</title>
      <style>
        body { background: #0d1117; color: #58a6ff; font-family: monospace; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .container { text-align: center; border: 1px solid #30363d; padding: 40px; border-radius: 12px; background: #161b22; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        #qr-box { background: white; padding: 15px; border-radius: 8px; margin: 20px auto; min-width: 200px; min-height: 200px; display: flex; align-items: center; justify-content: center; }
        .loader { border: 4px solid #21262d; border-top: 4px solid #238636; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>DANTE-MD CORE</h1>
        <div id="qr-box"><div class="loader"></div></div>
        <p id="stText" style="font-weight:bold;">INITIALIZING SYSTEM...</p>
      </div>
      <script>
        async function poll() {
          try {
            const r = await fetch('/api/qr');
            const d = await r.json();
            const qb = document.getElementById('qr-box');
            const st = document.getElementById('stText');
            if (d.status === 'qr') {
              st.innerText = 'WAITING FOR SCAN';
              st.style.color = '#e3b341';
              qb.innerHTML = '<img src="' + d.qr + '" style="display:block;">';
            } else if (d.status === 'connected') {
              st.innerText = 'CONNECTION STABLISHED';
              st.style.color = '#238636';
              qb.innerHTML = '<h1 style="color:#238636;font-size:4rem;">✔</h1>';
            }
          } catch(e) {}
        }
        setInterval(poll, 3000); poll();
      </script>
    </body>
    </html>
  `);
});

app.get("/api/qr", async (req, res) => {
  if (status === "open") return res.json({ status: "connected" });
  if (!QR_GENERATE) return res.json({ status: "loading" });
  try { 
    res.json({ status: "qr", qr: await qrcode.toDataURL(QR_GENERATE) }); 
  } catch { 
    res.json({ status: "error" }); 
  }
});

const bootstrap = async () => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(chalk.cyan(`[ SERVER ] Running on port ${PORT}`));
  });

  try {
    await mongoose.connect(mongodb);
    console.log(chalk.green("[ DB ] MongoDB Connected ✓"));
    await readcommands();
    await startAtlas();
  } catch (e) {
    console.error(chalk.red("[ CRITICAL ERROR ]"), e);
  }
};

bootstrap();
