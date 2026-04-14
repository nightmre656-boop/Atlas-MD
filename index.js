import "./Configurations.js";
import ffmpegStatic from "ffmpeg-static";
process.env.FFMPEG_PATH = ffmpegStatic;
import {
  makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidDecode,
  useMultiFileAuthState,
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
import qrcodeTerminal from "qrcode-terminal";
import mongoose from "mongoose";
import chalk from "chalk";
import { readcommands, commands } from "./System/ReadCommands.js";
import core from "./Core.js";
import { getPluginURLs } from "./System/MongoDB/MongoDb_Core.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
const PORT = process.env.PORT || 8080;
commands.prefix = global.prefa;

// Try multiple possible env var names
const mongodb = process.env.MONGODB_URI || process.env.MONGO_URL || process.env.MONGODB_URL;
const USE_MONGO = !!mongodb;

if (!USE_MONGO) {
  console.warn(chalk.yellow("[ ATLAS ] MONGODB_URI not set. Using file-based auth (session will NOT survive restarts)."));
} else {
  console.log(chalk.green("[ ATLAS ] MongoDB URI found, persistent session enabled."));
}

let QR_GENERATE = "invalid";
let status = "initializing";
let AtlasSocket = null;

global.lidToJidMap = new Map();

const decodeJid = (jid) => {
  if (!jid) return jid;
  if (/:\d+@/gi.test(jid)) {
    const decode = jidDecode(jid) || {};
    return (decode.user && decode.server && decode.user + "@" + decode.server) || jid;
  }
  return jid;
};

const store = {
  contacts: {},
  messages: {},
  bind(ev) {
    ev.on("contacts.upsert", (contacts) => {
      for (const contact of contacts) store.contacts[contact.id] = contact;
    });
    ev.on("messages.upsert", ({ messages }) => {
      for (const msg of messages) {
        if (!msg.key?.remoteJid) continue;
        const jid = msg.key.remoteJid;
        if (!store.messages[jid]) store.messages[jid] = {};
        store.messages[jid][msg.key.id] = msg;
      }
    });
  },
};

async function installPlugin() {
  console.log(chalk.cyan(`[ ATLAS ] Checking plugins...`));
  try {
    const plugins = await getPluginURLs();
    for (const url of plugins) {
      const name = url.split("/").pop();
      const { body } = await got(url);
      fs.writeFileSync(join(__dirname, "Plugins", name), body);
    }
  } catch (e) {
    console.log(chalk.red("[ ATLAS ] Plugin install error: " + e.message));
  }
}

let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30000;

function getReconnectDelay() {
  const delay = Math.min(2000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
  reconnectAttempts++;
  return delay;
}

let saveCredsFn = null;

async function getAuthState() {
  if (USE_MONGO) {
    try {
      const { default: MongoAuth } = await import("./System/MongoAuth/MongoAuth.js");
      const sessionId = process.env.SESSION_ID || "atlas_session";
      const mongoAuth = new MongoAuth(sessionId);
      const { state, saveCreds, clearState } = await mongoAuth.init();
      saveCredsFn = saveCreds;
      return { state, clearState };
    } catch (err) {
      console.error(chalk.red("[ ATLAS ] Failed to load MongoAuth, falling back to file-based."));
      // Fallback to file-based
      const { state, saveCreds } = await useMultiFileAuthState("session");
      saveCredsFn = saveCreds;
      return { state, clearState: async () => {
        const sessionPath = join(process.cwd(), "session");
        if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
      }};
    }
  } else {
    const { state, saveCreds } = await useMultiFileAuthState("session");
    saveCredsFn = saveCreds;
    return { state, clearState: async () => {
      const sessionPath = join(process.cwd(), "session");
      if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
    }};
  }
}

const startAtlas = async () => {
  const { state, clearState } = await getAuthState();
  const { version } = await fetchLatestBaileysVersion();

  const Atlas = makeWASocket({
    logger: pino({ level: "silent" }),
    auth: state,
    version,
    browser: ["Ubuntu", "Chrome", "20.0.04"],
    printQRInTerminal: true,
    keepAliveIntervalMs: 25000,
  });

  Atlas.decodeJid = decodeJid;
  AtlasSocket = Atlas;

  store.bind(Atlas.ev);
  Atlas.ev.on("creds.update", saveCredsFn);
  Atlas.serializeM = (m) => smsg(Atlas, m, store);

  Atlas.ev.on("connection.update", async (update) => {
    const { lastDisconnect, connection, qr } = update;

    if (connection) {
      status = connection;
      console.log(chalk.cyan(`[ ATLAS ] Server Status => ${connection}`));
    }

    if (qr) {
      QR_GENERATE = qr;
      qrcodeTerminal.generate(qr, { small: true });
    }

    if (connection === "open") {
      reconnectAttempts = 0;
      console.log(chalk.green("[ ATLAS ] Connected Successfully! ✓"));
    }

    if (connection === "close") {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const reason = lastDisconnect?.error?.message || "Unknown";
      console.log(chalk.red(`[ ATLAS ] Disconnected — Code: ${statusCode} | Reason: ${reason}`));

      if (statusCode === DisconnectReason.loggedOut) {
        console.log(chalk.red("[ ATLAS ] Logged out. Clearing session..."));
        await clearState();
        reconnectAttempts = 0;
        startAtlas();
        return;
      }

      if (statusCode === DisconnectReason.forbidden || statusCode === DisconnectReason.badSession) {
        console.log(chalk.red("[ ATLAS ] Fatal disconnect. Manual intervention required."));
        return;
      }

      const delay = getReconnectDelay();
      console.log(chalk.yellow(`[ ATLAS ] Reconnecting in ${delay / 1000}s... (attempt ${reconnectAttempts})`));
      setTimeout(() => startAtlas(), delay);
    }
  });

  Atlas.ev.on("messages.upsert", async (chatUpdate) => {
    if (chatUpdate.type !== "notify") return;
    const msg = chatUpdate.messages[0];
    if (!msg.message) return;

    if (typeof Atlas.decodeJid !== "function") Atlas.decodeJid = decodeJid;

    const m = serialize(Atlas, msg);
    core(Atlas, m, commands, chatUpdate);
  });
};

const bootstrap = async () => {
  if (USE_MONGO) {
    try {
      await mongoose.connect(mongodb);
      console.log(chalk.green(`[ ATLAS ] MongoDB connected ✓`));
    } catch (err) {
      console.error(chalk.red(`[ ERROR ] MongoDB: ${err.message}`));
      console.log(chalk.yellow("[ ATLAS ] Continuing without MongoDB persistence."));
    }
  }

  console.log(figlet.textSync("ATLAS-MD", { font: "Small" }));

  await installPlugin();
  await readcommands();
  await startAtlas();
};

bootstrap();

app.get("/api/status", (req, res) => res.json({ status }));

app.get("/api/qr", async (req, res) => {
  if (status === "open") return res.json({ status: "connected" });
  if (QR_GENERATE === "invalid") return res.json({ status: "loading" });
  const qrDataUrl = await qrcode.toDataURL(QR_GENERATE);
  res.json({ status: "qr", qr: qrDataUrl });
});

app.listen(PORT, () =>
  console.log(chalk.yellow(`[ SERVER ] Running on port ${PORT}`))
);
