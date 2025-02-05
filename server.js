const express = require('express');
const { Server } = require('socket.io');
const fs = require('fs');
const http = require('http');
const cors = require('cors');
const { Readable } = require('stream');

require('dotenv').config();

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
  });

  socket.on('disconnect', () => {
    console.log('🟢 Socket.id', socket.id, 'is disconnected');
  });
});

server.listen(5000, () => {
  console.log('🟢 Listening on port 5000');
});
