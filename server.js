const http = require('http');
const WebSocket = require('ws');
const axios = require('axios');
const Throttle = require('stream-throttle').Throttle;
const server = http.createServer();
const wss = new WebSocket.Server({ server });
const async = require('async');
const fs = require('fs');
let config = require('./config.json');

const keywords = {
    'iphone': ['https://mtsdoo.com/wp-content/uploads/2023/03/Apple-iPhone-15.jpg', 
            'https://i.ebayimg.com/images/g/93sAAOSwehpjOGFz/s-l1600.jpg', ],
    'samsung': ['https://trashbox.ru/files/1597739_df1670/01.jpg', 
            'https://redmishop.ru/wp-content/uploads/2022/06/s23_ultra.jpg', 
            'https://www.cifrus.ru/pictures/news/vsyo-chto-nuzhno-znat-o-samsung-galaxy-s23-ultra-1.jpg'],
    'xiaomi': ['https://i.ebayimg.com/images/g/UaAAAOSwnuBkWNEN/s-l1600.png', 
            'https://oxsy.ru/wp-content/uploads/2023/04/Xiaomi-13-Ultra-2.jpg', 
            'https://www.cined.com/content/uploads/2022/11/Xiaomi-12S-Ultra-concept-featured.jpg'],    
};

let downloadQueue = async.queue(function(task, callback) {
    let ws = task.ws;
    let url = task.url;
  
    const filename = url.split('/').pop();
    const file = fs.createWriteStream(filename);
  
    axios({
      method:'get',
      url: url,
      responseType: 'stream'
    })
    .then((response) => {
        let totalLength = response.headers['content-length'];
        totalLength = totalLength ? parseInt(totalLength, 10) : null;
        let transferred = 0;

        response.data
        .on('data', (chunk) => {
          transferred += chunk.length;
            const response_progress = {
                type: 'progress',
                url: url,
                size: totalLength,
                transferred: transferred,
                percent: totalLength ? transferred / totalLength : null,
            };
            ws.send(JSON.stringify(response_progress));
        })
        .on('error', callback)
        .pipe(new Throttle({
            rate: config.speedLimitPerConnection 
        }))
        .pipe(file);
    });


    file.on('finish', () => {
        console.log(`Загрузка ${url} завершена`);
        callback(null);
    });
}, config.maxConnections);

wss.on('connection', ws => {
  ws.on('message', message => {
    console.log(`Received message: ${message}`);
    const data = JSON.parse(message);

    if (data.type == 'keyword') {
      console.log(data.type);
      const keyword = data.keyword;
      const urls = keywords[keyword];

      if (urls) {
        ws.send(JSON.stringify(urls));
      } else {
        ws.send(JSON.stringify('empty'));
      }

    } else if (data.type == 'download') {
      console.log(data.type);
      const url = data.url;
      console.log(url);
      console.log('Вызов функции скачивания');

      downloadQueue.push({url: url, ws: ws}, function(err) {
        if (err) {
            console.error(`Ошибка при скачивании ${url}: ${err}`);
            return;
        }
        ws.send(JSON.stringify({type: 'content', url: url}));
      });
    }
  });
});

server.listen(8080, () => {
    console.log('WebSocket server started');
});
