const fs = require('fs');
const path = require('path');

const targetDir = '/Users/harshmodi/Desktop/wap/whatsapp-wap/uploads/inbound/cmp11ik2e0000kj15xxuyaye9/cmp2guz460002kjg7pab7boh6';

const items = fs.readdirSync(targetDir);

for (const item of items) {
  const itemPath = path.join(targetDir, item);
  if (fs.statSync(itemPath).isDirectory() && item.startsWith('cmp')) {
    const files = fs.readdirSync(itemPath);
    if (files.length > 0) {
      const file = files[0];
      const oldFilePath = path.join(itemPath, file);
      const ext = path.extname(file);
      const newFilePath = path.join(targetDir, `${item}${ext}`);
      
      fs.renameSync(oldFilePath, newFilePath);
      console.log(`Moved ${oldFilePath} -> ${newFilePath}`);
      
      fs.rmdirSync(itemPath);
      console.log(`Removed directory ${itemPath}`);
    }
  }
}
