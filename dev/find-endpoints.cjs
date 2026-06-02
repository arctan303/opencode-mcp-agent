const fs = require('fs');

const data = fs.readFileSync('C:\\Users\\30330\\AppData\\Local\\OpenCode\\opencode-cli.exe');
let current = '';
const minLen = 5;
const results = new Set();

for (let i = 0; i < data.length; i++) {
    const c = data[i];
    if (c >= 32 && c <= 126) {
        current += String.fromCharCode(c);
    } else {
        if (current.length >= minLen && (current.includes('/session') || current.includes('/history') || current.includes('/messages'))) {
            // filter out obvious css/html
            if (!current.includes('{') && !current.includes('}') && !current.includes('<') && !current.includes('>') && !current.includes('function')) {
                results.add(current);
            }
        }
        current = '';
    }
}

fs.writeFileSync('endpoints.txt', [...results].join('\n'));
