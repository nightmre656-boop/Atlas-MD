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

// Global Variables
let QR_GENERATE = "invalid";
let status = "initializing";
const mongodb = process.env.MONGODB_URI;

// --- CRITICAL: GLOBAL JID DECODER ---
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

// --- PLUGIN INSTALLER ---
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

// --- BOT MAIN ENGINE ---
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

    // Attach polyfills & store
    Atlas.decodeJid = global.decodeJid;
    store.bind(Atlas.ev);

    // --- POLYFILL FOR setStatus ERROR ---
    Atlas.setStatus = async (statusText) => {
        try {
            const presenceTypes = ['unavailable', 'available', 'composing', 'recording', 'paused'];
            if (presenceTypes.includes(statusText)) {
                return await Atlas.sendPresenceUpdate(statusText);
            }
            return await Atlas.updateProfileStatus(statusText);
        } catch (err) {
            console.error("[ ATLAS ] setStatus polyfill error:", err.message);
        }
    };

    Atlas.ev.on("creds.update", saveCreds);
    Atlas.serializeM = (m) => smsg(Atlas, m, store);

    Atlas.ev.on("connection.update", async (update) => {
        const { lastDisconnect, connection, qr } = update;
        if (connection) status = connection;
        if (qr) QR_GENERATE = qr;

        if (connection === "open") {
            console.log(chalk.green("[ ATLAS ] Connected Successfully! ✓"));
        }

        if (connection === "close") {
            const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
            if (statusCode !== DisconnectReason.loggedOut) {
                startAtlas();
            } else {
                await clearState();
                startAtlas();
            }
        }
    });

    Atlas.ev.on("messages.upsert", async (chatUpdate) => {
        if (chatUpdate.type !== "notify") return;
        const msg = chatUpdate.messages[0];
        if (!msg.message) return;
        if (typeof Atlas.decodeJid !== "function") Atlas.decodeJid = global.decodeJid;
        const m = serialize(Atlas, msg);
        core(Atlas, m, commands, chatUpdate);
    });
};

// --- WEB DASHBOARD ROUTES ---
app.get("/", (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Atlas Dashboard</title>
            <style>
                body { background: #0f172a; color: white; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
                .card { background: #1e293b; padding: 2.5rem; border-radius: 1.5rem; box-shadow: 0 15px 35px rgba(0,0,0,0.4); border: 1px solid #334155; max-width: 400px; }
                img { background: white; padding: 12px; border-radius: 12px; margin: 25px 0; width: 250px; }
                .status { font-weight: bold; color: #38bdf8; text-transform: uppercase; letter-spacing: 1px; }
                h1 { margin: 0; color: #f8fafc; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>Atlas-MD</h1>
                <div id="qr-container">Loading QR Code...</div>
                <p>Status: <span id="stat" class="status">Connecting...</span></p>
            </div>
            <script>
                async function update() {
                    try {
                        const r = await fetch('/api/qr');
                        const d = await r.json();
                        const c = document.getElementById('qr-container');
                        const s = document.getElementById('stat');
                        if(d.status === 'qr') {
                            c.innerHTML = '<img src="'+d.qr+'" />';
                            s.innerText = 'Scan with WhatsApp';
                        } else if(d.status === 'connected') {
                            c.innerHTML = '<h1 style="font-size:5rem">✅</h1>';
                            s.innerText = 'Bot is Online!';
                        }
                    } catch(e) {}
                }
                setInterval(update, 5000); update();
            </script>
        </body>
        </html>
    `);
});

app.get("/api/qr", async (req, res) => {
    if (status === "open") return res.json({ status: "connected" });
    if (QR_GENERATE === "invalid") return res.json({ status: "loading" });
    const qrDataUrl = await qrcode.toDataURL(QR_GENERATE);
    res.json({ status: "qr", qr: qrDataUrl });
});

// --- BOOTSTRAP ---
const bootstrap = async () => {
    console.log(figlet.textSync("ATLAS-MD", { font: "Small" }));
    if (!mongodb) {
        console.error(chalk.red("[ ERROR ] MONGODB_URI is missing in Railway Variables!"));
        process.exit(1);
    }
    try {
        await mongoose.connect(mongodb);
        console.log(chalk.green(`[ ATLAS ] MongoDB connected ✓`));
    } catch (err) {
        console.error(chalk.red(`[ ERROR ] MongoDB Connection: ${err.message}`));
    }
    await installPlugin();
    await readcommands();
    await startAtlas();
};

bootstrap();
app.listen(PORT, () => console.log(chalk.yellow(`[ SERVER ] Web Running on port ${PORT}`)));
