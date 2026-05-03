const express = require('express');

const roomRouter = require('./routes/roomRouter');
const infoChoiceRouter = require('./routes/infoChoiceRouter'); // 루트 경로
const infoChojoongRouter = require('./routes/infoChojoongRoutes');
const infoLiveRouter = require('./routes/infoLiveRouter');
const infoOrderRouter = require('./routes/infoOrderRouter');
const entryRouter = require('./routes/entryRouter');
const attendanceRoutes = require("./routes/attendanceRoutes");
const autoSendStartTalkRouter = require('./routes/autoSendStartTalkRouter');
const autoSendTeamTalkRouter = require('./routes/autoSendTeamTalkRouter');
const numberRouter = require('./routes/numberRouter');

const app = express();
app.use(express.json()); // JSON 바디 파싱

app.use('/api/info-room', roomRouter);
app.use('/api/info-choice', infoChoiceRouter);
app.use('/api/info-chojoong', infoChojoongRouter);
app.use('/api/info-live', infoLiveRouter);
app.use('/api/info-order', infoOrderRouter);
app.use('/api/info-entry', entryRouter);
app.use('/api/auto-send-starttalk', autoSendStartTalkRouter);
app.use('/api/auto-send-teamtalk', autoSendTeamTalkRouter);
app.use('/api', numberRouter);
app.use("/", attendanceRoutes);

// 서버 시작
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`[INFO] app.js 서버가 ${PORT} 포트에서 실행 중입니다.`);
});
