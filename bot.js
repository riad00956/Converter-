require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const mime = require('mime-types');
const { exec } = require('child_process');
const path = require('path');

const app = express();
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const downloadFile = async (fileId, filename) => {
  const fileUrl = await bot.getFileLink(fileId);
  const response = await axios({ url: fileUrl, responseType: 'stream' });
  return new Promise((resolve) => {
    const stream = fs.createWriteStream(filename);
    response.data.pipe(stream);
    stream.on('finish', () => resolve(filename));
  });
};

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  if (msg.document || msg.photo || msg.video || msg.audio) {
    bot.sendMessage(chatId, '✅ Received. Please wait, converting...');

    let fileId;
    if (msg.document) fileId = msg.document.file_id;
    else if (msg.photo) fileId = msg.photo[msg.photo.length - 1].file_id;
    else if (msg.video) fileId = msg.video.file_id;
    else if (msg.audio) fileId = msg.audio.file_id;

    const originalName = `./input/${fileId}`;
    const outputName = `./output/${fileId}`;

    try {
      fs.mkdirSync('./input', { recursive: true });
      fs.mkdirSync('./output', { recursive: true });

      await downloadFile(fileId, originalName);

      const ext = mime.extension(msg.document?.mime_type || 'application/octet-stream');
      const targetFormat = ext === 'jpg' ? 'png' : ext === 'png' ? 'jpg' : ext === 'mp4' ? 'mp3' : 'pdf';

      const outputFile = `${outputName}.${targetFormat}`;

      // IMAGE Conversion
      if (['jpg', 'jpeg', 'png'].includes(ext)) {
        await sharp(originalName).toFormat(targetFormat).toFile(outputFile);
      }
      // VIDEO to AUDIO
      else if (['mp4', 'mov', 'avi'].includes(ext)) {
        await new Promise((resolve, reject) => {
          ffmpeg(originalName)
            .output(outputFile)
            .on('end', resolve)
            .on('error', reject)
            .run();
        });
      }
      // DOCX, PPTX, XLSX, etc.
      else if (['docx', 'pptx', 'xlsx', 'odt'].includes(ext)) {
        await new Promise((resolve, reject) => {
          exec(`libreoffice --headless --convert-to pdf --outdir ./output ${originalName}`, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        outputFile = `${outputName}.pdf`;
      } else {
        return bot.sendMessage(chatId, '❌ Unsupported file type.');
      }

      await bot.sendDocument(chatId, outputFile);
    } catch (e) {
      console.error(e);
      bot.sendMessage(chatId, '❌ Error occurred during conversion.');
    } finally {
      fs.rmSync('./input', { recursive: true, force: true });
      fs.rmSync('./output', { recursive: true, force: true });
    }
  } else {
    bot.sendMessage(chatId, '📎 Please send a file (photo, video, doc) to convert.');
  }
});

app.listen(process.env.PORT, () => {
  console.log(`Bot server running on port ${process.env.PORT}`);
});
