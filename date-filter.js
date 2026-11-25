/* Report snapshots are month-to-date totals: never sum multiple report dates. */
const ReportDates = (() => {
 const keys=['performance','branches','downsell','downsellDetails','tolDownsellDetails','solutions'];
 const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'');
 function merge(sources){
  const out={...sources.at(-1)};
  for(const key of keys){
   const days=new Map();
   for(const source of sources){
    const grouped=new Map();
    for(const row of source?.[key]||[]){const d=row['Report Date'];if(!valid(d))continue;if(!grouped.has(d))grouped.set(d,[]);grouped.get(d).push(row);}
    for(const [d,rows] of grouped)days.set(d,rows);
   }
   out[key]=[...days.keys()].sort().flatMap(d=>days.get(d));
  }
  return out;
 }
 function filter(source,start,end){
  if(!valid(start)||!valid(end)||start>end)throw Error('กรุณาเลือกวันที่เริ่มต้นไม่เกินวันที่สิ้นสุด');
  return {...source,...Object.fromEntries(keys.map(k=>[k,(source[k]||[]).filter(r=>r['Report Date']>=start&&r['Report Date']<=end)]))};
 }
 const dates=source=>[...new Set(keys.flatMap(k=>(source?.[k]||[]).map(r=>r['Report Date'])).filter(valid))].sort();
 return {keys,merge,filter,dates};
})();
