import express  from 'express';
// import path from 'path';
import {init} from "./src/init.js";

const app = express();
const PORT = process.env.PORT || 3000;

// // Serve static files from the "public" directory
// app.use(express.static(path.join(__dirname, 'public')));
//
// // Default route to serve index.html
// app.get('/', (req, res) => {
//     res.sendFile(path.join(__dirname, 'public', 'index.html'));
// });

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});


await init();
