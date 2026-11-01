import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
// The three source columns are index, survivor level, cumulative XP.
const rows=readFileSync(new URL('../data/survivor-xp.tsv',import.meta.url),'utf8').trim().split(/\r?\n/).map(line=>line.split('\t').map(Number));
assert.equal(rows.length,245,'Survivor XP table must cover levels 1–245');
for(let i=0;i<rows.length;i++){
 const row=rows[i];assert.equal(row.length,3);assert.equal(row[0],i);assert.equal(row[1],i+1);
 assert.ok(Number.isSafeInteger(row[2])&&row[2]>=0&&(i===0||row[2]>rows[i-1][2]),'Invalid cumulative XP at level '+(i+1));
}
assert.equal(rows[0][2],0);
const meta={source:'https://wikily.gg/ja/ark-survival-ascended/xp-calculator',checkedAt:'2026-11-02'};
const output='// Generated from data/survivor-xp.tsv supplied by the user; do not round or interpolate.\nwindow.ARKSurvivorXPData=Object.freeze({\n ...'+JSON.stringify(meta)+',\n cumulativeXP:Object.freeze('+JSON.stringify(rows.map(row=>row[2]))+')\n});\n';
writeFileSync(new URL('../survivor-xp-data.js',import.meta.url),output);
