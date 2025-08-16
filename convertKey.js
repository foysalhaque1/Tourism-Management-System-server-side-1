const fs = require('fs');
const key = fs.readFileSync('./tourism-management-syste-465b0-firebase-adminsdk-service-key.json','utf8');
const base64 = Buffer.from(key).toString('base64');
console.log(base64);
