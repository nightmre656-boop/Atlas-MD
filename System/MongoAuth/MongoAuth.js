import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { useMultiFileAuthState, BufferJSON } from "@whiskeysockets/baileys";
import { sessionSchema } from "./Schema/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// All local sessions live under System/session/<sessionId>/
const SESSION_BASE_DIR = path.join(__dirname, "..", "session");

// Reverse of the old MongoAuth KEY_MAP — maps storage keys back to Baileys key type names
const LEGACY_KEY_TYPE_MAP = {
  preKeys: "pre-key",
  sessions: "session",
  senderKeys: "sender-key",
  appStateSyncKeys: "app-state-sync-key",
  appStateVersions: "app-state-sync-version",
  senderKeyMemory: "sender-key-memory",
};

export default class MongoAuth {
  /**
   * @param {string} sessionId
   */
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.dir = path.join(SESSION_BASE_DIR, sessionId);
  }

  /**
   * Initialize auth state using local → MongoDB → QR priority.
   * Returns { state, saveCreds, clearState } for makeWASocket.
   */
  async init() {
    const localExists = await this._localExists();

    if (!localExists) {
      const mongoExists = await this._mongoExists();
      if (mongoExists) {
        console.log(
          `[ ATLAS ] Session not found locally — downloading from MongoDB...`
        );
        await this._downloadToLocal();
        console.log(`[ ATLAS ] Session restored from MongoDB.`);
      }
      // else: neither local nor MongoDB — empty dir triggers QR scan
    }

    await fs.promises.mkdir(this.dir, { recursive: true });

    const { state, saveCreds: saveCredsLocal } = await useMultiFileAuthState(this.dir);

    // Wrap saveCreds so a MongoDB push happens immediately after every creds save.
    // This ensures the session is in MongoDB right after the first QR scan.
    // The periodic GC sync acts as a safety net for key file changes that
    // don't trigger creds.update (e.g. pre-keys being consumed).
    const saveCreds = async () => {
      await saveCredsLocal();
      await this.pushToMongoDB().catch((err) =>
        console.error(`[ ATLAS ] MongoDB session sync error: ${err.message}`)
      );
    };

    const clearState = async () => {
      await this._clearSession();
    };

    return { state, saveCreds, clearState };
  }

  /**
   * Push all local session files to MongoDB.
   * Called by the periodic background sync (GC interval).
   */
  async pushToMongoDB() {
    const localExists = await this._localExists();
    if (!localExists) return;

    let entries;
    try {
      entries = await fs.promises.readdir(this.dir);
    } catch {
      return;
    }

    const files = {};
    for (const entry of entries) {
      const filePath = path.join(this.dir, entry);
      try {
        const stat = await fs.promises.stat(filePath);
        if (stat.isFile()) {
          const content = await fs.promises.readFile(filePath);
          files[entry] = content.toString("base64");
        }
      } catch {
        // skip unreadable files
      }
    }

    if (Object.keys(files).length === 0) return;

    await sessionSchema.updateOne(
      { sessionId: this.sessionId },
      { $set: { files, lastSync: new Date() } },
      { upsert: true }
    );
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  async _localExists() {
    const credsPath = path.join(this.dir, "creds.json");
    try {
      await fs.promises.access(credsPath);
      return true;
    } catch {
      return false;
    }
  }

  async _mongoExists() {
    try {
      const doc = await sessionSchema.findOne({ sessionId: this.sessionId });
      if (!doc) return false;
      // New format: files map
      if (doc.files && Object.keys(doc.files).length > 0) return true;
      // Legacy format: single session JSON blob
      if (doc.session && doc.session.length > 0) return true;
      return false;
    } catch {
      return false;
    }
  }

  async _downloadToLocal() {
    const doc = await sessionSchema.findOne({ sessionId: this.sessionId });
    if (!doc) return;

    // ── Legacy format migration ──────────────────────────────────────────
    // Old MongoAuth stored { creds, keys } as a single JSON string in doc.session.
    // useMultiFileAuthState expects individual files: creds.json + {type}-{id}.json.
    if (doc.session && !doc.files) {
      await this._migrateLegacySession(doc.session);
      return;
    }

    // ── New format ───────────────────────────────────────────────────────
    if (!doc.files) return;
    await fs.promises.mkdir(this.dir, { recursive: true });
    for (const [filename, base64Content] of Object.entries(doc.files)) {
      const filePath = path.join(this.dir, filename);
      await fs.promises.writeFile(
        filePath,
        Buffer.from(base64Content, "base64")
      );
    }
  }

  /**
   * Convert the old single-blob session format into individual files that
   * useMultiFileAuthState can read, then push the new format to MongoDB.
   * @param {string} legacySessionString  The old `session` field value
   */
  async _migrateLegacySession(legacySessionString) {
    let parsed;
    try {
      parsed = JSON.parse(legacySessionString, BufferJSON.reviver);
    } catch (err) {
      console.error(`[ ATLAS ] Failed to parse legacy session blob: ${err.message}`);
      return;
    }

    await fs.promises.mkdir(this.dir, { recursive: true });

    // Write creds.json
    if (parsed.creds) {
      await fs.promises.writeFile(
        path.join(this.dir, "creds.json"),
        JSON.stringify(parsed.creds, BufferJSON.replacer)
      );
    }

    // Write individual key files — each key gets its own {type}-{id}.json file
    const keys = parsed.keys || {};
    for (const [storageKey, baileyType] of Object.entries(LEGACY_KEY_TYPE_MAP)) {
      const keyData = keys[storageKey];
      if (!keyData || typeof keyData !== "object") continue;
      for (const [id, value] of Object.entries(keyData)) {
        await fs.promises.writeFile(
          path.join(this.dir, `${baileyType}-${id}.json`),
          JSON.stringify(value, BufferJSON.replacer)
        );
      }
    }

    console.log(
      `[ ATLAS ] Legacy session migrated to new file-based format.`
    );

    // Overwrite the MongoDB document with the new files format
    await this.pushToMongoDB();
  }

  async _clearSession() {
    // Remove local session directory
    await fs.promises.rm(this.dir, { recursive: true, force: true });

    // Remove MongoDB entry
    try {
      await sessionSchema.deleteOne({ sessionId: this.sessionId });
    } catch {
      // Non-fatal — local is already cleared
    }

    console.log(`[ ATLAS ] Session cleared from local storage and MongoDB.`);
    console.log(
      `[ ATLAS ] Please update SESSION_ID in your .env file before restarting.`
    );
  }
}
