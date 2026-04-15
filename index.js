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

// --- GLOBAL SETTINGS ---
global.worktype = "public"; 
commands.prefix = global.prefa;

let QR_GENERATE = "invalid";
let status = "initializing";
const mongodb = global.mongodb;

global.decodeJid = (jid) => {
    if (!jid) return jid;
    if (/:\d+@/gi.test(jid)) {
        const decode = jidDecode(jid) || {};
        return (decode.user && decode.server && decode.user + "@" + decode.server) || jid;
    }
    return jid;
};

// --- STORE FIX: SAFE MESSAGE HANDLING ---
const store = {
    contacts: {},
    messages: {},
    bind(ev) {
        ev.on("contacts.upsert", (contacts) => {
            for (const contact of contacts) store.contacts[contact.id] = contact;
        });
        ev.on("messages.upsert", ({ messages }) => {
            const m = messages[0];
            if (!m.message) return;
            const jid = m.key.remoteJid;
            if (!store.messages) store.messages = {}; 
            if (!store.messages[jid]) store.messages[jid] = [];
            store.messages[jid].push(m);
        });
    },
};

async function installPlugin() {
    try {
        const plugins = await getPluginURLs();
        for (const url of plugins) {
            const name = url.split("/").pop();
            const { body } = await got(url);
            fs.writeFileSync(join(__dirname, "Plugins", name), body);
        }
    } catch (e) { console.log(chalk.red("[ PLUGIN ERROR ] " + e.message)); }
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

    Atlas.decodeJid = global.decodeJid;
    store.bind(Atlas.ev);

    // --- CORE ATTACHMENTS ---
    Atlas.setStatus = async (st) => {
        try { return await Atlas.updateProfileStatus(st); } catch { return await Atlas.sendPresenceUpdate(st); }
    };

    Atlas.sendText = async (jid, text, quoted = '', options) => {
        return Atlas.sendMessage(jid, { text: text, ...options }, { quoted });
    };

    Atlas.downloadMediaMessage = async (m) => {
        return await downloadMediaMessage(m, 'buffer', {}, { logger: pino({ level: 'silent' }) });
    };

    Atlas.ev.on("creds.update", saveCreds);
    Atlas.serializeM = (m) => smsg(Atlas, m, store);

    Atlas.ev.on("connection.update", async (update) => {
        const { lastDisconnect, connection, qr } = update;
        if (connection) status = connection;
        if (qr) QR_GENERATE = qr;
        if (connection === "open") console.log(chalk.green("[ STATUS ] Dante is Online ✓"));
        if (connection === "close") {
            const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
            if (statusCode !== DisconnectReason.loggedOut) startAtlas();
            else { await clearState(); startAtlas(); }
        }
    });

    Atlas.ev.on("messages.upsert", async (chatUpdate) => {
        if (chatUpdate.type !== "notify") return;
        const msg = chatUpdate.messages[0];
        if (!msg.message || msg.message.protocolMessage) return;

        const m = serialize(Atlas, msg);
        
        // --- THE DANTE MASTER CHECK (LID & JID SUPPORT) ---
        const isDante = m.sender.includes("59945378676903") || m.sender.includes("2348133453645") || msg.key.fromMe;
        
        if (isDante) {
            global.worktype = "public"; // Force unlock
            console.log(chalk.green(`[ COMMAND ] Executing: ${m.body}`));
            core(Atlas, m, commands, chatUpdate);
        }
    });
};

// --- WEB INTERFACE ---
app.get("/", (req, res) => {
    res.send(`<html><body style="background:#000;color:white;text-align:center;padding-top:100px;font-family:sans-serif;"><h1>Atlas-MD Dante</h1><div id="q"></div><script>async function u(){const r=await fetch('/api/qr');const d=await r.json();const q=document.getElementById('q');if(d.status==='qr')q.innerHTML='<img src="'+d.qr+'" style="background:white;padding:10px;"/>';else if(d.status==='connected')q.innerHTML='<h1 style="color:lime">ONLINE ✓</h1>';}setInterval(u,5000);u();</script></body></html>`);
});

app.get("/api/qr", async (req, res) => {
    if (status === "open") return res.json({ status: "connected" });
    if (QR_GENERATE === "invalid") return res.json({ status: "loading" });
    res.json({ status: "qr", qr: await qrcode.toDataURL(QR_GENERATE) });
});

const bootstrap = async () => {
    app.listen(PORT, () => console.log(chalk.yellow(`[ PORT ] Listening on ${PORT}`)));
    console.log(figlet.textSync("DANTE", { font: "Small" }));
    try { await mongoose.connect(mongodb); } catch (e) {}
    await installPlugin();
    await readcommands();
    await startAtlas();
};

bootstrap();
