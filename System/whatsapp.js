import pkg from "@whiskeysockets/baileys";
const { jidNormalizedUser, getContentType, extractMessageContent, proto } = pkg;

export const serialize = (Atlas, m) => {
  if (!m) return m;
  let M = proto.WebMessageInfo;
  m = M.create(m);
  
  if (m.key) {
    m.from = jidNormalizedUser(m.key.remoteJid);
    m.fromMe = m.key.fromMe;
    m.id = m.key.id;
    m.isGroup = m.from.endsWith("@g.us");
    m.sender = jidNormalizedUser(m.fromMe ? Atlas.user.id : (m.key.participant || m.from));
  }

  if (m.message) {
    m.type = getContentType(m.message);
    m.message = extractMessageContent(m.message);
    m.msg = m.message[m.type];
    m.body = m.message?.conversation || m.msg?.text || m.msg?.caption || m.message?.extendedTextMessage?.text || "";
    m.prefix = global.prefa || "!";
    m.pushName = m.pushName || "User";
  }

  // ✅ Stable Reply Shortcut
  m.reply = async (text) => {
    return Atlas.sendMessage(m.from, { text: text }, { quoted: m });
  };
  
  return m;
};
