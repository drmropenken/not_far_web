import fs from 'fs';
import path from 'path';

function findTsxFiles(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      findTsxFiles(filePath, fileList);
    } else if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const files = findTsxFiles('./src');
let updatedCount = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes('type Item = {') && !content.includes('image_url')) {
    content = content.replace(/type Item = \{[\s\S]*?\};/, (match) => {
      // Add image_url before the closing brace
      return match.replace(/\n\};/, '\n  image_url?: string | null;\n};');
    });
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated ${file}`);
    updatedCount++;
  }
}

console.log(`Finished updating ${updatedCount} files.`);
