import fs from 'fs';
import path from 'path';

function copyDir(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

function copyFile(src, dest) {
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
}

// 1. Copy Public Assets
console.log('Copying public assets...');
copyDir('src/public', 'dist/public');

// 2. Copy Database Schema
console.log('Copying database schema...');
copyFile('src/infrastructure/db/schema.sql', 'dist/infrastructure/db/schema.sql');

console.log('Done!');
