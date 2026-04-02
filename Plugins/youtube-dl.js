import axios from "axios";

let mergedCommands = [
  "play",
  "song",
  "yt",
  "ytmp3",
  "mp3",
  "ytmp4",
  "video",
  "mp4",
  "video",
  "ytsearch",
  "yts"
];

const YT_REGEX = /^(https?:\/\/)?((www|m|music)\.)?(youtube(-nocookie)?\.com\/(watch\?v=|shorts\/|live\/)|youtu\.be\/)[\w-]+(\S+)?$/i;

const extractUrl = (text) => {
  if (!text) return null;
  const match = text.match(YT_REGEX);
  return match ? match[0] : null;
};

export default {
  name: "youtube",
  alias: [...mergedCommands],
  uniquecommands: ["play", "mp3", "mp4", "ytsearch"],
  description: "Advanced YouTube system (API based)",

  start: async (Atlas, m, { inputCMD, text, doReact, prefix }) => {
    const botName = global.botName || "ATLAS";
    let query = text?.trim();

    if (!query && m.quoted?.text) {
      query = m.quoted.text.trim();
    }

    if (!query) {
      return m.reply(`🎬 *YouTube Downloader*

📌 *Usage:*
• ${prefix}play <song name>
• ${prefix}mp3 <youtube link>
• ${prefix}video <video name>
• ${prefix}mp4 <youtube link>
• ${prefix}ytsearch <query>

✨ Reply to link also works`);
    }

    try {
        
      if (inputCMD === "ytsearch" || inputCMD === "yts") {
        await doReact("🔍");

        const res = await axios.get(`https://api-faa.my.id/faa/youtube?q=${encodeURIComponent(query)}`);
        const data = res.data;

        if (!data.status || !data.result.length) {
          return m.reply("❌ No results found");
        }

        let txt = `🔍 *YouTube Search Results*\n\n`;
        data.result.slice(0, 10).forEach((v, i) => {
          txt += `*${i + 1}.* ${v.title}\n⏱ ${v.duration} | 📺 ${v.channel}\n🔗 ${v.link}\n\n`;
        });

        return Atlas.sendMessage(m.from, {
          image: { url: data.result[0].imageUrl },
          caption: txt
        }, { quoted: m });
      }

if (inputCMD === "mp4" || inputCMD === "ytmp4" || inputCMD === "video") {
  await doReact("🎥");

  let url = extractUrl(query);
  if (!url) {
    const search = await axios.get(`https://api-faa.my.id/faa/youtube?q=${encodeURIComponent(query)}`);
    if (!search.data.status || !search.data.result.length) {
      return m.reply("❌ No video found");
    }

    url = search.data.result[0].link;

    await Atlas.sendMessage(m.from, {
      image: { url: search.data.result[0].imageUrl },
      caption: `🎬 *${search.data.result[0].title}*\n⏱ ${search.data.result[0].duration}\n\n⬇️ Downloading...`
    }, { quoted: m });
  }

  const res = await axios.get(`https://api-faa.my.id/faa/ytmp4?url=${encodeURIComponent(url)}`);
  const data = res.data;

  if (!data.status) throw new Error("API failed");

  await Atlas.sendMessage(m.from, {
    video: { url: data.result.download_url },
    mimetype: "video/mp4",
    caption: `🎬 *Video Downloaded*\n\n> Powered by ${botName}`
  }, { quoted: m });

  await doReact("✅");
}

      if (
        inputCMD === "mp3" ||
        inputCMD === "ytmp3" ||
        extractUrl(query)
      ) {
        await doReact("🎶");

        const url = extractUrl(query);
        if (!url) return m.reply("❌ Invalid YouTube link");

        const res = await axios.get(`https://api-faa.my.id/faa/ytmp3?url=${encodeURIComponent(url)}`);
        const data = res.data;

        if (!data.status) throw new Error("API failed");

        const { title, thumbnail, mp3 } = data.result;

        await Atlas.sendMessage(m.from, {
          audio: { url: mp3 },
          mimetype: "audio/mpeg",
          contextInfo: {
            externalAdReply: {
              title: title,
              body: "🎧 YouTube Audio",
              thumbnailUrl: thumbnail,
              mediaType: 2,
              renderLargerThumbnail: true
            }
          }
        }, { quoted: m });

        return;
      }

      if (inputCMD === "play" || inputCMD === "song" || inputCMD === "yt") {
        await doReact("📥");

        const res = await axios.get(`https://api-faa.my.id/faa/ytplay?query=${encodeURIComponent(query)}`);
        const data = res.data;

        if (!data.status) throw new Error("API failed");

        const { title, author, thumbnail, mp3 } = data.result;

        await Atlas.sendMessage(m.from, {
          image: { url: thumbnail },
          caption: `🎶 *${title}*
👤 ${author}

⬇️ Downloading...`
        }, { quoted: m });

        await Atlas.sendMessage(m.from, {
          audio: { url: mp3 },
          mimetype: "audio/mpeg",
          contextInfo: {
            externalAdReply: {
              title: title,
              body: author,
              thumbnailUrl: thumbnail,
              mediaType: 2,
              renderLargerThumbnail: true
            }
          }
        }, { quoted: m });

        return;
      }

    } catch (err) {
      console.error(err);
      m.reply(`❌ Error: ${err.message}`);
    }
  },
};