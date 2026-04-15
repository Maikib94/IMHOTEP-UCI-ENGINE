const fs = require('fs');
let c = fs.readFileSync('src/components/InstructorPanel.tsx', 'utf-8');
c = c.replace(/fontSize: '0\.3[0-9]rem'/g, "fontSize: '0.55rem', letterSpacing: '0.04em'");
c = c.replace(/fontSize: '0\.4[0-4]rem'/g, "fontSize: '0.65rem', letterSpacing: '0.06em'");
c = c.replace(/fontSize: '0\.4[5-9]rem'/g, "fontSize: '0.7rem', letterSpacing: '0.08em'");
c = c.replace(/fontSize: '0\.5[0-9]rem'/g, "fontSize: '0.8rem', letterSpacing: '0.1em'");
c = c.replace(/fontWeight: 700/g, "fontWeight: 900");
fs.writeFileSync('src/components/InstructorPanel.tsx', c);
