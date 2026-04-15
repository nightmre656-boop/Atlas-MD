import "./Configurations.js";
import "./System/BotCharacters.js";
import chalk from "chalk";
import axios from "axios";
import { GoogleGenAI } from "@google/genai";
import { getGeminiConfig, GEMINI_MODEL } from "./System/__system_prompt.js";
import { QuickDB, JSONDriver } from "quick.db";
import Levels from "discord-xp";
import {
  checkBan,
  checkMod,
  getChar,
  checkPmChatbot,
  getBotMode,
  checkBanGroup,
  checkAntilink,
  checkGroupChatbot,
} from "./System/MongoDB/MongoDb_Core.js";

const prefix = global.prefa;
global.Levels = Levels;

export default async (Atlas, m, commands, chatUpdate) => {
  try {
    const jsonDriver = new JSONDriver();
    const db = new QuickDB({ driver: jsonDriver });

    let { type, isGroup, sender, from } = m;

    // --- Body resolution ---
    let body =
      type === "buttonsResponseMessage"
        ? m.message[type].selectedButtonId
        : type === "listResponseMessage"
          ? m.message[type].singleSelectReply.selectedRowId
          : type === "templateButtonReplyMessage"
            ? m.message[type].selectedId
            : m.text;

    let response = body?.startsWith(prefix) ? body : "";

    // --- Metadata ---
    const metadata = m.isGroup ? await Atlas.groupMetadata(from).catch(() => ({})) : {};
    const pushname = m.pushName || "Dante User";
    const participants = m.isGroup ? metadata.participants || [] : [sender];
    const quoted = m.quoted ? m.quoted : m;

    const sanitize = (jid) => {
      if (!jid) return "";
      return jid.split("@")[0].split(":")[0] + "@" + jid.split("@")[1];
    };

    const botNumber = await Atlas.decodeJid(Atlas.user.id);
    const botIdClean = sanitize(botNumber);
    const botLid = Atlas.user?.lid ? sanitize(Atlas.user.lid) : botIdClean;

    // --- Admin Checks ---
    const groupAdmins = m.isGroup
      ? participants.filter((p) => p.admin).map((p) => p.id)
      : [];

    const isBotAdmin = m.isGroup ? groupAdmins.includes(botIdClean) || groupAdmins.includes(botLid) : false;
    const isAdmin = m.isGroup ? groupAdmins.includes(m.sender) : false;

    // --- OWNER & LID RECOGNITION (UNLOCKED) ---
    const ownerDigits = new Set([botIdClean, ...global.owner].map((v) => v.replace(/[^0-9]/g, "")));
    
    // Explicitly allow Dante's LID and Phone Number
    const isCreator = 
      ownerDigits.has(m.sender.replace(/[^0-9]/g, "")) || 
      m.sender.includes("59945378676903") || 
      m.sender.includes("2348133453645");

    const isCmd = body.startsWith(prefix);
    const args = body.trim().split(/ +/).slice(1);
    const text = args.join(" ");
    const inputCMD = body.slice(1).trim().split(/ +/).shift().toLowerCase();

    // --- Command Lookup ---
    const cmdName = inputCMD;
    const cmd = commands.get(cmdName) || Array.from(commands.values()).find((v) => v.alias.includes(cmdName));

    // --- LOGGING ---
    const timeNow = new Date().toLocaleTimeString();
    console.log(chalk.black(chalk.bgCyan(`[ ${timeNow} ]`)) + chalk.bgWhite(" [ EXEC ] ") + chalk.green(`${pushname}: ${body}`));

    // --- BYPASS GATES ---
    if (!cmd) return; // Not a command? Stop.

    // If Dante is the one talking, ignore all "Private Mode" or "Banned" checks
    if (!isCreator) {
        const isbannedUser = await checkBan(m.sender);
        if (isbannedUser) return;
        
        const botWorkMode = await getBotMode();
        if (botWorkMode === "private") return;
    }

    // --- Execute ---
    try {
      await cmd.start(Atlas, m, {
        name: "Atlas",
        metadata,
        pushName: pushname,
        participants,
        body,
        inputCMD,
        args,
        botNumber,
        botLid,
        isCmd,
        isAdmin,
        text,
        isCreator,
        quoted,
        isBotAdmin,
        prefix,
        db,
        command: cmd.name,
        commands
      });
    } catch (err) {
      console.error("Command Error:", err);
    }

  } catch (e) {
    console.error("Core Error:", e);
  }
};
