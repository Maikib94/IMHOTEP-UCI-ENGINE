const fs = require('fs');
let content = fs.readFileSync('src/MonitorApp.tsx', 'utf8');

// Fix closing tags at EOF
const badEnd = '        <VitalSignsPanel />\r\n    </div>\r\n  );\r\n};\r\n\r\nexport default MonitorApp;';
const badEndUnix = '        <VitalSignsPanel />\n    </div>\n  );\n};\n\nexport default MonitorApp;';
const goodEnd = '        <VitalSignsPanel />\n      </div>\n    </div>\n  );\n};\n\nexport default MonitorApp;';

if (content.includes(badEnd)) {
    content = content.replace(badEnd, goodEnd);
} else if (content.includes(badEndUnix)) {
    content = content.replace(badEndUnix, goodEnd);
} else {
    // try loosely
    content = content.replace(/<VitalSignsPanel \/>\s*<\/div>\s*\);\s*};\s*export default MonitorApp;/, goodEnd);
}

// Strip WaveformMonitor from left panel
const wm = '<div style={{ flex: 1, minHeight: 140 }}>\r\n            <WaveformMonitor />\r\n          </div>';
const wmUnix = '<div style={{ flex: 1, minHeight: 140 }}>\n            <WaveformMonitor />\n          </div>';
if (content.includes(wm)) content = content.replace(wm, '');
else content = content.replace(wmUnix, '');

// Insert Center Waveform monitor
const center = '{/* CENTER COLUMN */}\n        <div className="flex flex-col min-w-0 bg-[#060a12] rounded-xl border border-white/5 p-2 overflow-hidden h-full shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]">\n          <WaveformMonitor />\n        </div>\n\n        {/* RIGHT COLUMN */}';
content = content.replace('{/* RIGHT COLUMN */}', center);

fs.writeFileSync('src/MonitorApp.tsx', content);
console.log('Fixed syntax');
