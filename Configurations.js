import dotenv from "dotenv";
dotenv.config({ override: true });

const stripEnv = (val, fallback = "") => {
  if (!val) return fallback;
  return val.split("#")[0].trim() || fallback;
};

// --- PERMISSIONS ---
global.mongodb = process.env.MONGODB_URI || process.env.MONGODB || "mongodb://localhost:27017/atlas";
// Hardcoded fallbacks to ensure Dante always has access
global.owner = process.env.MODS ? process.env.MODS.split(",") : ["2348133453645", "59945378676903"]; 

// --- MODES ---
global.worktype = "public"; 
global.sessionId = stripEnv(process.env.SESSION_ID, "dant");
global.prefa = stripEnv(process.env.PREFIX, ".");
global.packname = stripEnv(process.env.PACKNAME, "Atlas Bot");
global.author = stripEnv(process.env.AUTHOR, "Dante");

export default {
  mongodb: global.mongodb,
  worktype: global.worktype
};
