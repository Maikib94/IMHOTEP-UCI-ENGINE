const fs = require('fs');
const file = 'src/MonitorApp.tsx';
let lines = fs.readFileSync(file, 'utf8').split('\n');

// 1. Find ARDSStatusBar
const ardsIdx = lines.findIndex(l => l.includes('<ARDSStatusBar />'));
if (ardsIdx !== -1) {
    // 2. Find MAIN GRID after ARDSStatusBar
    const mainGridIdx = lines.findIndex((l, i) => i > ardsIdx && l.includes('{/* MAIN GRID */}'));
    if (mainGridIdx !== -1 && mainGridIdx - ardsIdx > 5) {
        // We have corruption between ARDSStatusBar and MAIN GRID! Delete it!
        lines.splice(ardsIdx + 1, mainGridIdx - ardsIdx - 1);
    }
}

// 3. Fix LEFT COLUMN missing start of Volemia
const leftColIdx = lines.findIndex(l => l.includes('{/* LEFT COLUMN */}'));
if (leftColIdx !== -1) {
    // The next few lines might be broken. Let's see if "color: '#ef4444'," is right after it.
    const brokenIdx = lines.findIndex((l, i) => i > leftColIdx && i < leftColIdx + 5 && l.includes("color: '#ef4444',"));
    if (brokenIdx !== -1) {
        // It's broken. Replace the broken block down to VOLEMIA:
        const volemiaStrIdx = lines.findIndex((l, i) => i > leftColIdx && i < leftColIdx + 10 && l.includes("VOLEMIA:"));
        if (volemiaStrIdx !== -1) {
            lines.splice(leftColIdx + 1, volemiaStrIdx - leftColIdx,
                '        <div className="flex flex-col gap-3 min-w-0 h-full overflow-y-auto pr-1">',
                '          {/* Stack everything vertically */}',
                '          {/* Volemia */}',
                '            <div',
                '              style={{',
                '                background: "#111827",',
                '                borderRadius: 10,',
                '                border: "1px solid rgba(255,255,255,0.05)",',
                '                padding: "8px 10px",',
                '                flexShrink: 0,',
                '              }}',
                '            >',
                '              <div',
                '                style={{',
                '                  fontSize: "0.55rem",',
                '                  fontWeight: 700,',
                '                  color: "#ef4444",',
                '                  marginBottom: 4,',
                '                }}',
                '              >',
                '                VOLEMIA: {Math.round(bv)}ml',
                '              </div>'
            );
            // I need to delete the extra </div> since I removed an extra div wrapper.
            // Wait, I should make sure I don't break the brackets again. The original had:
            // "Controls row" div, then "Volemia" div. 
            // Now I just put Volemia directly inside LEFT COLUMN flex-col. So I have 1 LESS wrapper!
            // I'll need to remove one closing `</div>` before RIGHT COLUMN.
        }
    }
}

// 4. Remove one closing </div> right before CENTER COLUMN since we removed the Controls Row wrapper
const centerIdx = lines.findIndex(l => l.includes('{/* CENTER COLUMN: Waveforms */}'));
if (centerIdx !== -1) {
    // Check if lines right above it are closing divs. We want to remove ONE.
    if (lines[centerIdx - 1].includes('</div>') && lines[centerIdx - 2].includes('</div>')) {
        // It currently has 3 closing divs, one for Torre, one for (missing) Controls Row wrapper, one for LEFT COLUMN!
        // Wait, earlier I replaced the Controls Row wrapper with `<div className="flex flex-col gap-2 shrink-0">`.
        // So there IS a wrapper! If I don't put a wrapper, I must delete a div.
        // Let's just wrap it again so the closing divs match!
    }
}

fs.writeFileSync(file, lines.join('\n'));
console.log('Fixed MonitorApp.tsx');
