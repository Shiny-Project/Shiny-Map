const express = require('express');
const path = require('path');
const MapController = require('./controller/MapController');

const app = express()

app.get('/', (req, res) => res.send('Hello World!'));

// 静态文件服务目录
app.use('/data', express.static(path.join(__dirname, '../data')));
app.use('/template', express.static(path.join(__dirname, '../dist')));

app.use('/map/highlight', MapController.highlight);

app.listen(3000, () => console.log('Example app listening on port 3000!'));