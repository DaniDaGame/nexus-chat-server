// nexus-chat-server/server.js
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');

const app = express();

// הגדרות CORS
const allowedOrigins = [
    'http://localhost:3000', // לפיתוח מקומי
    'https://nexus-2ne2.vercel.app' // לדומיין שלך ב-Vercel - ודא שזה הדומיין הנכון
    // אם יש לך עוד כתובות Preview מ-Vercel, הוסף גם אותן
];

const corsOptions = {
  origin: function (origin, callback) {
    // אפשר בקשות ללא origin (כמו מ-Postman או בדיקות מקומיות אם אתה רוצה)
    // או בקשות שה-origin שלהן נמצא ברשימת המותרים
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`CORS: Origin not allowed: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST"]
};
app.use(cors(corsOptions));

const server = http.createServer(app);

const io = new Server(server, {
  cors: corsOptions // העבר את אותן הגדרות CORS גם ל-Socket.IO
});

const PORT = process.env.PORT || 3001;

const rooms = {}; // rooms[roomId] = { socketId1: { userId, userName }, socketId2: { userId, userName } ... }

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on('join-meeting-room', (meetingId, userId, userName) => {
    if (!meetingId || !userId) {
        console.error("join-meeting-room: Missing meetingId or userId", {meetingId, userId, userName});
        return;
    }
    socket.join(meetingId);

    if (!rooms[meetingId]) {
      rooms[meetingId] = {};
    }
    rooms[meetingId][socket.id] = { userId, userName };

    console.log(`User ${userName} (ID: ${userId}, Socket: ${socket.id}) joined meeting room: ${meetingId}`);

    // שלח הודעת מערכת לכל המשתתפים האחרים בחדר על הצטרפות המשתמש
    socket.to(meetingId).emit('user-joined-chat', {
      id: `system-join-${Date.now()}`,
      senderId: 'system',
      senderName: 'System',
      text: `${userName || 'A user'} has joined the chat.`,
      timestamp: Date.now(),
      type: 'notification'
    });
  });

  socket.on('send-chat-message', (data) => {
    const { meetingId, senderId, senderName, text, timestamp } = data;
    if (!meetingId || !senderId || !text) {
        console.error('send-chat-message: Missing required data', data);
        return;
    }
    console.log(`Message in room ${meetingId} from ${senderName} (ID: ${senderId}): ${text}`);
    
    // שלח את ההודעה לכל המשתתפים בחדר, כולל השולח
    io.to(meetingId).emit('receive-chat-message', {
      id: `${Date.now()}-${senderId.slice(-4)}-${Math.random().toString(16).slice(2, 6)}`, // ID מעט יותר ייחודי
      senderId,
      senderName,
      text,
      timestamp,
      type: 'user-message' // זהה לסוג ההודעה שהלקוח מצפה לו
    });
  });

  socket.on('leave-meeting-room', (meetingId, userId, userName) => {
    if (meetingId && rooms[meetingId] && rooms[meetingId][socket.id]) {
      socket.leave(meetingId);
      const leavingUserName = rooms[meetingId][socket.id]?.userName || userName || 'A user';
      delete rooms[meetingId][socket.id];
      console.log(`User ${leavingUserName} (ID: ${userId}, Socket: ${socket.id}) left meeting room: ${meetingId}`);
      
      socket.to(meetingId).emit('user-left-chat', {
        id: `system-leave-${Date.now()}`,
        senderId: 'system',
        senderName: 'System',
        text: `${leavingUserName} has left the chat.`,
        timestamp: Date.now(),
        type: 'notification'
      });
    }
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    for (const meetingId in rooms) {
      if (rooms[meetingId] && rooms[meetingId][socket.id]) {
        const { userId, userName } = rooms[meetingId][socket.id];
        delete rooms[meetingId][socket.id]; // הסר את המשתמש מהחדר
        console.log(`User ${userName} (ID: ${userId}) auto-left room: ${meetingId} on disconnect`);
        
        // הודע לשאר המשתתפים בחדר
        socket.to(meetingId).emit('user-left-chat', {
          id: `system-disconnect-${Date.now()}`,
          senderId: 'system',
          senderName: 'System',
          text: `${userName || 'A user'} has disconnected.`,
          timestamp: Date.now(),
          type: 'notification'
        });
        // אין צורך ב-break כאן אם משתמש יכול להיות במספר חדרים עם אותו socket (לא המקרה שלנו)
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Nexus Chat Server is running on http://localhost:${PORT}`);
});