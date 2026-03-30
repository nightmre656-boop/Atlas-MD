import fs from "fs";
import axios from "axios";
import path from "path";
let mergedCommands = [
  "help",
  "h",
  "menu",
  "sc",
  "support",
  "supportgc",
  "script",
];

export default {
  name: "systemcommands",
  alias: [...mergedCommands],
  uniquecommands: ["script", "support", "help"],
  description: "All system commands",
  start: async (
    Atlas,
    m,
    { pushName, prefix, inputCMD, doReact, text, args }
  ) => {
    const pic = fs.readFileSync("./Assets/Atlas.jpg");
    switch (inputCMD) {
      case "script":
      case "sc":
        await doReact("🧣");
        let repoInfo = await axios.get(
          "https://api.github.com/repos/FantoX/Atlas-MD"
        );
        let repo = repoInfo.data;
        console.log(repo);
        let txt = `            🧣 *${botName}'s Script* 🧣\n\n*🎀 Total Forks:* ${
          repo.forks_count
        }\n*⭐ Total Stars:* ${repo.stargazers_count}\n*📜 License:* ${
          repo.license.name
        }\n*📁 Repo Size:* ${(repo.size / 1024).toFixed(
          2
        )} MB\n*📅 Last Updated:* ${repo.updated_at}\n\n*🔗 Repo Link:* ${
          repo.html_url
        }\n\n❝ Dont forget to give a Star ⭐ to the repo. It's made with restless hardwork by *Team ATLAS*. ❞\n\n*©️ Team ATLAS- 2023*`;
        Atlas.sendMessage(m.from, { image: pic, caption: txt }, { quoted: m });
        break;

      case "support":
      case "supportgc":
        await doReact("🔰");
        let txt2 = `              🧣 *Support Group* 🧣\n\n*${botName}* is an open source project, and we are always happy to help you.\n\n*Link:* ${suppL}\n\n*Note:* Please don't spam in the group, and don't message *Admins directly* without permission. Ask for help inside *Group*.\n\n*Thanks for using Atlas.*`;
        Atlas.sendMessage(m.from, { image: pic, caption: txt2 }, { quoted: m });
        break;

      case "help":
      case "h":
      case "menu":
        await doReact("☃️");
        await Atlas.sendPresenceUpdate("composing", m.from);
        async function readUniqueCommands(dirPath) {
          const allCommands = [];

          const files = fs.readdirSync(dirPath);

          for (const file of files) {
            const filePath = path.join(dirPath, file);
            const stat = fs.statSync(filePath);

            if (stat.isDirectory()) {
              const subCommands = await readUniqueCommands(filePath);
              allCommands.push(...subCommands);
            } else if (stat.isFile() && file.endsWith(".js")) {
              const command = await import(filePath);
              const cmdDefault = command.default;

              if (cmdDefault && Array.isArray(cmdDefault.uniquecommands)) {
                const subArray = [file, ...cmdDefault.uniquecommands];
                allCommands.push(subArray);
              }
            }
          }

          return allCommands;
        }

        function formatCommands(allCommands) {
          let formatted = "";

          for (const [file, ...commands] of allCommands) {
            const capitalizedFile =
              file.replace(".js", "").charAt(0).toUpperCase() +
              file.replace(".js", "").slice(1);

            formatted += `╟   🏮 *${capitalizedFile}* 🏮   ╢\n\n`;
            formatted += `\`\`\`${commands
              .map((cmd) => `⥼   ${prefix + cmd}`)
              .join("\n")}\`\`\`\n\n\n`;
          }

          return formatted.trim();
        }

        const pluginsDir = path.join(process.cwd(), "Plugins");

        const allCommands = await readUniqueCommands(pluginsDir);
        const formattedCommands = formatCommands(allCommands);
        var helpText = `\nKonnichiwa *${pushName}* Senpai,\n\nI am *${botName}*, a WhatsApp bot built to take your boring WhatsApp experience into next level.\n\n*🔖 My Prefix is:*  ${prefix}\n\n${formattedCommands}\n\n\n*©️ Team ATLAS- 2023*`;
        await Atlas.sendMessage(
          m.from,
          { video: { url: botVideo }, gifPlayback: true, caption: helpText },
          { quoted: m }
        );

        break;

      default:
        break;
    }
  },
};
