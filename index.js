import "./Configurations.js";
import ffmpegStatic from "ffmpeg-static";
process.env.FFMPEG_PATH = ffmpegStatic;
import {
  makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidDecode,
  downloadMediaMessage,
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
commands.prefix = global.prefa;

let QR_GENERATE = "invalid";
let status = "initializing";
const mongodb = global.mongodb;

// --- GLOBAL JID DECODER ---
global.decodeJid = (jid) => {
    if (!jid) return jid;
    if (/:\d+@/gi.test(jid)) {
        const decode = jidDecode(jid) || {};
        return (decode.user && decode.server && decode.user + "@" + decode.server) || jid;
    }
    return jid;
};

// --- INITIALIZE STORE PROPERLY ---
const store = {
    contacts: {},
    messages: {}, // This must be an empty object
    bind(ev) {
        ev.on("contacts.upsert", (contacts) => {
            for (const contact of contacts) store.contacts[contact.id] = contact;
        });
        // Fix for the 'set' error:
        ev.on("messages.upsert", ({ messages }) => {
            const m = messages[0];
            if (!m.message) return;
            const jid = m.key.remoteJid;
            if (!store.messages[jid]) store.messages[jid] = [];
            store.messages[jid].push(m);
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
    } catch (e) { console.log(chalk.red("[ ATLAS ] Plugin error: " + e.message)); }
}

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
        printQRInTerminal: true,
    });

    // --- ATTACH UTILITIES ---
    Atlas.decodeJid = global.decodeJid;
    store.bind(Atlas.ev);

    Atlas.downloadMediaMessage = async (message) => {
        return await downloadMediaMessage(message, 'buffer', {}, { 
            logger: pino({ level: 'silent' }),
            reuploadRequest: Atlas.updateMediaMessage 
        });
    };

    Atlas.sendText = async (jid, text, quoted = '', options) => {
        return Atlas.sendMessage(jid, { text: text, ...options }, { quoted });
    };

    Atlas.ev.on("creds.update", saveCreds);
    Atlas.serializeM = (m) => smsg(Atlas, m, store);

    Atlas.ev.on("connection.update", async (update) => {
        const { lastDisconnect, connection, qr } = update;
        if (connection) status = connection;
        if (qr) QR_GENERATE = qr;
        if (connection === "open") console.log(chalk.green("[ ATLAS ] Connected! ✓"));
        if (connection === "close") {
            const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
            if (statusCode !== DisconnectReason.loggedOut) startAtlas();
            else { await clearState(); startAtlas(); }
        }
    });

    Atlas.ev.on("messages.upsert", async (chatUpdate) => {
        if (chatUpdate.type !== "notify") return;
        const msg = chatUpdate.messages[0];
        if (!msg.message) return;

        const m = serialize(Atlas, msg);
        
        // --- DANTE'S OWNER CHECK ---
        const isFromMe = msg.key.fromMe;
        const isOwner = global.owner.some(num => m.sender.includes(num.trim()));
        
        // Let it run if it's from YOU or your OWNER number
        if (isFromMe || isOwner) {
            core(Atlas, m, commands, chatUpdate);
        }
    });
};

// --- DASHBOARD UI ---
app.get("/", (req, res) => {
    res.send(`<html><body style="background:#0f172a;color:white;text-align:center;font-family:sans-serif;padding-top:100px;"><h1>Atlas-MD Dante</h1><div id="q">Loading...</div><script>async function u(){const r=await fetch('/api/qr');const d=await r.json();const q=document.getElementById('q');if(d.status==='qr')q.innerHTML='<img src="'+d.qr+'" style="background:white;padding:10px;border-radius:10px;"/>';else if(d.status==='connected')q.innerHTML='<h1 style="color:#22c55e">✅ ONLINE</h1>';}setInterval(u,5000);u();</script></body></html>`);
});

app.get("/api/qr", async (req, res) => {
    if (status === "open") return res.json({ status: "connected" });
    if (QR_GENERATE === "invalid") return res.json({ status: "loading" });
    res.json({ status: "qr", qr: await qrcode.toDataURL(QR_GENERATE) });
});

const bootstrap = async () => {
    console.log(figlet.textSync("ATLAS-MD", { font: "Small" }));
    try { await mongoose.connect(mongodb); } catch (e) {}
    await installPlugin();
    await readcommands();
    await startAtlas();
};

bootstrap();
app.listen(PORT);
