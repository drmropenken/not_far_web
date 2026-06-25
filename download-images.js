import fs from 'fs';
import path from 'path';
import https from 'https';

const images = [
  { url: "https://asiacamp-image.pages.dev/upload/room_manage/365/365_room_manage_6a150c7d791dc.jpeg", name: "bus.jpeg" },
  { url: "https://asiacamp-image.pages.dev/upload/room_manage/365/365_room_manage_6a150e09b75ef.jpeg", name: "house.jpeg" },
  { url: "https://asiacamp-image.pages.dev/upload/room_manage/365/365_room_manage_6a140d6500e04.jpeg", name: "glamping.jpeg" },
  { url: "https://asiacamp-image.pages.dev/upload/room_manage/365/365_room_manage_6a150a9af2e74.jpeg", name: "stone-hut.jpeg" },
  { url: "https://asiacamp-image.pages.dev/upload/room_manage/365/365_room_manage_6a150ba4a5bab.jpeg", name: "pipe-house.jpeg" },
  { url: "https://asiacamp-image.pages.dev/upload/room_manage/365/365_room_manage_6a150f2016ab1.jpeg", name: "tree-zone.jpeg" },
  { url: "https://asiacamp-image.pages.dev/upload/room_manage/365/365_room_manage_6a15118ede679.jpeg", name: "grass-zone.jpeg" },
  { url: "https://asiacamp-image.pages.dev/upload/room_manage/365/365_room_manage_6a15104c90b7d.jpeg", name: "lake-zone.jpeg" }
];

const dir = path.join(process.cwd(), 'public', 'images', 'rooms');

if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

async function downloadImages() {
  for (const img of images) {
    const dest = path.join(dir, img.name);
    await new Promise((resolve, reject) => {
      https.get(img.url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to download ${img.url}: ${res.statusCode}`));
          return;
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log(`Downloaded: ${img.name}`);
          resolve(true);
        });
      }).on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    });
  }
}

downloadImages().then(() => console.log('All done!')).catch(console.error);
