import YT from "../System/Ytdl-Core.js";
import fs from "fs";
import yts from "youtube-yts";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
ffmpeg.setFfmpegPath(ffmpegPath);
import { getBuffer } from "../System/Function2.js";

let mergedCommands = [
  "play",
  "song",
  "ytmp3",
  "mp3",
  "ytaudio",
  "yta",
  "ytmp4",
  "mp4",
  "ytvideo",
  "ytv",
  "video",
];

export default {
  name: "mediaDownloader",
  alias: [...mergedCommands],
  uniquecommands: ["song", "video", "ytmp3", "ytmp4"],
  description: "All file dowloader commands",
  start: async (Atlas, m, { inputCMD, text, doReact, prefix, pushName }) => {
    switch (inputCMD) {
      case "play":
      case "song":
        if (!text) {
          await doReact("❌");
          return m.reply(
            `Please provide a song name !\n\nExample: *${prefix}song despacito*`
          );
        }
        await doReact("📥");
        const thumbAtlas = "https://graph.org/file/d0a287fa875c809f234ce.jpg";
        const songInfo = await yts(text);
        const song = songInfo.videos[0];
        const videoUrl = song.url;
        const videoId = videoUrl.split("v=")[1];

        await Atlas.sendMessage(
          m.from,
          {
            image: { url: song.thumbnail },
            caption: `\nDownloading: *${song.title}*

_🕛 Duration:_ *${song.timestamp}*

_🎀 Channel Name:_ *${song.author.name}*

_🏮 Video Uploaded:_ *${song.ago}*\n`,
          },
          { quoted: m }
        );

        YT.mp3(videoId)
          .then((file) => {
            const inputPath = file.path;
            const outputPath = inputPath + ".opus";

            ffmpeg(inputPath)
              .format("opus")
              .on("error", (err) => {
                console.error("Error converting to opus:", err);
              })
              .on("end", async () => {
                await Atlas.sendPresenceUpdate("recording", m.from);

                Atlas.sendMessage(
                  m.from,
                  {
                    audio: fs.readFileSync(outputPath),
                    mimetype: "audio/mpeg",
                    ptt: true,
                  },
                  { quoted: m }
                );

                fs.unlinkSync(inputPath);
                fs.unlinkSync(outputPath);
              })
              .save(outputPath);
          })
          .catch((err) => {
            console.error("[ ATLAS ] YT mp3 download error:", err.message);
            m.reply(`Failed to download audio: ${err.message}`);
          });

        break;

      case "ytmp3":
      case "mp3":
      case "ytaudio":
        if (
          !text ||
          (!text.includes("youtube.com/watch?v=") &&
            !text.includes("youtu.be/"))
        ) {
          await doReact("❌");
          return m.reply(
            `Please provide a valid YouTube Video link to download as audio!\n\nExample: *${prefix}mp3 put_link*`
          );
        }
        await doReact("📥");
        {
          const songInfo2 = await yts(text);
          const song2 = songInfo2.videos[0];
          const videoUrl2 = song2.url;
          const videoId2 = videoUrl2.split("v=")[1];

          await Atlas.sendMessage(
            m.from,
            {
              image: { url: song2.thumbnail },
              caption: `\nDownloading: *${song2.title}*

_🕛 Duration:_ *${song2.timestamp}*

_🎀 Channel Name:_ *${song2.author.name}*

_🏮 Video Uploaded:_ *${song2.ago}*\n`,
            },
            { quoted: m }
          );

          YT.mp3(videoId2)
            .then((file) => {
              const inputPath = file.path;
              const outputPath = inputPath + ".opus";

              ffmpeg(inputPath)
                .format("opus")
                .on("error", (err) => {
                  console.error("Error converting to opus:", err);
                })
                .on("end", async () => {
                  await Atlas.sendPresenceUpdate("recording", m.from);

                  Atlas.sendMessage(
                    m.from,
                    {
                      audio: fs.readFileSync(inputPath),
                      mimetype: "audio/mpeg",
                      ptt: true,
                    },
                    { quoted: m }
                  );

                  fs.unlinkSync(inputPath);
                  fs.unlinkSync(outputPath);
                })
                .save(outputPath);
            })
            .catch((err) => {
              console.error("[ ATLAS ] YT mp3 download error:", err.message);
              m.reply(`Failed to download audio: ${err.message}`);
            });
        }

        break;

      case "ytmp4":
      case "mp4":
      case "ytvideo":
        if (
          !text ||
          (!text.includes("youtube.com/watch?v=") &&
            !text.includes("youtu.be/"))
        ) {
          await doReact("❌");
          return m.reply(
            `Please provide a valid YouTube Video link to download as audio!\n\nExample: *${prefix}mp4 put_link*`
          );
        }
        await doReact("📥");
        {
          const songInfo3 = await yts(text);
          const song3 = songInfo3.videos[0];
          const videoUrl3 = song3.url;

          await Atlas.sendMessage(
            m.from,
            {
              image: { url: song3.thumbnail },
              caption: `\nDownloading: *${song3.title}*

_🕛 Duration:_ *${song3.timestamp}*

_🎀 Channel Name:_ *${song3.author.name}*

_🏮 Video Uploaded:_ *${song3.ago}*\n`,
            },
            { quoted: m }
          );

          const ytaud3 = await YT.mp4(videoUrl3);
          Atlas.sendMessage(
            m.from,
            {
              video: { url: ytaud3.videoUrl },
              caption: `${song3.title} By: *${botName}*`,
            },
            { quoted: m }
          );
        }

        break;

      case "video":
        if (!text) {
          await doReact("❌");
          return m.reply(
            `Please provide an YouTube video name !\n\nExample: *${prefix}video dandilions*`
          );
        }
        await doReact("📥");
        {
          const songInfo4 = await yts(text);
          const song4 = songInfo4.videos[0];
          const videoUrl4 = song4.url;

          await Atlas.sendMessage(
            m.from,
            {
              image: { url: song4.thumbnail },
              caption: `\nDownloading: *${song4.title}*

_🕛 Duration:_ *${song4.timestamp}*

_🎀 Channel Name:_ *${song4.author.name}*

_🏮 Video Uploaded:_ *${song4.ago}*\n`,
            },
            { quoted: m }
          );

          const ytaud2 = await YT.mp4(videoUrl4);
          Atlas.sendMessage(
            m.from,
            {
              video: { url: ytaud2.videoUrl },
              caption: `${song4.title} By: *${botName}*`,
            },
            { quoted: m }
          );
        }

        break;

      case "yts":
      case "ytsearch":
        if (!args[0]) {
          await doReact("❌");
          return m.reply(`Please provide a search term!`);
        }
        await doReact("📥");
        {
          const search = await yts(text);
          const thumbnail = search.all[0].thumbnail;
          let num = 1;

          let txt = `*🏮 YouTube Search Engine 🏮*\n\n_🧩 Search Term:_ *${args.join(
            " "
          )}*\n\n*📌 Total Results:* *${search.all.length}*\n`;

          for (let i of search.all) {
            txt += `\n_Result:_ *${num++}*\n_🎀 Title:_ *${
              i.title
            }*\n_🔶 Duration:_ *${i.timestamp}*\n_🔷 Link:_ ${i.url}\n\n`;
          }

          const buttonMessage = {
            image: { url: thumbnail },
            caption: txt,
          };

          Atlas.sendMessage(m.from, buttonMessage, { quoted: m });
        }
        break;

      default:
        break;
    }
  },
};
