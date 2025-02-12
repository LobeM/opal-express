const express = require('express');
const { Server } = require('socket.io');
const fs = require('fs');
const http = require('http');
const cors = require('cors');
const { Readable } = require('stream');
const axios = require('axios');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

app.use(cors());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const io = new Server(server, {
  cors: {
    origin: process.env.ELECTRON_HOST,
    methods: ['GET', 'POST'],
  },
});

let recordedChunks = [];

io.on('connection', (socket) => {
  let socketChunks = [];

  console.log('🟢 Socket is connected');
  socket.on('video-chunks', async (data) => {
    console.log('🟢 Video chunks is sent');
    socketChunks.push(data.chunks);
    console.log('Chunk size:', data.chunks.length);
  });

  socket.on('process-video', async (data) => {
    console.log('🟢 Processing video...');

    const videoBuffer = Buffer.concat(socketChunks);
    console.log('Total video size:', videoBuffer.length);

    socketChunks = [];

    fs.writeFile('temp_upload/' + data.filename, videoBuffer, async (err) => {
      if (err) {
        console.error('Error saving file:', err);
        return;
      }

      const processing = await axios.post(
        `${process.env.NEXT_API_HOST}recording/${data.userId}/processing`,
        { filename: data.filename }
      );
      if (processing.data.status !== 200)
        return console.log(
          '🔴 Error: Something went wrong with creating the processing file'
        );

      const Key = data.filename;
      const Bucket = process.env.AWS_BUCKET_NAME;
      const ContentType = 'video/webm';
      const command = new PutObjectCommand({
        Bucket,
        Key,
        Body: videoBuffer,
        ContentType,
      });

      const fileStatus = await s3.send(command);

      if (fileStatus['$metadata'].httpStatusCode === 200) {
        console.log('🟢 Video uploaded to AWS');

        if (processing.data.plan === 'PRO') {
          fs.stat('temp_upload/' + data.filename, async (err, stats) => {
            if (!err) {
              if (stats.size < 25000000) {
                const transcription = await openai.audio.transcriptions.create({
                  file: fs.createReadStream(`temp_upload/${data.filename}`),
                  model: 'whisper-1',
                  response_format: 'text',
                });

                if (transcription) {
                  const completion = await openai.chat.completions.create({
                    model: 'gpt-3.5-turbo',
                    response_format: { type: 'json_object' },
                    messages: [
                      {
                        role: 'system',
                        content: `You are going to generate a title and a nice description using the speech to text transcription provided: transcription(${transcription}) and then return it in json format as  {"title": <the title you gave>, "summary": <the summary you created>}`,
                      },
                    ],
                  });

                  const titleAndSummaryGenerated = await axios.post(
                    `${process.env.NEXT_API_HOST}recording/${data.userId}/transcribe`,
                    {
                      filename: data.filename,
                      content: completion.choices[0].message.content,
                      transcript: transcription,
                    }
                  );

                  if (titleAndSummaryGenerated.data.status !== 200)
                    return console.log(
                      '🔴 Error: Something went wrong with creating the title and description'
                    );
                }
              }
            }
          });
        }
        const stopProcessing = await axios.post(
          `${process.env.NEXT_API_HOST}recording/${data.userId}/complete`,
          { filename: data.filename }
        );
        if (stopProcessing.data.status !== 200)
          return console.log(
            '🔴 Error: Something went wrong with stopping the processing'
          );
        if (stopProcessing.status === 200) {
          fs.unlink('temp_upload/' + data.filename, (err) => {
            if (!err) console.log(data.filename + ' 🟢 deleted successfully');
          });
        }
      } else {
        console.log('🔴 Error: Upload failed! Process aborted');
      }
    });
  });

  socket.on('disconnect', () => {
    console.log('🟢 Socket.id', socket.id, 'is disconnected');
  });
});

server.listen(5000, () => {
  console.log('🟢 Listening on port 5000');
});
