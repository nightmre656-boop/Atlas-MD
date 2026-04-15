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
import { smsg } from "./System/Function2.js";
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

// ✅ Set to Public
global.worktype = "public";
commands.prefix = global.prefa;

const OWNER_NUMBERS = ["59945378676903", "2348133453645"];

let QR_GENERATE = "invalid";
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
    getMessage: async (key) => {
      return { conversation: "" };
    },
  });

  Atlas.ev.on("creds.update", saveCreds);

  Atlas.ev.on("connection.update", async (update) => {
    const { lastDisconnect, connection, qr } = update;
    if (connection) status = connection;
    if (qr) QR_GENERATE = qr;
    
    if (connection === "open") {
      console.log(chalk.green("[ STATUS ] Dante is Online (PUBLIC MODE) ✓"));
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

      // ✅ PUBLIC LOGIC: We no longer return if !isOwner
      // The Core.js will handle specific permission checks for commands
      core(Atlas, m, commands, chatUpdate);

    } catch (err) {
      console.log(chalk.red("[ MSG ERROR ] " + err.message));
    }
  });
};

// Web UI Logic
app.get("/", (req, res) => {
  res.send(`<html><body style="background:#000;color:#0f0;text-align:center;font-family:monospace;"><h1>ATLAS-MD PUBLIC</h1><div id="qr"></div><script>async function update(){const r=await fetch('/api/qr');const d=await r.json();if(d.status==='qr')document.getElementById('qr').innerHTML='<img src="'+d.qr+'" style="background:white;padding:10px;"/>';if(d.status==='connected')document.getElementById('qr').innerHTML='<h2>ONLINE</h2>';}setInterval(update,5000);update();</script></body></html>`);
});

app.get("/api/qr", async (req, res) => {
  if (status === "open") return res.json({ status: "connected" });
  try { res.json({ status: "qr", qr: await qrcode.toDataURL(QR_GENERATE) }); } catch { res.json({ status: "loading" }); }
});

const bootstrap = async () => {
  app.listen(PORT, "0.0.0.0");
  await mongoose.connect(mongodb);
  await readcommands();
  await startAtlas();
};

bootstrap();
