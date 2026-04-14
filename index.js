import "./Configurations.js";
import ffmpegStatic from "ffmpeg-static";
process.env.FFMPEG_PATH = ffmpegStatic;
import {
  makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadContentFromMessage,
  downloadMediaMessage,
  jidDecode,
} from "@whiskeysockets/baileys";
import MongoAuth from "./System/MongoAuth/MongoAuth.js";
import fs from "fs";
import figlet from "figlet";
import { join } from "path";
import got from "got";
import pino from "pino";
import path from "path";
import { fileTypeFromBuffer } from "file-type";
import { Boom } from "@hapi/boom";
import { serialize, WAConnection } from "./System/whatsapp.js";
import { smsg, getBuffer, getSizeMedia } from "./System/Function2.js";
import { fileURLToPath } from "url";
import { dirname } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

fs.writeFileSync(path.join(__dirname, "atlas.pid"), process.pid.toString());

// Map of noise prefixes → clean replacement line
const _BAILEYS_NOISE_MAP = {
  "Failed to decrypt message with any known session": "[ ATLAS ] Signal: failed to decrypt (session key mismatch — skipped)",
  "Session error:": "[ ATLAS ] Signal: session error (Bad MAC — skipped)",
  "Closing open session in favor of incoming prekey bundle": "[ ATLAS ] Signal: rotating session (new prekey bundle received)",
  "Closing session:": null,
  "Opening session:": null,
};

const _matchNoise = (str) => {
  for (const [prefix, replacement] of Object.entries(_BAILEYS_NOISE_MAP)) {
    if (str.startsWith(prefix)) return { matched: true, replacement };
  }
  return { matched: false };
};

// Console Patches
const _origLog = console.log;
console.log = (...args) => {
  const first = String(args[0] ?? "");
  const { matched, replacement } = _matchNoise(first);
  if (matched) { if (replacement) _origLog(replacement); return; }
  _origLog(...args);
};

const _origErr = console.error;
console.error = (...args) => {
  const first = String(args[0] ?? "");
  const { matched, replacement } = _matchNoise(first);
  if (matched) { if (replacement) _origLog(replacement); return; }
  _origErr(...args);
};

import express from "express";
const app = express();
const PORT = global.port;
import welcomeLeft from "./System/Welcome.js";
import { readcommands, commands } from "./System/ReadCommands.js";
import core from "./Core.js";
commands.prefix = global.prefa;
import mongoose from "mongoose";
import qrcode from "qrcode";
import qrcodeTerminal from "qrcode-terminal";
import { getPluginURLs, checkAntidelete, checkMod } from "./System/MongoDB/MongoDb_Core.js";
import chalk from "chalk";

app.use(express.json());
global.lidToJidMap = new Map();

const store = {
  contacts: {},
  messages: {},
  bind(ev) {
    let _lidLogTimer = null;
    ev.on("contacts.upsert", (contacts) => {
      for (const contact of contacts) {
        store.contacts[contact.id] = contact;
        const phoneJid = contact.id?.endsWith("@s.whatsapp.net") ? contact.id : null;
        const lidJid = contact.id?.endsWith("@lid") ? contact.id : contact.lid?.endsWith("@lid") ? contact.lid : null;
        if (phoneJid && lidJid) {
          global.lidToJidMap.set(lidJid, phoneJid);
          global.lidToJidMap.set(phoneJid, lidJid);
        }
      }
      clearTimeout(_lidLogTimer);
      _lidLogTimer = setTimeout(() => {
        if (global.lidToJidMap.size > 0) _origLog(`[ ATLAS ] LID map ready: ${global.lidToJidMap.size / 2} contact(s) mapped`);
      }, 300);
    });
    ev.on("messages.upsert", ({ messages }) => {
      for (const msg of messages) {
        if (!msg.key?.remoteJid || !msg.key?.id) continue;
        const jid = msg.key.remoteJid;
        if (!store.messages[jid]) store.messages[jid] = {};
        store.messages[jid][msg.key.id] = msg;
      }
    });
  },
  loadMessage: async (jid, id) => store.messages[jid]?.[id],
};

let QR_GENERATE = "invalid";
let status = "initializing";
let AtlasSocket = null;
let mongoAuth;

