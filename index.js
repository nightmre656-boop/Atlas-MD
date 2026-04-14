import "./Configurations.js";
import ffmpegStatic from "ffmpeg-static";
process.env.FFMPEG_PATH = ffmpegStatic;
import {
  makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidDecode,
} from "@whiskeysockets/baileys";
import MongoAuth from "./System/MongoAuth/MongoAuth.js";
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

let QR_GENERATE = "invalid";
let status = "initializing";
let AtlasSocket = null;

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

const startAtlas = async () => {
  try {
    await mongoose.connect(mongodb);
    console.log(chalk.green(`[ ATLAS ] MongoDB connected ✓`));
  } catch (err) {
    console.error(chalk.red(`[ ERROR ] MongoDB: ${err.message}`));
  }

  const mongoAuth = new MongoAuth(sessionId);
  const { state, saveCreds, clearState } = await mongoAuth.init();
  const { version } = await fetchLatestBaileysVersion();

  console.log(figlet.textSync("ATLAS-MD", { font: "Small" }));

  const Atlas = makeWASocket({
    logger: pino({ level: "silent" }),
    auth: state,
    version,
    browser: ["Ubuntu", "Chrome", "20.0.04"],
    printQRInTerminal: false
  });

  // Attach decoder immediately
  Atlas.decodeJid = (jid) => {
    if (!jid) return jid;
    if (/:\d+@/gi.test(jid)) {
      let decode = jidDecode(jid) || {};
      return (decode.user && decode.server && decode.user + "@" + decode.server) || jid;
    } else return jid;
  };

  AtlasSocket = Atlas;
  store.bind(Atlas.ev);

  // Install and Read Commands
  await installPlugin();
  await readcommands();

  Atlas.ev.on("creds.update", saveCreds);
  Atlas.serializeM = (m) => smsg(Atlas, m, store);

  Atlas.ev.on("connection.update", async (update) => {
    const { lastDisconnect, connection, qr } = update;
    if (connection) status = connection;
    if (qr) {
      QR_GENERATE = qr;
      qrcodeTerminal.generate(qr, { small: true });
    }
    if (connection === "close") {
      let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
      if (reason === DisconnectReason.loggedOut) await clearState();
      startAtlas();
    }
    if (connection === "open") console.log(chalk.green("[ ATLAS ] Connected Successfully!"));
  });

  Atlas.ev.on("messages.upsert", async (chatUpdate) => {
    if (chatUpdate.type !== "notify") return;
    const msg = chatUpdate.messages[0];
    if (!msg.message || !Atlas.decodeJid) return;
    const m = serialize(Atlas, msg);
    core(Atlas, m, commands, chatUpdate);
  });

  async function installPlugin() {
    console.log(chalk.cyan(`[ ATLAS ] Checking plugins...`));
    try {
      let plugins = await getPluginURLs();
      for (const url of plugins) {
        const name = url.split('/').pop();
        const { body } = await got(url);
        fs.writeFileSync(join(__dirname, "Plugins", name), body);
      }
    } catch (e) {
      console.log(chalk.red("[ ATLAS ] Plugin install error: " + e.message));
    }
  }
};

startAtlas();

app.get("/api/status", (req, res) => res.json({ status }));
app.get("/api/qr", async (req, res) => {
  if (status === "open") return res.json({ status: "connected" });
  if (QR_GENERATE === "invalid") return res.json({ status: "loading" });
  const qrDataUrl = await qrcode.toDataURL(QR_GENERATE);
  res.json({ status: "qr", qr: qrDataUrl });
});
app.listen(PORT, () => console.log(`[ SERVER ] Running on port ${PORT}`));
