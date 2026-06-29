import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ennwjjgnxlzqnwveqbkx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVubndqamdueGx6cW53dmVxYmt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NzUxNDUsImV4cCI6MjA5NjM1MTE0NX0.mBm2sjw2k7ZbXyNICxslKv3vr0bMGHHIpicE4g-uiBs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: items, error } = await supabase.from('nf_items').select('name').eq('category', 'campsite');
  if (error) {
    console.error(error);
    return;
  }
  
  const roomsDir = path.join(process.cwd(), 'public', 'images', 'rooms');
  const roomFolders = fs.readdirSync(roomsDir).filter(f => fs.statSync(path.join(roomsDir, f)).isDirectory());

  const map = {};

  for (const item of items) {
    let matchedFolder = null;
    
    const cleanName = item.name.replace('住宿-', '').replace('上營區-', '').replace('下營區-', '').replace('景觀區-', '');
    
    for (const folder of roomFolders) {
      if (folder === cleanName || cleanName.includes(folder) || folder.includes(cleanName) || folder.replace(/\s/g, '') === cleanName.replace(/\s/g, '')) {
        matchedFolder = folder;
        break;
      }
    }
    
    if (matchedFolder) {
      const folderPath = path.join(roomsDir, matchedFolder);
      const images = fs.readdirSync(folderPath).filter(f => f.match(/\.(jpg|jpeg|png|webp)$/i));
      map[item.name] = images.map(img => `/images/rooms/${matchedFolder}/${img}`);
    } else {
      map[item.name] = [];
    }
  }

  fs.writeFileSync('src/lib/roomImagesMap.json', JSON.stringify(map, null, 2));
  console.log('Successfully generated src/lib/roomImagesMap.json');
}

run();
