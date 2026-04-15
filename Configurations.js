import dotenv from "dotenv";
dotenv.config({ override: true });

const stripEnv = (val, fallback = "") => {
  if (!val) return fallback;
  return val.split("#")[0].trim() || fallback;
};

// --- DATABASE ---
global.mongodb =
  process.env.MONGODB_URI ||
  process.env.MONGODB ||
  "mongodb://localhost:27017/atlas";

// --- OWNER NUMBERS (no spaces, no country code prefix issues) ---
global.owner = process.env.MODS
  ? process.env.MODS.split(",").map((n) => n.trim())
  : ["2348133453645", "59945378676903"];

// ✅ PRIVATE MODE — only owner commands work
global.worktype = "private";

// --- BOT SETTINGS ---
global.sessionId = stripEnv(process.env.SESSION_ID, "atlas_session");
global.prefa = stripEnv(process.env.PREFIX, ".");
global.packname = stripEnv(process.env.PACKNAME, "Atlas Bot");
global.author = stripEnv(process.env.AUTHOR, "Dante");

export default {
  mongodb: global.mongodb,
  worktype: global.worktype,
};
