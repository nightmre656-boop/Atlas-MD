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

// Ensure Cache exists for stickers/media
if (!fs.existsSync(join(__dirname, 'System/Cache'))) {
    fs.mkdirSync(join(__dirname, 'System/Cache'), { recursive: true });
}

fs.writeFileSync(path.join(__dirname, "atlas.pid"), process.pid.toString());

// --- Noise Suppression Logic ---
const _BAILEYS_NOISE_MAP = {
  "Failed to decrypt message": "[ ATLAS ] Signal: failed to decrypt (skipped)",
  "Session error:": "[ ATLAS ] Signal: session error (skipped)",
  "Closing open session": "[ ATLAS ] Signal: rotating session",
  "Closing session:": null,
  "Opening session:": null,
};

const _matchNoise = (str) => {
  for (const [prefix, replacement] of Object.entries(_BAILEYS_NOISE_MAP)) {
    if (str.startsWith(prefix)) return { matched: true, replacement };
  }
  return { matched: false };
};

const _origLog = console.log;
console.log = (...args) => {
  const { matched, replacement } = _matchNoise(String(args[0] ?? ""));
  if (matched) { if (replacement) _origLog(replacement); return; }
  _origLog(...args);
};

import express from "express";
const app = express();
const PORT = process.env.PORT || 10000;
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
    ev.on("contacts.upsert", (contacts) => {
      for (const contact of contacts) {
        store.contacts[contact.id] = contact;
      }
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
  
  console.log(figlet.textSync("ATLAS", { font: "Standard" }));

  const { version } = await fetchLatestBaileysVersion();

  const Atlas = makeWASocket({
    logger: pino({ level: "silent" }),
    browser: ["Ubuntu", "Chrome", "20.0.04"],
    auth: state,
    version,
  });

  AtlasSocket = Atlas;
  store.bind(Atlas.ev);

  // --- PRIVATE MODE & HELPERS ---
  Atlas.public = false; 

  Atlas.decodeJid = (jid) => {
    if (!jid) return jid;
    if (/:\d+@/gi.test(jid)) {
      let decode = jidDecode(jid) || {};
      return (decode.user && decode.server && decode.user + "@" + decode.server) || jid;
    } else return jid;
  };

  Atlas.getName = (jid, withoutContact = false) => {
    let id = Atlas.decodeJid(jid);
    let v = id === "0@s.whatsapp.net" ? { id, name: "WhatsApp" } : 
            id === Atlas.decodeJid(Atlas.user.id) ? Atlas.user : 
            store.contacts[id] || {};
    return (withoutContact ? "" : v.name) || v.subject || v.verifiedName || jid.split('@')[0];
  };

  Atlas.sendText = (jid, text, quoted = "", options) =>
    Atlas.sendMessage(jid, { text: text, ...options }, { quoted });

  Atlas.setStatus = (status) => {
    Atlas.updateProfileStatus(status).catch(() => {});
    return status;
  };

  Atlas.downloadAndSaveMediaMessage = async (message, filename, addExtension = true) => {
    let quoted = message.msg ? message.msg : message;
    let jid = quoted.mtype ? quoted.mtype : quoted.mimetype;
    let extension = jid.split('/')[1];
    let buffer = await downloadMediaMessage(message, 'buffer', {}, {
      logger: pino({ level: 'silent' }),
      reuploadRequest: Atlas.updateMediaMessage
    });
    let pathFile = join(__dirname, `./System/Cache/${filename || Date.now()}.${addExtension ? extension : ''}`);
    fs.writeFileSync(pathFile, buffer);
    return pathFile;
  };

  Atlas.getFile = async (PATH, save) => {
    let res;
    let data = Buffer.isBuffer(PATH) ? PATH : /^data:.*?\/.*?;base64,/i.test(PATH) ? Buffer.from(PATH.split`,`[1], 'base64') : /^https?:\/\//.test(PATH) ? await (res = await got(PATH, { responseType: 'buffer' })).data : fs.existsSync(PATH) ? fs.readFileSync(PATH) : typeof PATH === 'string' ? PATH : Buffer.alloc(0);
    let type = await fileTypeFromBuffer(data) || { mime: 'application/octet-stream', ext: '.bin' };
    let filename = join(__dirname, `./System/Cache/${Date.now()}.${type.ext}`);
    if (data && save) fs.promises.writeFile(filename, data);
    return { res, filename, size: await getSizeMedia(data), ...type, data };
  };

  // --- CONNECTION LOGIC ---
  Atlas.ev.on("creds.update", saveCreds);

  Atlas.ev.on("connection.update", async (update) => {
    const { lastDisconnect, connection, qr } = update;
    if (connection) {
      status = connection;
      console.log(chalk.yellow(`[ ATLAS ] Status: ${connection}`));
    }
    if (qr) {
      QR_GENERATE = qr;
      qrcodeTerminal.generate(qr, { small: true });
    }
    if (connection === "close") {
      let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
      if (reason !== DisconnectReason.loggedOut) startAtlas();
    }
  });

  await readcommands();

  Atlas.ev.on("messages.upsert", async (chatUpdate) => {
    if (chatUpdate.type !== "notify") return;
    const m = serialize(Atlas, chatUpdate.messages[0]);
    
    // Privacy Guard
    const ownerJid = global.owner + "@s.whatsapp.net";
    const isOwner = m.sender === ownerJid || m.key.fromMe;
    if (!Atlas.public && !isOwner) return;

    core(Atlas, m, commands, chatUpdate);
  });
};

startAtlas();

// --- API ROUTES FOR RAILWAY ---
app.get("/", (req, res) => res.send("Bot Active."));
app.get("/api/qr", async (req, res) => {
  if (QR_GENERATE && QR_GENERATE !== "invalid") {
    const qrDataUrl = await qrcode.toDataURL(QR_GENERATE);
    res.send(`<img src="${qrDataUrl}">`);
  } else res.send("Connected or Initializing...");
});

app.listen(PORT);
