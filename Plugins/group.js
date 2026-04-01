import fs from "fs";
import { Jimp } from "jimp";
import moment from "moment-timezone";
import {
  setWelcome,
  checkWelcome,
  delWelcome,
  setAntilink,
  checkAntilink,
  delAntilink,
  setGroupChatbot,
  checkGroupChatbot,
  delGroupChatbot,
} from "../System/MongoDB/MongoDb_Core.js";

const mergedCommands = [
  "admins",
  "admin",
  "setgcname",
  "delete",
  "antilink",
  "welcome",
  "del",
  "demote",
  "gclink",
  "grouplink",
  "group",
  "gc",
  "groupinfo",
  "gcinfo",
  "hidetag",
  "htag",
  "leave",
  "promote",
  "remove",
  "revoke",
  "setgcdesc",
  "setppgc",
  "tagall",
  "chatbotgc",
];

export default {
  name: "groupanagement",
  alias: [...mergedCommands],
  uniquecommands: [
    "admins",
    "setgcname",
    "delete",
    "demote",
    "gclink",
    "antilink",
    "welcome",
    "group",
    "gc",
    "gcinfo",
    "tagall",
    "hidetag",
    "leave",
    "promote",
    "remove",
    "revoke",
    "setgcdesc",
    "setppgc",
    "chatbotgc",
  ],
  description: "All Group Management Commands",
  start: async (
    Atlas,
    m,
    {
      inputCMD,
      text,
      prefix,
      doReact,
      args,
      itsMe,
      participants,
      metadata,
      mentionByTag,
      mime,
      isMedia,
      quoted,
      botNumber,
      isBotAdmin,
      groupAdmin,
      isAdmin,
    }
  ) => {
    const messageSender = m.sender;
    const quotedsender = m.quoted ? m.quoted.sender : mentionByTag[0];
    switch (inputCMD) {
      case "admins":
      case "admin": {
        let message;
        if (!isMedia) {
          message = m.quoted ? m.quoted.msg : "『 *Attention Admins* 』";
        } else {
          message = "『 *Attention Admins* 』\n\n*🎀 Message:* Check this Out !";
        }
        await doReact("🏅");
        Atlas.sendMessage(m.from, { text: message, mentions: groupAdmin }, { quoted: m });
        break;
      }

      case "setgcname": {
        if (!isAdmin) {
          await doReact("❌");
          return m.reply(`*You* must be *Admin* in order to use this Command!`);
        }
        if (!isBotAdmin) {
          await doReact("❌");
          return m.reply(`*Bot* must be *Admin* in order to use this Command!`);
        }
        if (!text) {
          await doReact("❔");
          return m.reply(
            `Please provide a new group name !\n\nExample: *${prefix}setgcname Bot Testing*`
          );
        }
        await doReact("🎐");
        const oldGCName = metadata.subject;
        let ppgc;
        try {
          ppgc = await Atlas.profilePictureUrl(m.from, "image");
        } catch {
          ppgc = botImage1;
        }
        try {
          await Atlas.groupUpdateSubject(m.from, text);
          await Atlas.sendMessage(
            m.from,
            {
              image: { url: ppgc, mimetype: "image/jpeg" },
              caption: `*『 Group Name Updated 』*\n\n_🔶 Old Name:_\n*${oldGCName}*\n\n_🔷 New Name:_\n*${text}*\n`,
            },
            { quoted: m }
          );
        } catch (err) {
          await m.reply(`Failed to update group name: ${err.message}`);
        }
        break;
      }

      case "delete":
      case "del": {
        if (!isAdmin) {
          await doReact("❌");
          return m.reply(`*You* must be *Admin* in order to use this Command!`);
        }
        if (!m.quoted) {
          await doReact("❔");
          return m.reply(`Please *Reply* to a message to delete it !`);
        }
        if (!isBotAdmin) {
          if (!m.quoted.sender.includes(botNumber)) {
            await doReact("❌");
            return m.reply(
              `Sorry, Without *Admin* permission, I can only delete my own messages !`
            );
          }
          const key = { remoteJid: m.from, fromMe: true, id: m.quoted.id };
          await doReact("📛");
          await Atlas.sendMessage(m.from, { delete: key });
        } else {
          if (!isAdmin) {
            await doReact("❌");
            return m.reply(`Sorry, only *Admins* can delete other's messages !`);
          }
          const key = {
            remoteJid: m.from,
            fromMe: false,
            id: m.quoted.id,
            participant: m.quoted.sender,
          };
          await Atlas.sendMessage(m.from, { delete: key });
        }
        break;
      }

      case "demote": {
        if (!isAdmin) {
          await doReact("❌");
          return m.reply(`*You* must be *Admin* in order to use this Command!`);
        }
        if (!isBotAdmin) {
          await doReact("❌");
          return m.reply(`*Bot* must be *Admin* in order to use this Command!`);
        }
        if (quotedsender.includes(m.sender)) {
          await doReact("❌");
          return m.reply(`You can't demote yourself !`);
        }
        if (quotedsender.includes(botNumber)) {
          await doReact("❌");
          return m.reply(`Sorry, I can't demote myself !`);
        }
        if (!text && !m.quoted) {
          await doReact("❔");
          return m.reply(`Please tag an user to *Demote*!`);
        }
        const mentionedUser = m.quoted ? m.quoted.sender : mentionByTag[0];
        const userId = mentionedUser || m.msg.contextInfo.participant;
        if (!groupAdmin.includes(userId)) {
          return Atlas.sendMessage(
            m.from,
            {
              text: `@${mentionedUser.split("@")[0]} Senpai is not an *Admin* of this group!`,
              mentions: [mentionedUser],
            },
            { quoted: m }
          );
        }
        await doReact("📉");
        try {
          await Atlas.groupParticipantsUpdate(m.from, [userId], "demote");
          await Atlas.sendMessage(
            m.from,
            {
              text: `Sorry @${mentionedUser.split("@")[0]} Senpai, you have been *Demoted* by @${messageSender.split("@")[0]} !`,
              mentions: [mentionedUser, messageSender],
            },
            { quoted: m }
          );
        } catch (error) {
          await doReact("❌");
          await Atlas.sendMessage(
            m.from,
            {
              text: `An error occured while trying to demote @${mentionedUser.split("@")[0]} Senpai !\n\n*Error:* ${error}`,
              mentions: [mentionedUser],
            },
            { quoted: m }
          );
        }
        break;
      }

      case "gclink":
      case "grouplink": {
        if (!isBotAdmin) {
          await doReact("❌");
          return m.reply(`*Bot* must be *Admin* in order to use this Command!`);
        }
        await doReact("🧩");
        const link = await Atlas.groupInviteCode(m.from);
        const linkcode = `https://chat.whatsapp.com/${link}`;
        let ppgc;
        try {
          ppgc = await Atlas.profilePictureUrl(m.from, "image");
        } catch {
          ppgc = botImage1;
        }
        try {
          await Atlas.sendMessage(
            m.from,
            {
              image: { url: ppgc, mimetype: "image/jpeg" },
              caption: `\n_🎀 Group Name:_ *${metadata.subject}*\n\n_🧩 Group Link:_\n${linkcode}\n`,
            },
            { quoted: m }
          );
        } catch (err) {
          await Atlas.sendMessage(m.from, { text: `Failed to fetch group link: ${err.message}` }, { quoted: m });
        }
        break;
      }

      case "group":
      case "gc": {
        if (!isAdmin) {
          await doReact("❌");
          return m.reply(`*You* must be *Admin* in order to use this Command!`);
        }
        if (!isBotAdmin) {
          await doReact("❌");
          return m.reply(`*Bot* must be *Admin* in order to use this Command!`);
        }
        await doReact("⚜️");
        if (text === "close") {
          await Atlas.groupSettingUpdate(m.from, "announcement");
          await m.reply(`Group has been closed!`);
        } else if (text === "open") {
          await Atlas.groupSettingUpdate(m.from, "not_announcement");
          await m.reply(`Group has been opened!`);
        } else {
          await Atlas.sendMessage(
            m.from,
            {
              image: { url: botImage2 },
              caption: `\n*「 Group Message Settings 」*\n\nSelect an option below.\n\n*_Usage:_*\n\n*${prefix}group open*\n*${prefix}group close*\n`,
            },
            { quoted: m }
          );
        }
        break;
      }

      case "groupinfo":
      case "gcinfo": {
        if (!m.isGroup) {
          await doReact("❌");
          return m.reply(`This command can only be used in groups!`);
        }
        await doReact("🎊");
        let ppgc;
        try {
          ppgc = await Atlas.profilePictureUrl(m.from, "image");
        } catch {
          ppgc = botImage1;
        }
        const groupParticipants = m.isGroup ? await metadata.participants : "";
        const groupAdmins = m.isGroup
          ? groupParticipants.filter((v) => v.admin !== null).map((v) => v.id)
          : "";
        const desc = metadata.desc ? metadata.desc : "No Description";
        const txt = `                 *『 Group Info 』*\n\n_🎀 Group Name:_ *${
          metadata.subject
        }*\n\n_🧩 Group Description:_\n${desc}\n\n_👑 Group Owner:_ @${
          metadata.owner.split("@")[0]
        }\n_💫 Group Created on:_ *${moment(`${metadata.creation}` * 1000)
          .tz("Asia/Kolkata")
          .format("DD/MM/YYYY")}*\n_📛 Total Admins:_ *${
          groupAdmins.length
        }*\n_🎈 Total Participants:_ *${metadata.participants.length}*\n`;

        await Atlas.sendMessage(
          m.from,
          {
            image: { url: ppgc, mimetype: "image/jpeg" },
            caption: txt,
            mentions: [metadata.owner],
          },
          { quoted: m }
        );
        break;
      }

      case "hidetag":
      case "htag": {
        if (!isAdmin) {
          await doReact("❌");
          return m.reply(`*You* must be *Admin* in order to use this Command!`);
        }
        let message2;
        if (!isMedia) {
          message2 = m.quoted
            ? m.quoted.msg
            : args[0]
            ? args.join(" ")
            : "『 *Attention Everybody* 』";
        } else {
          message2 = "『 *Attention Everybody* 』\n\n*🎀 Message:* Check this Out !";
        }
        await doReact("🎌");
        Atlas.sendMessage(
          m.from,
          { text: message2, mentions: participants.map((a) => a.id) },
          { quoted: m }
        );
        break;
      }

      case "leave": {
        if (!isAdmin) {
          await doReact("❌");
          return m.reply(`*You* must be *Admin* in order to use this Command!`);
        }
        await doReact("👋");
        try {
          await Atlas.sendMessage(m.from, {
            image: { url: "https://wallpapercave.com/wp/wp9667218.png" },
            caption: `I'm Leaving this group on request... \n\nTake care everyone :)`,
            mentions: participants.map((a) => a.id),
            quoted: m,
          });
          await Atlas.groupLeave(m.from);
        } catch (e) {
          await Atlas.sendMessage(m.from, { text: `An error occurred !` }, { quoted: m });
        }
        break;
      }

      case "promote": {
        if (!isAdmin) {
          await doReact("❌");
          return m.reply(`*You* must be *Admin* in order to use this Command!`);
        }
        if (!isBotAdmin) {
          await doReact("❌");
          return m.reply(`*Bot* must be *Admin* in order to use this Command!`);
        }
        if (quotedsender.includes(m.sender)) {
          await doReact("❌");
          return m.reply(`You are already an *Admin* of this group!`);
        }
        if (quotedsender.includes(botNumber)) {
          await doReact("❌");
          return m.reply(`I am already an *Admin* of this group!`);
        }
        if (!text && !m.quoted) {
          await doReact("❔");
          return m.reply(`Please tag an user to *Promote*!`);
        }
        const mentionedUser = m.quoted ? m.quoted.sender : mentionByTag[0];
        const userId = mentionedUser || m.msg.contextInfo.participant;
        if (groupAdmin.includes(userId)) {
          return Atlas.sendMessage(
            m.from,
            {
              text: `@${mentionedUser.split("@")[0]} Senpai is already an *Admin* of this group!`,
              mentions: [mentionedUser],
            },
            { quoted: m }
          );
        }
        await doReact("💹");
        try {
          await Atlas.groupParticipantsUpdate(m.from, [userId], "promote");
          await Atlas.sendMessage(
            m.from,
            {
              text: `Congratulations @${mentionedUser.split("@")[0]} Senpai 🥳, you have been *Promoted* by @${messageSender.split("@")[0]} !`,
              mentions: [mentionedUser, messageSender],
            },
            { quoted: m }
          );
        } catch (error) {
          await Atlas.sendMessage(
            m.from,
            {
              text: `An error occured while trying to promote @${mentionedUser.split("@")[0]} Senpai !\n\n*Error:* ${error}`,
              mentions: [mentionedUser],
            },
            { quoted: m }
          );
        }
        break;
      }

      case "remove": {
        if (!isAdmin) {
          await doReact("❌");
          return m.reply(`*You* must be *Admin* in order to use this Command!`);
        }
        if (!isBotAdmin) {
          await doReact("❌");
          return m.reply(`*Bot* must be *Admin* in order to use this Command!`);
        }
        if (quotedsender.includes(m.sender)) {
          await doReact("❌");
          return m.reply(`You cannot *Remove* yourself from this group !`);
        }
        if (quotedsender.includes(botNumber)) {
          await doReact("❌");
          return m.reply(`I cannot *Remove* myself from this group !`);
        }
        if (!text && !m.quoted) {
          await doReact("❔");
          return Atlas.sendMessage(m.from, { text: `Please tag a user to *Remove* !` }, { quoted: m });
        }
        const mentionedUser = m.quoted ? m.quoted.sender : mentionByTag[0];
        const users = mentionedUser || m.msg.contextInfo.participant;
        await doReact("⛔");
        if (groupAdmin.includes(users)) {
          return Atlas.sendMessage(
            m.from,
            {
              text: `*Command Rejected !* @${mentionedUser.split("@")[0]} Senpai is an *Admin* of this group so you are not allowed to remove him !`,
              mentions: [mentionedUser],
            },
            { quoted: m }
          );
        }
        try {
          await Atlas.groupParticipantsUpdate(m.from, [users], "remove");
          await Atlas.sendMessage(
            m.from,
            {
              text: `@${mentionedUser.split("@")[0]} has been *Removed* Successfully from *${metadata.subject}*`,
              mentions: [mentionedUser],
            },
            { quoted: m }
          );
        } catch (err) {
          await m.reply(`Failed to remove user: ${err.message}`);
        }
        break;
      }

      case "setppgc": {
        if (!isAdmin) {
          await doReact("❌");
          return m.reply(`*You* must be *Admin* in order to use this Command!`);
        }
        if (!isBotAdmin) {
          await doReact("❌");
          return m.reply(`*Bot* must be *Admin* in order to use this Command!`);
        }
        if (!/image/.test(mime)) {
          await doReact("❌");
          return Atlas.sendMessage(
            m.from,
            {
              text: `Send/reply Image With Caption ${prefix + "setgcpp"} to change the Profile Pic of this group.`,
            },
            { quoted: m }
          );
        }
        await doReact("🎴");
        const quotedimage = await Atlas.downloadAndSaveMediaMessage(quoted);
        const { preview } = await generatePP(quotedimage);
        await Atlas.query({
          tag: "iq",
          attrs: { to: m.from, type: "set", xmlns: "w:profile:picture" },
          content: [{ tag: "picture", attrs: { type: "image" }, content: preview }],
        });
        fs.unlinkSync(quotedimage);
        let ppgc;
        try {
          ppgc = await Atlas.profilePictureUrl(m.from, "image");
        } catch {
          ppgc = botImage1;
        }
        Atlas.sendMessage(
          m.from,
          {
            image: { url: ppgc },
            caption: `\nGroup Profile Picture has been updated Successfully by @${messageSender.split("@")[0]} !`,
            mentions: [messageSender],
          },
          { quoted: m }
        );
        break;
      }

      case "setgcdesc": {
        if (!isAdmin) {
          await doReact("❌");
          return m.reply(`*You* must be *Admin* in order to use this Command!`);
        }
        if (!isBotAdmin) {
          await doReact("❌");
          return m.reply(`*Bot* must be *Admin* in order to use this Command!`);
        }
        if (!text && !m.quoted) {
          await doReact("❔");
          return Atlas.sendMessage(m.from, { text: `Please provide a new group description !` }, { quoted: m });
        }
        await doReact("📑");
        let ppgc;
        try {
          ppgc = await Atlas.profilePictureUrl(m.from, "image");
        } catch {
          ppgc = botImage1;
        }
        const newGCdesc = m.quoted ? m.quoted.msg : text;
        try {
          await Atlas.groupUpdateDescription(m.from, newGCdesc);
          await Atlas.sendMessage(
            m.from,
            {
              image: { url: ppgc, mimetype: "image/jpeg" },
              caption: `*『 Group Description Changed 』*\n\n_🧩 New Description:_\n*${newGCdesc}*`,
            },
            { quoted: m }
          );
        } catch (err) {
          await m.reply(`Failed to update description: ${err.message}`);
        }
        break;
      }

      case "revoke": {
        if (!isAdmin) {
          await doReact("❌");
          return m.reply(`*You* must be *Admin* in order to use this Command!`);
        }
        if (!isBotAdmin) {
          await doReact("❌");
          return m.reply(`*Bot* must be *Admin* in order to use this Command!`);
        }
        if (m.from == "120363040838753957@g.us") {
          await doReact("❌");
          return m.reply(
            "Sorry, this command is not allowed in *Atlas Support Group* !\n\nYou are not allowed to change support group link !"
          );
        }
        await doReact("💫");
        try {
          await Atlas.groupRevokeInvite(m.from);
          await Atlas.sendMessage(m.from, { text: `Group link has been *Updated* Successfully!` }, { quoted: m });
        } catch (err) {
          await m.reply(`Failed to revoke link: ${err.message}`);
        }
        break;
      }

      case "tagall": {
        if (!isAdmin) {
          await doReact("❌");
          return m.reply(`*You* must be *Admin* in order to use this Command!`);
        }
        if (!isBotAdmin) {
          await doReact("❌");
          return m.reply(`*Bot* must be *Admin* in order to use this Command!`);
        }
        const message2 = !isMedia
          ? m.quoted ? m.quoted.msg : args[0] ? args.join(" ") : "No message"
          : "Check this Out !";

        let mess = `            『 *Attention Everybody* 』

*⚜️ Tagged by:* @${m.sender.split("@")[0]}

*🧩 Message:* ${message2};
│\n`;
        for (const mem of participants) {
          mess += `┟ @${mem.id.split("@")[0]}\n`;
        }
        mess += `╰────────────⊰\n\n                    *Thank You*\n`;
        await doReact("〽️");
        Atlas.sendMessage(
          m.from,
          { text: mess, mentions: participants.map((a) => a.id) },
          { quoted: m }
        );
        break;
      }

      case "chatbotgc": {
        if (!isAdmin) {
          await doReact("❌");
          return m.reply(`*You* must be *Admin* in order to use this Command!`);
        }
        if (!text) {
          await doReact("❔");
          return m.reply(`Please provide On / Off action !\n\n*Example:*\n\n${prefix}chatbotgc on`);
        }
        const chatbotGCStatus = await checkGroupChatbot(m.from);
        if (args[0] == "on") {
          if (chatbotGCStatus) {
            await doReact("❌");
            return m.reply(`*Group Chatbot* is already *Enabled* !`);
          }
          await doReact("🧩");
          await setGroupChatbot(m.from);
          await m.reply(`*Group Chatbot* has been *Enabled* Successfully ! \n\nBot will not reply to messages where bot is mentioned!`);
        } else if (args[0] == "off") {
          if (!chatbotGCStatus) {
            await doReact("❌");
            return m.reply(`*Group Chatbot* is already *Disabled* !`);
          }
          await doReact("🧩");
          await delGroupChatbot(m.from);
          await m.reply(`*Group Chatbot* has been *Disabled* Successfully !`);
        } else {
          await doReact("❔");
          return m.reply(`Please provide On / Off action !\n\n*Example:*\n\n${prefix}chatbotgc on`);
        }
        break;
      }

      case "antilink": {
        if (!isAdmin) {
          await doReact("❌");
          return m.reply(`*You* must be *Admin* in order to use this Command!`);
        }
        if (!isBotAdmin) {
          await doReact("❌");
          return m.reply(`*Bot* must be *Admin* in order to use this Command!`);
        }
        if (!text) {
          await doReact("❔");
          return m.reply(`Please provide On / Off action !\n\n*Example:*\n\n${prefix}antilink on`);
        }
        const antilinkStatus = await checkAntilink(m.from);
        if (args[0] == "on") {
          if (antilinkStatus) {
            await doReact("❌");
            return m.reply(`*Antilink* is already *Enabled* !`);
          }
          await doReact("⚜️");
          await setAntilink(m.from);
          await m.reply(`*Antilink* has been *Enabled* Successfully ! \n\nBot will remove all links from messages!`);
        } else if (args[0] == "off") {
          if (!antilinkStatus) {
            await doReact("❌");
            return m.reply(`*Antilink* is already *Disabled* !`);
          }
          await doReact("⚜️");
          await delAntilink(m.from);
          await m.reply(`*Antilink* has been *Disabled* Successfully !`);
        } else {
          await doReact("❔");
          return m.reply(`Please provide On / Off action !\n\n*Example:*\n\n${prefix}antilink on`);
        }
        break;
      }

      case "welcome": {
        if (!isAdmin) {
          await doReact("❌");
          return m.reply(`*You* must be *Admin* in order to use this Command!`);
        }
        if (!isBotAdmin) {
          await doReact("❌");
          return m.reply(`*Bot* must be *Admin* in order to use this Command!`);
        }
        if (!text) {
          await doReact("❔");
          return m.reply(`Please provide On / Off action !\n\n*Example:*\n\n${prefix}welcome on`);
        }
        const welcomeStatus = await checkWelcome(m.from);
        if (args[0] == "on") {
          if (welcomeStatus) {
            await doReact("❌");
            return m.reply(`*Welcome* is already *Enabled* !`);
          }
          await doReact("🎀");
          await setWelcome(m.from);
          await m.reply(`*Welcome/Goodbye* messages are *Enabled* Successfully !`);
        } else if (args[0] == "off") {
          if (!welcomeStatus) {
            await doReact("❌");
            return m.reply(`*Welcome* is already *Disabled* !`);
          }
          await doReact("🎀");
          await delWelcome(m.from);
          await m.reply(`*Welcome/Goodbye* messages are *Disabled* Successfully !`);
        } else {
          await doReact("❔");
          return m.reply(`Please provide On / Off action !\n\n*Example:*\n\n${prefix}welcome on`);
        }
        break;
      }

      default:
        break;
    }
  },
};

async function generatePP(buffer) {
  const jimp = await Jimp.read(buffer);
  const min = jimp.getWidth();
  const max = jimp.getHeight();
  const cropped = jimp.crop(0, 0, min, max);
  return {
    img: await cropped.scaleToFit({ w: 720, h: 720 }).getBuffer("image/jpeg"),
    preview: await cropped.normalize().getBuffer("image/jpeg"),
  };
}
