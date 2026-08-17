import fs from 'node:fs';

const authUi=fs.readFileSync('public/auth-mfa-ui.js','utf8');
const boot=fs.readFileSync('public/boot.js','utf8');

const must=(cond,msg)=>{if(!cond)throw new Error(msg)};

must(authUi.includes("mustChangePassword"),'login interceptor must handle forced password changes');
must(authUi.includes("/plattform-admin")&&authUi.includes("/kunden-admin")&&authUi.includes("/klassen-admin"),'admin continuations must be recognized');
must(authUi.includes("location.replace"),'login interceptor must navigate before admin boot continues');
must(boot.includes("/plattform-admin")&&boot.includes("/kunden-admin")&&boot.includes("/klassen-admin"),'boot continuation must support all admin areas');
console.log('forced-password-flow-check: ok');
