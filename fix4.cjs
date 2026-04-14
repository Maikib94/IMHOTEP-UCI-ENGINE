const fs = require('fs');
let s = fs.readFileSync('src/MonitorApp.tsx', 'utf8');

const target = `                VOLEMIA: {Math.round(bv)}ml
              </div>
                style={{
                  width: '100%',`;

const replacement = `                VOLEMIA: {Math.round(bv)}ml
              </div>
              <button
                onClick={function () {
                  var st = usePatientStore.getState();
                  st.setHemorrhageRate(st.hemorrhageRate > 0 ? 0 : 2);
                }}
                style={{
                  width: '100%',`;

if(s.includes(target)) {
    s = s.replace(target, replacement);
    fs.writeFileSync('src/MonitorApp.tsx', s);
    console.log('Fixed button');
} else {
    console.log('Target not found!');
}
