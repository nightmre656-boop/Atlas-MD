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

const store = {
    contacts: {},
    messages: {},
    bind(ev) {
        ev.on("contacts.upsert", (contacts) => {
            for (const contact of contacts) store.contacts[contact.id] = contact;
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

    // --- CRITICAL POLYFILLS & FIXES ---
    Atlas.decodeJid = global.decodeJid;
    if (!store.messages) store.messages = {}; 
    store.bind(Atlas.ev);

    // Fix for "Atlas.sendText is not a function"
    Atlas.sendText = async (jid, text, quoted = '', options) => {
        return Atlas.sendMessage(jid, { text: text, ...options }, { quoted });
    };

    // Fix for "Atlas.setStatus is not a function"
    Atlas.setStatus = async (statusText) => {
        try {
            const types = ['unavailable', 'available', 'composing', 'recording', 'paused'];
            if (types.includes(statusText)) return await Atlas.sendPresenceUpdate(statusText);
            return await Atlas.updateProfileStatus(statusText);
        } catch (err) { console.error("setStatus error:", err.message); }
    };

    Atlas.ev.on("creds.update", saveCreds);
    Atlas.serializeM = (m) => smsg(Atlas, m, store);

    Atlas.ev.on("connection.update", async (update) => {
        const { lastDisconnect, connection, qr } = update;
        if (connection) status = connection;
        if (qr) QR_GENERATE = qr;
        if (connection === "open") console.log(chalk.green("[ ATLAS ] Connected Successfully! ✓"));
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
        core(Atlas, m, commands, chatUpdate);
    });
};

// --- WEB DASHBOARD ---
app.get("/", (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Atlas Dashboard</title><style>body{background:#0f172a;color:white;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;}.card{background:#1e293b;padding:2.5rem;border-radius:1.5rem;box-shadow:0 15px 35px rgba(0,0,0,0.4);border:1px solid #334155;}img{background:white;padding:12px;border-radius:12px;margin:25px 0;width:250px;}.status{font-weight:bold;color:#38bdf8;text-transform:uppercase;}</style></head>
        <body><div class="card"><h1>Atlas-MD</h1><div id="qr-container">Loading...</div><p>Status: <span id="stat" class="status">Connecting...</span></p></div>
        <script>async function update(){try{const r=await fetch('/api/qr');const d=await r.json();const c=document.getElementById('qr-container');const s=document.getElementById('stat');if(d.status==='qr'){c.innerHTML='<img src="'+d.qr+'" />';s.innerText='Scan Now';}else if(d.status==='connected'){c.innerHTML='<h1>✅</h1>';s.innerText='Online';}}catch(e){}}setInterval(update,5000);update();</script>
        </body></html>
    `);
});

app.get("/api/qr", async (req, res) => {
    if (status === "open") return res.json({ status: "connected" });
    if (QR_GENERATE === "invalid") return res.json({ status: "loading" });
    const qrDataUrl = await qrcode.toDataURL(QR_GENERATE);
    res.json({ status: "qr", qr: qrDataUrl });
});

const bootstrap = async () => {
    console.log(figlet.textSync("ATLAS-MD", { font: "Small" }));
    try { await mongoose.connect(mongodb); console.log(chalk.green(`[ ATLAS ] MongoDB connected ✓`)); } 
    catch (err) { console.error(chalk.red(`[ ERROR ] MongoDB: ${err.message}`)); }
    await installPlugin();
    await readcommands();
    await startAtlas();
};

bootstrap();
app.listen(PORT, () => console.log(chalk.yellow(`[ SERVER ] Running on port ${PORT}`)));
