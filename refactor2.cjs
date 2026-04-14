const fs = require('fs');

function refactor() {
    const file = 'src/MonitorApp.tsx';
    let lines = fs.readFileSync(file, 'utf8').split('\n');
    
    // Replace MAIN wrapper
    const mainIdx = lines.findIndex(l => l.includes('{/* MAIN */}'));
    if (mainIdx !== -1) {
        let leftIdx = lines.findIndex((l, i) => i > mainIdx && l.includes('{/* LEFT */}'));
        if (leftIdx !== -1) {
            let leftEndIdx = leftIdx + 9; // <div style={{flex:1, display:'flex', ...}}>
            lines.splice(mainIdx, leftEndIdx - mainIdx + 1,
                '      {/* MAIN GRID */}',
                '      <div className="flex-1 grid grid-cols-[330px_1fr_250px] gap-2 p-2 overflow-hidden">',
                '        {/* LEFT COLUMN */}',
                '        <div className="flex flex-col gap-2 min-w-0 h-full overflow-y-auto pr-1">'
            );
        }
    }

    // Replace RIGHT VITALS
    const rightVitalsIdx = lines.findIndex(l => l.includes('{/* RIGHT VITALS */}'));
    if (rightVitalsIdx !== -1) {
        // The end of the file is closing the right vitals div, then main div, then root div.
        const endOfFileIdx = lines.length;
        // Search backwards for the last </div> before export default
        lines.splice(rightVitalsIdx, (endOfFileIdx - 7) - rightVitalsIdx + 1, 
            '        {/* RIGHT COLUMN */}',
            '        <VitalSignsPanel />'
        );
    }

    fs.writeFileSync(file, lines.join('\n'));
    console.log('Successfully refactored MonitorApp.tsx');
}

refactor();
