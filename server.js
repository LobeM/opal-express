const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const cors = require('cors');

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

io.on('connection', (socket) => {
  console.log('🟢 Socket is connected');
});

server.listen(5000, () => {
  console.log('🟢 Listening on port 5000');
});
