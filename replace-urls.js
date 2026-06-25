import fs from 'fs';
import path from 'path';
import { globSync } from 'glob';

const replacements = {
  "https://asiacamp-image.pages.dev/upload/room_manage/365/365_room_manage_6a150c7d791dc.jpeg": "/images/rooms/bus.jpeg",
  "https://asiacamp-image.pages.dev/upload/room_manage/365/365_room_manage_6a150e09b75ef.jpeg": "/images/rooms/house.jpeg",
  "https://asiacamp-image.pages.dev/upload/room_manage/365/365_room_manage_6a140d6500e04.jpeg": "/images/rooms/glamping.jpeg",
  "https://asiacamp-image.pages.dev/upload/room_manage/365/365_room_manage_6a150a9af2e74.jpeg": "/images/rooms/stone-hut.jpeg",
  "https://asiacamp-image.pages.dev/upload/room_manage/365/365_room_manage_6a150ba4a5bab.jpeg": "/images/rooms/pipe-house.jpeg",
  "https://asiacamp-image.pages.dev/upload/room_manage/365/365_room_manage_6a150f2016ab1.jpeg": "/images/rooms/tree-zone.jpeg",
  "https://asiacamp-image.pages.dev/upload/room_manage/365/365_room_manage_6a15118ede679.jpeg": "/images/rooms/grass-zone.jpeg",
  "https://asiacamp-image.pages.dev/upload/room_manage/365/365_room_manage_6a15104c90b7d.jpeg": "/images/rooms/lake-zone.jpeg"
};

const files = globSync('src/**/*.{astro,tsx,ts,js}');

let count = 0;
for (const file of files) {
  let content = fs.readFileSync(file, 'utf-8');
  let changed = false;
  
  for (const [oldUrl, newUrl] of Object.entries(replacements)) {
    if (content.includes(oldUrl)) {
      content = content.split(oldUrl).join(newUrl);
      changed = true;
    }
  }
  
  if (changed) {
    fs.writeFileSync(file, content);
    console.log(`Updated ${file}`);
    count++;
  }
}

console.log(`Updated ${count} files.`);