const startAtlas = async () => {
  try {
    await mongoose.connect(mongodb);
    console.log(chalk.green(`[ ATLAS ] MongoDB connected ✓`));
  } catch (err) {
    console.error(chalk.redBright(`[ EXCEPTION ] MongoDB error: ${err.message}`));
  }
  
  mongoAuth = new MongoAuth(sessionId);
  const { state, saveCreds, clearState } = await mongoAuth.init();
  
  console.log(figlet.textSync("ATLAS", { font: "Standard", width: 70 }));

  const pkg = JSON.parse(fs.readFileSync("./package.json", "utf8"));
  global.botVersion = pkg.version;

  await installPlugin();
  const { version } = await fetchLatestBaileysVersion();

  const Atlas = makeWASocket({
    logger: pino({ level: "silent" }),
    browser: ["Ubuntu", "Chrome", "20.0.04"],
    auth: state,
    version,
    keepAliveIntervalMs: 25_000,
  });

  // CRITICAL FIX: Define decodeJid BEFORE store.bind or events trigger
  Atlas.decodeJid = (jid) => {
    if (!jid) return jid;
    if (/:\d+@/gi.test(jid)) {
      let decode = jidDecode(jid) || {};
      return (decode.user && decode.server && decode.user + "@" + decode.server) || jid;
    } else return jid;
  };

  AtlasSocket = Atlas; 
  store.bind(Atlas.ev);
  Atlas.public = true;

  async function installPlugin() {
    console.log(chalk.cyan(`[ ATLAS ] Checking plugins...`));
    let plugins = [];
    try { plugins = await getPluginURLs(); } catch (err) {}
    if (plugins.length) {
      for (const pluginUrl of plugins) {
        try {
          const { body, statusCode } = await got(pluginUrl);
          if (statusCode == 200) {
            const fileName = path.basename(pluginUrl);
            const filePath = path.join("Plugins", fileName);
            fs.writeFileSync(filePath, body);
          }
        } catch (error) {}
      }
    }
  }

  await readcommands();

  Atlas.ev.on("creds.update", saveCreds);
  Atlas.serializeM = (m) => smsg(Atlas, m, store);

  Atlas.ev.on("connection.update", async (update) => {
    const { lastDisconnect, connection, qr } = update;
    if (connection) {
      status = connection;
      console.info(`[ ATLAS ] Server Status => ${connection}`);
    }

    if (connection === "close") {
      let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
      if (reason === DisconnectReason.loggedOut || reason === DisconnectReason.badSession) {
        await clearState();
        startAtlas();
      } else {
        startAtlas();
      }
    }
    if (qr) {
      QR_GENERATE = qr;
      status = "qr";
      qrcodeTerminal.generate(qr, { small: true });
    }
  });

  Atlas.ev.on("messages.upsert", async (chatUpdate) => {
    if (chatUpdate.type !== "notify") return;
    const msg = chatUpdate.messages?.[0];
    if (!msg || !msg.message) return;
    const m = serialize(Atlas, msg);
    if (m.key?.remoteJid === "status@broadcast") return;
    core(Atlas, m, commands, chatUpdate);
  });

  // Helper Methods
  Atlas.getName = (jid, withoutContact = false) => {
    let id = Atlas.decodeJid(jid);
    let v = id === Atlas.decodeJid(Atlas.user.id) ? Atlas.user : store.contacts[id] || {};
    return (withoutContact ? "" : v.name) || v.subject || v.verifiedName || jid.split('@')[0];
  };

  Atlas.sendText = (jid, text, quoted = "", options) =>
    Atlas.sendMessage(jid, { text: text, ...options }, { quoted });

};

startAtlas();

// Web Server Endpoints
app.use("/", express.static(join(__dirname, "Frontend")));
app.get("/api/status", (req, res) => res.json({ status }));
app.get("/api/qr", async (req, res) => {
  if (status === "open") return res.json({ status: "connected" });
  if (!QR_GENERATE || QR_GENERATE === "invalid") return res.json({ status: "waiting" });
  const qrDataUrl = await qrcode.toDataURL(QR_GENERATE);
  res.json({ status: "qr", qr: qrDataUrl });
});

app.listen(PORT, () => console.log(`[ ATLAS ] GUI Server running on port ${PORT}`));
