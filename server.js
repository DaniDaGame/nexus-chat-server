// nexus-chat-server/server.js
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');

const app = express();

// הגדרות CORS
// חשוב מאוד לאפשר גישה מהדומיין של אפליקציית ה-Next.js שלך (Vercel) בפרודקשן.
// בסביבת פיתוח, נאפשר מ-localhost:3000.
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
            ? 'https://nexus-2ne2.vercel.app' // !!! החלף בכתובת האפליקציה שלך ב-Vercel !!!
            : 'http://localhost:3000', // כתובת ה-Frontend שלך בפיתוח
  methods: ["GET", "POST"]
};
app.use(cors(corsOptions));

const server = http.createServer(app);

const io = new Server(server, {
  cors: corsOptions // העבר את אותן הגדרות CORS גם ל-Socket.IO
});

const PORT = process.env.PORT || 3001; // הפורט בו ירוץ שרת הצ'אט

// אובייקט לאחסון משתמשים בחדרים (בזיכרון, לפשטות)
// במערכת פרודקשן, כדאי לשקול פתרון עמיד יותר כמו Redis
const rooms = {}; // rooms[roomId] = { socketId: { userId, userName }, ... }

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // אירוע להצטרפות לחדר פגישה
  socket.on('join-meeting-room', (meetingId, userId, userName) => {
    socket.join(meetingId); // ה-socket מצטרף לחדר עם מזהה הפגישה

    if (!rooms[meetingId]) {
      rooms[meetingId] = {};
    }
    rooms[meetingId][socket.id] = { userId, userName };

    console.log(`User ${userName} (ID: ${userId}, Socket: ${socket.id}) joined meeting room: ${meetingId}`);

    // שלח הודעת מערכת לכל המשתתפים בחדר (חוץ מהשולח) על הצטרפות המשתמש
    socket.to(meetingId).emit('user-joined-chat', {
      id: `system-${Date.now()}`,
      senderId: 'system',
      senderName: 'System',
      text: `${userName || 'A user'} has joined the chat.`,
      timestamp: Date.now(),
      type: 'notification'
    });
  });

  // אירוע לקבלת הודעת צ'אט חדשה מהלקוח
  socket.on('send-chat-message', (data) => {
    const { meetingId, senderId, senderName, text, timestamp } = data;
    if (!meetingId) {
        console.error('Error: meetingId is undefined for send-chat-message');
        return;
    }
    console.log(`Message in room ${meetingId} from ${senderName} (ID: ${senderId}): ${text}`);
    
    // שלח את ההודעה לכל המשתתפים בחדר, כולל השולח (io.to)
    io.to(meetingId).emit('receive-chat-message', {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, // ID פשוט וייחודי
      senderId,
      senderName,
      text,
      timestamp,
      type: 'user-message'
    });
  });

  // אירוע עזיבת חדר (יכול להיקרא על ידי הלקוח לפני התנתקות מהדף)
  socket.on('leave-meeting-room', (meetingId, userId, userName) => {
    if (meetingId && rooms[meetingId] && rooms[meetingId][socket.id]) {
      socket.leave(meetingId);
      delete rooms[meetingId][socket.id];
      console.log(`User ${userName} (ID: ${userId}, Socket: ${socket.id}) left meeting room: ${meetingId}`);
      
      socket.to(meetingId).emit('user-left-chat', {
        id: `system-${Date.now()}`,
        senderId: 'system',
        senderName: 'System',
        text: `${userName || 'A user'} has left the chat.`,
        timestamp: Date.now(),
        type: 'notification'
      });
    }
  });

  // טיפול בהתנתקות ה-socket
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    // הסר את המשתמש מכל החדרים בהם הוא רשום
    for (const meetingId in rooms) {
      if (rooms[meetingId] && rooms[meetingId][socket.id]) {
        const { userId, userName } = rooms[meetingId][socket.id];
        delete rooms[meetingId][socket.id];
        console.log(`User ${userName} (ID: ${userId}) auto-left room: ${meetingId} on disconnect`);
        
        socket.to(meetingId).emit('user-left-chat', {
          id: `system-${Date.now()}-disconnect`,
          senderId: 'system',
          senderName: 'System',
          text: `${userName || 'A user'} has disconnected.`,
          timestamp: Date.now(),
          type: 'notification'
        });
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Nexus Chat Server is running on http://localhost:${PORT}`);
});