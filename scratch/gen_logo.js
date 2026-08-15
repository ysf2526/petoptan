import fs from 'fs';

const logoPath = 'c:/petoptan/public/petivox-logo.png';
const targetPath = 'c:/petoptan/src/assets/petivoxLogoBase64.ts';

const b64 = fs.readFileSync(logoPath).toString('base64');
const content = `export const PETIVOX_LOGO_BASE64 = 'data:image/png;base64,${b64}';\n`;

fs.writeFileSync(targetPath, content, 'utf8');
console.log('Successfully generated petivoxLogoBase64.ts! Size:', b64.length);
