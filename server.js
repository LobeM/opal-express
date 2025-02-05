const express = require('express');
const { Server } = require('socket.io');
const fs = require('fs');
const http = require('http');
const cors = require('cors');
const { Readable } = require('stream');
const axios = require('axios');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

require('dotenv').config();

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const app = express();
const server = http.createServer(app);

app.use(cors());

const io = new Server(server, {
  cors: {
    origin: process.env.ELECTRON_HOST,
    methods: ['GET', 'POST'],
  },
});

let recordedChunks = [];

io.on('connection', (socket) => {
  console.log('🟢 Socket is connected');
  socket.on('video-chunks', async (data) => {
    console.log('🟢 Video chunks is sent');
    const writestream = fs.createWriteStream('temp_upload/' + data.filename);
    recordedChunks.push(data.chunks);
    const videoBlob = new Blob(recordedChunks, {
      type: 'video/webm; codecs=vp9',
    });
    const buffer = Buffer.from(await videoBlob.arrayBuffer());
    const readStream = Readable.from(buffer);
    readStream.pipe(writestream).on('finish', () => {
      console.log('🟢 Chunk Saved');
    });
  });

  socket.on('process-video', async (data) => {
    console.log('🟢 Processing video...');
    recordedChunks = [];
    fs.readFile('temp_upload/' + data.filename, async (err, file) => {
      const processing = await axios.post(
        `${process.env.NEXT_API_HOST}recording/${data.userId}/processing`
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
        Body: file,
        ContentType,
      });

      const fileStatus = await s3.send(command);
    });
  });

  socket.on('disconnect', () => {
    console.log('🟢 Socket.id', socket.id, 'is disconnected');
  });
});

server.listen(5000, () => {
  console.log('🟢 Listening on port 5000');
});
