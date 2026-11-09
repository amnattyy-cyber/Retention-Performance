const SPREADSHEET_ID = "1gw9c97wtVitsn5B8P9ugwavD4xOGf3M_RScNGvk_hNM";
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`;
const PERF_HEADERS = ["Report Date","Service","Region","No Shop","Rev Request","Rev Save","Churn Value","Budget Churn Month","Cutoff Day","Days in Month","Save Rate","RR Churn","RR / Cap","Tier"];
const DOWN_HEADERS = ["Report Date","Region","No Shop","Budget Downsell","Downsell Retention","Downsell Aftersale","Cutoff Day","Days in Month","Total Downsell","RR Downsell","MTD / Budget","RR / Budget","Over Budget Records","Status"];
const BRANCH_HEADERS = ["Report Date","Service","Area Group","Region","Shop Name","Shop Type","Request Sep","Request Oct","Request MoM","Request %MoM","Save Sep","Save Oct","Save MoM","Save %MoM","Churn Sep","Churn Oct","Churn MoM","Churn %MoM","Save Rate Sep","Save Rate Oct","Save Rate MoM","Budget Churn","MTD Budget Churn","Over Budget","Tier","Cutoff Day","Days in Month"];
const DOWNSELL_DETAIL_HEADERS = ["Report Date","Level","Area Group","Region","Shop Name","Shop Type","No Shop","Budget Downsell","Downsell Retention","Downsell Aftersale","Total Downsell","RR Downsell","MTD / Budget","RR / Budget","Over Budget Records","Status","Last Month","Cutoff Day","Days in Month","Downsell %MoM"];
const SOLUTION_HEADERS = ["Report Date","Product","Area Group","Region","Shop Name","Solution Name","Request Sub","Rev Request","Rev Save","Churn Value","Cutoff Day","Days in Month"];
const GVIZ_RANGES = {
  Performance_Daily: "A1:N1000",
  Downsell_Area_Daily: "A1:N1012",
  Branch_Performance_Daily: "A1:AA2050",
  Downsell_Performance_Daily: "A1:T1200",
  Downsell_TOL_Daily: "A1:T1000",
  Solution_Performance_Daily: "A1:L10000"
};
const AREA_GROUPS = {
  "BMA 5 Area": ["BMA I - North West","BMA II - South West","BMA III - North East","BMA IV - South East","BMA V - Central"],
  UPC1: ["UPC - Central Northeast","UPC - Lower North","UPC - Lower Northeast","UPC - Upper North","UPC - Upper Northeast"],
  UPC2: ["UPC - Central","UPC - East","UPC - Upper South","UPC - West","UPC - Lower South"]
};
let store = { performance: [], downsell: [], branches: [], downsellDetails: [], solutions: [], live: false, branchLive: false, downsellDetailLive: false, solutionLive: false };
let comparisonMonths = { before: "September", now: "October" };
const periodTemplates = new Map();

function renderPeriodLabels(prior, latest){
  const month=(value,short=false)=>{
    const date=new Date(`${dateKey(value)}T00:00:00`);
    if(isNaN(date)) return "—";
    return short ? `${date.toLocaleDateString("en-US",{month:"short"})}-${String(date.getFullYear()).slice(-2)}` : date.toLocaleDateString("en-US",{month:"long"});
  };
  comparisonMonths={before:month(prior),now:month(latest)};
  document.querySelectorAll("h2,p,caption,th").forEach(element=>{
    if(!periodTemplates.has(element) && /September|October|Sep-26|Oct-26/.test(element.textContent)) periodTemplates.set(element,element.textContent);
  });
  periodTemplates.forEach((template,element)=>{
    const labels={"Sep-26":month(prior,true),"Oct-26":month(latest,true),September:comparisonMonths.before,October:comparisonMonths.now};
    element.textContent=template.replace(/Sep-26|Oct-26|September|October/g,key=>labels[key]);
  });
}

const $ = id => document.getElementById(id);
const n = value => Number(value || 0);
const sum = (rows, key) => rows.reduce((total,row)=>total+n(row[key]),0);
const fmtMoney = value => new Intl.NumberFormat("th-TH",{notation:"compact",maximumFractionDigits:2}).format(n(value));
const fmtFull = value => new Intl.NumberFormat("th-TH",{maximumFractionDigits:0}).format(n(value));
const fmtSignedFull = value => `${n(value)>0?"+":""}${fmtFull(value)}`;
const fmtPct = value => `${(n(value)*100).toFixed(1)}%`;
const fmtPP = value => `${value>=0?"+":""}${(n(value)*100).toFixed(2)} pp`;
const fmtDelta = value => `${value>=0?"+":""}${(n(value)*100).toFixed(1)}%`;
const escapeHtml = value => String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
const dateKey = value => {
  if (typeof value==="number"&&value>20000&&value<80000) return new Date(Date.UTC(1899,11,30)+value*86400000).toISOString().slice(0,10);
  if (value instanceof Date) return value.toISOString().slice(0,10);
  const text=String(value||"");
  const match=text.match(/Date\((\d+),(\d+),(\d+)\)/);
  if(match) return `${match[1]}-${String(+match[2]+1).padStart(2,"0")}-${String(match[3]).padStart(2,"0")}`;
  return text.slice(0,10);
};
const fmtDate = value => {
  const date=new Date(`${dateKey(value)}T00:00:00`);
  return isNaN(date)?"—":date.toLocaleDateString("th-TH",{day:"numeric",month:"short",year:"numeric"});
};
const deltaClass = (value,inverse=false) => Math.abs(value)<.0005?"neutral":((inverse?value<0:value>0)?"good":"bad");
const rowObjects = (rows,headers) => rows.map(row=>Object.fromEntries(headers.map((header,index)=>[header,index===0?dateKey(row[index]):row[index]])));
const delta = (now,before) => before?(now-before)/before:0;
const normalizeShopType = value => {
  const text=String(value||"").trim().toLowerCase().replaceAll("_"," ");
  return ({matching:"Matching","non matching":"Non Matching",hall:"Hall"})[text]||String(value||"").trim();
};

function inScope(region,group,selectedRegion){
  if(!region||region==="ALL") return false;
  if(group!=="ALL"&&!AREA_GROUPS[group]?.includes(region)) return false;
  return selectedRegion==="ALL"||region===selectedRegion;
}

function scopeLabel(group,region){
  if(region!=="ALL") return region;
  return group==="ALL"?"ALL • 15 Areas":group;
}

function validDownsellRow(row){
 const regions=Object.values(AREA_GROUPS).flat(),level=String(row.Level).toUpperCase();
 return /^\d{4}-\d{2}-\d{2}$/.test(row["Report Date"])&&regions.includes(row.Region)&&["AREA","BRANCH"].includes(level)&&(level==="AREA"||typeof row["Shop Name"]==="string"&&/[a-zA-Zก-๙]/.test(row["Shop Name"]))&&["Budget Downsell","Total Downsell","RR Downsell"].every(k=>typeof row[k]==="number"&&Number.isFinite(row[k]));
}
function loadGviz(sheet){
  return new Promise((resolve,reject)=>{
    const callback=`__gviz_${sheet.replace(/\W/g,"_")}_${Date.now()}`;
    const timer=setTimeout(()=>{cleanup();reject(new Error("timeout"));},12000);
    const script=document.createElement("script");
    function cleanup(){clearTimeout(timer);delete window[callback];script.remove();}
    window[callback]=response=>{
      cleanup();
      if(!response?.table){reject(new Error("invalid response"));return;}
      resolve(response.table.rows.map(row=>row.c.map(cell=>cell?.v??"")));
    };
    script.onerror=()=>{cleanup();reject(new Error("network"));};
    const range=GVIZ_RANGES[sheet]||"A1:Z1000";
    script.src=`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json;responseHandler:${callback}&sheet=${encodeURIComponent(sheet)}&range=${encodeURIComponent(range)}&headers=1&cache=${Date.now()}`;
    document.head.appendChild(script);
  });
}

function areaGroupFor(region){
  return Object.entries(AREA_GROUPS).find(([,areas])=>areas.includes(region))?.[0]||"";
}

function solutionFallbackRows(){
  const products=window.SOLUTION_ANALYSIS?.products||{};
  return Object.entries(products).flatMap(([product,data])=>(data.areas||[]).flatMap(area=>(area.branches||[]).flatMap(branch=>(branch.solutions||[]).map(solution=>({
    "Report Date":"2026-09-05",Product:product,"Area Group":areaGroupFor(area.area),Region:area.area,"Shop Name":branch.branch,
    "Solution Name":solution.solution,"Request Sub":solution.cases,"Rev Request":solution.request,"Rev Save":solution.save,"Churn Value":solution.churn,"Cutoff Day":5,"Days in Month":30
  })))));
}


let liveMonthlyStore=null;
let liveMonthlyStatus=null;
let selectedReportMonth="live";
let monthSelectionVersion=0;
let octoberSnapshotPromise=null;
const MONTH_ARCHIVES={"2026-10":{label:"October 2026",url:"archives/2026-10.json?v=20261106-oct31",note:"ยอดปิดเดือน October 2026 • Retention TMH/TOL, Downsell TMH/TOL และ Solution ณ 31 Oct 2026"}};
function snapshotStore(data){
  data=window.correctRetentionNames(data);
  return {performance:rowObjects(data.performance,PERF_HEADERS),branches:rowObjects(data.branches,BRANCH_HEADERS),
    downsell:rowObjects(data.tmh.filter(row=>row[1]==="AREA").map(row=>[row[0],row[3],row[6],row[7],row[8],row[9],row[17],row[18],row[10],row[11],row[12],row[13],row[14],row[15]]),DOWN_HEADERS),downsellDetails:rowObjects(data.tmh,DOWNSELL_DETAIL_HEADERS),
    tolDownsellDetails:rowObjects(data.tol,DOWNSELL_DETAIL_HEADERS).filter(validDownsellRow),
    solutions:rowObjects(data.solutions,SOLUTION_HEADERS),live:true,branchLive:true,
    downsellDetailLive:true,tolDownsellDetailLive:true,solutionLive:true};
}
function renderMonthControls(){
  const latest=liveMonthlyStore?.performance.map(row=>row["Report Date"]).sort().at(-1);
  const liveLabel=latest?new Date(latest+"T00:00:00").toLocaleDateString("en-US",{month:"long",year:"numeric"}):"เดือนล่าสุด";
  $("monthTabs").innerHTML=Object.entries(MONTH_ARCHIVES).map(([key,item])=>'<button type="button" class="partition-tab '+(selectedReportMonth===key?'is-active':'')+'" data-month="'+key+'" aria-pressed="'+(selectedReportMonth===key)+'">'+item.label+'</button>').join("")+
    '<button type="button" class="partition-tab '+(selectedReportMonth==="live"?'is-active':'')+'" data-month="live" aria-pressed="'+(selectedReportMonth==="live")+'">'+liveLabel+' • ล่าสุด</button>';
  $("monthNote").textContent=selectedReportMonth==="live"?"เดือนล่าสุด • อัปเดตจาก Google Sheet ทุก 5 นาทีเมื่อเปิดหน้านี้":MONTH_ARCHIVES[selectedReportMonth].note;
}
async function selectReportMonth(month){
  const version=++monthSelectionVersion;
  try{
    let next=liveMonthlyStore;
    if(month!=="live"){
      const archive=MONTH_ARCHIVES[month];if(!archive)return;
      $("monthNote").textContent="กำลังโหลดข้อมูลย้อนหลัง...";
      if(!octoberSnapshotPromise)octoberSnapshotPromise=fetch(archive.url).then(response=>{if(!response.ok)throw new Error("Archive unavailable");return response.json();}).catch(error=>{octoberSnapshotPromise=null;throw error;});
      next=snapshotStore(await octoberSnapshotPromise);
    }
    if(version!==monthSelectionVersion||!next)return;
    selectedReportMonth=month;store=next;
    $("solutionBranchFilter").value="ALL";
    renderMonthControls();populateRegions();render();
    if(month==="live"&&liveMonthlyStatus){$("dataStatus").className=liveMonthlyStatus.className;$("dataStatus").innerHTML=liveMonthlyStatus.html;}
    if(month!=="live"){$("dataStatus").className="status-pill";$("dataStatus").innerHTML="<span></span>October • ข้อมูลย้อนหลังที่บันทึกไว้";}
  }catch(error){if(version===monthSelectionVersion){renderMonthControls();$("monthNote").textContent="โหลดข้อมูลย้อนหลังไม่สำเร็จ กรุณาลองเลือกเดือนอีกครั้ง";}}
}


let dashboardLoadInProgress=false;
function validateDashboardData(data){
 const numeric=(rows,fields)=>rows.length&&rows.every(row=>fields.every(field=>typeof row[field]==="number"&&Number.isFinite(row[field])));
 const latest=rows=>{const date=rows.map(r=>r["Report Date"]).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort().at(-1);return rows.filter(r=>date&&r["Report Date"]===date);};
 const perf=latest(data.performance),branch=latest(data.branches);
 if(!numeric(perf,["Rev Request","Rev Save","Churn Value","Budget Churn Month"])||!numeric(branch,["Request Oct","Save Oct","Churn Oct","Budget Churn","MTD Budget Churn"]))throw Error("Retention invalid");
 for(const product of ["TMH","TOL"]){
  const areas=perf.filter(r=>r.Service===product),shops=branch.filter(r=>r.Service===product);
  if(new Set(areas.map(r=>r.Region)).size!==15||new Set(shops.map(r=>r.Region)).size!==15)throw Error("Missing Retention areas");
  if(shops.some(r=>r["Report Date"]!==areas[0]["Report Date"])||Math.abs(sum(areas,"Rev Save")-sum(shops,"Save Oct"))>1)throw Error("Retention totals mismatch");
 }
 for(const dataset of [data.downsellDetails,data.tolDownsellDetails]){
  const rows=latest(dataset),areas=rows.filter(r=>r.Level==="AREA"),shops=rows.filter(r=>r.Level==="BRANCH");
  if(!numeric(rows,["Budget Downsell","Total Downsell","RR Downsell","Downsell Retention","Downsell Aftersale"])||areas.length!==15||!shops.length)throw Error("Downsell invalid");
  if(Math.abs(sum(areas,"Total Downsell")-sum(shops,"Total Downsell"))>1)throw Error("Downsell totals mismatch");
 }
 const solution=latest(data.solutions);
 if(!numeric(solution,["Rev Request","Rev Save","Churn Value"])||["TMH","TOL"].some(p=>new Set(solution.filter(r=>r.Product===p&&Object.values(AREA_GROUPS).flat().includes(r.Region)).map(r=>r.Region)).size!==15))throw Error("Solution invalid");
 return data;
}
async function loadData(){
 if(dashboardLoadInProgress)return;
 dashboardLoadInProgress=true;
 const status=$("dataStatus");
 status.className="status-pill";status.innerHTML="<span></span>กำลังตรวจสอบข้อมูลทุกหน้า...";
 try{
  const results=await Promise.allSettled(["Performance_Daily","Branch_Performance_Daily","Downsell_Performance_Daily","Downsell_TOL_Daily","Solution_Performance_Daily"].map(loadGviz));
  let next,live=false;
  try{
   if(results.some(r=>r.status!=="fulfilled"))throw Error("Load failed");
   const [performance,branches,tmh,tol,solutions]=results.map(r=>r.value);
   next=validateDashboardData(snapshotStore({performance,branches,tmh,tol,solutions}));live=true;
  }catch(error){
   if(liveMonthlyStore){next=liveMonthlyStore;}
   else{
    const response=await fetch("archives/2026-11-08.json?v=20261110-names");
    if(!response.ok)throw Error("Verified snapshot unavailable");
    next=validateDashboardData(snapshotStore(await response.json()));
   }
  }
  store=next;liveMonthlyStore=next;
  const label=live?"Live • ตรวจสอบข้อมูลครบทุกหน้า":"ข้อมูลสำรองที่ตรวจสอบแล้ว • ต้นทางโหลดไม่ครบหรือสูตรผิดพลาด";
  status.className="status-pill "+(live?"live":"fallback");status.innerHTML="<span></span>"+label;
  liveMonthlyStatus={className:status.className,html:status.innerHTML};
  await selectReportMonth(selectedReportMonth);
  if(selectedReportMonth==="live"&&!live)$("monthNote").textContent="กำลังแสดงชุดข้อมูลล่าสุดที่ตรวจสอบผ่าน ตามวันที่ในแต่ละหน้า • ระบบจะลองเชื่อมต้นทางใหม่ทุก 5 นาที";
 }catch(error){
  status.className="status-pill fallback";status.innerHTML="<span></span>โหลดข้อมูลไม่สำเร็จ กรุณากดอัปเดตข้อมูลเพื่อลองใหม่";
 }finally{dashboardLoadInProgress=false;}
}

function populateRegions(){
  const select=$("regionFilter"),group=$("areaGroupFilter").value,current=select.value;
  const validRegions=new Set(Object.values(AREA_GROUPS).flat());
  const regions=[...new Set([...store.performance.map(row=>row.Region),...store.downsell.map(row=>row.Region),...store.branches.map(row=>row.Region),...store.downsellDetails.map(row=>row.Region),...store.solutions.map(row=>row.Region)].filter(region=>validRegions.has(region)&&(group==="ALL"||AREA_GROUPS[group]?.includes(region))))].sort();
  select.innerHTML='<option value="ALL">ทุกพื้นที่ในกลุ่ม</option>'+regions.map(region=>`<option value="${escapeHtml(region)}">${escapeHtml(region)}</option>`).join("");
  select.value=regions.includes(current)?current:"ALL";
}

function aggregatePerformance(rows){
  const request=sum(rows,"Rev Request"),save=sum(rows,"Rev Save"),churn=sum(rows,"Churn Value"),budget=sum(rows,"Budget Churn Month"),rr=sum(rows,"RR Churn");
  return {request,save,churn,budget,rr,saveRate:request?save/request:0,rrCap:budget?rr/budget:0,shops:sum(rows,"No Shop")};
}

function latestRows(service,group,region){
  let pool=store.performance.filter(row=>service==="ALL"||row.Service===service);
  if(store.live) pool=pool.filter(row=>inScope(row.Region,group,region));
  else if(group==="ALL"&&region==="ALL"&&pool.some(row=>row.Region==="ALL")) pool=pool.filter(row=>row.Region==="ALL");
  else pool=pool.filter(row=>inScope(row.Region,group,region));
  const dates=[...new Set(pool.map(row=>row["Report Date"]))].sort(),latest=dates.at(-1);
  if(!latest)return {latest:null,prior:null,now:[],before:[]};
  const priorDate=new Date(latest+"T00:00:00");priorDate.setDate(1);priorDate.setMonth(priorDate.getMonth()-1);const priorMonth=priorDate.getFullYear()+"-"+String(priorDate.getMonth()+1).padStart(2,"0");
  const priorDay=Math.min(Number(latest.slice(8,10)),new Date(priorDate.getFullYear(),priorDate.getMonth()+1,0).getDate());
  const priorLimit=priorMonth+"-"+String(priorDay).padStart(2,"0");
  const prior=dates.filter(date=>date.slice(0,7)===priorMonth&&date<=priorLimit).at(-1);
  return {latest,prior,now:pool.filter(row=>row["Report Date"]===latest),before:pool.filter(row=>row["Report Date"]===prior)};
}

function renderKpis(now,before){
  const items=[
    ["Request",fmtMoney(now.request),"ล้านบาท",delta(now.request,before.request),false,"#1c3f79"],
    ["Save",fmtMoney(now.save),"ล้านบาท",delta(now.save,before.save),false,"#00a7a0"],
    ["Churn",fmtMoney(now.churn),"ล้านบาท",delta(now.churn,before.churn),true,"#d83578"],
    ["Save rate",fmtPct(now.saveRate),`เปลี่ยน ${fmtPP(now.saveRate-before.saveRate)}`,now.saveRate-before.saveRate,false,"#26a269"],
    ["Run rate / Cap",fmtPct(now.rrCap),now.rrCap>1?"สูงกว่า Cap":"อยู่ใน Cap",1-now.rrCap,false,"#f09b45"]
  ];
  $("kpiGrid").innerHTML=items.map(([label,value,note,difference,inverse,color])=>`<article class="kpi" style="--accent:${color}"><div class="kpi__label">${label}</div><div class="kpi__value">${value}</div><div class="kpi__note"><span class="delta ${deltaClass(difference,inverse)}">${label==="Save rate"?note:label==="Run rate / Cap"?note:fmtDelta(difference)+" MoM"}</span>${label!=="Save rate"&&label!=="Run rate / Cap"?` • ${note}`:""}</div></article>`).join("");
}

function serviceCard(service,group,region){
  const {now,before}=latestRows(service,group,region),current=aggregatePerformance(now),previous=aggregatePerformance(before),churnMom=delta(current.churn,previous.churn),savePP=current.saveRate-previous.saveRate;
  return `<article class="service-card ${service.toLowerCase()}"><div class="service-card__head"><div><small>SERVICE PERFORMANCE</small><h3>${service}</h3></div><div class="service-card__rate"><strong>${fmtPct(current.saveRate)}</strong><small>Save rate <span class="delta ${deltaClass(savePP)}">${fmtPP(savePP)}</span></small></div></div><div class="service-card__metrics"><div class="service-card__metric"><small>Request</small><strong>${fmtMoney(current.request)}</strong></div><div class="service-card__metric"><small>Save</small><strong>${fmtMoney(current.save)}</strong></div><div class="service-card__metric"><small>Churn</small><strong>${fmtMoney(current.churn)}</strong></div></div><div class="service-card__foot"><span>Churn MoM <strong>${fmtDelta(churnMom)}</strong></span><span>RR / Cap <strong>${fmtPct(current.rrCap)}</strong></span></div></article>`;
}

function comparisonCard(label,now,before,inverse=false){
  const maximum=Math.max(now,before)||1,difference=delta(now,before);
  return `<article class="comparison-card"><div class="comparison-card__head"><h3>${label}</h3><span class="delta ${deltaClass(difference,inverse)}">${fmtDelta(difference)}</span></div><div class="comparison-chart"><div class="month-col"><strong>${fmtMoney(before)}</strong><div class="month-bar" style="height:${Math.max(5,before/maximum*100)}%"></div><small>${comparisonMonths.before}</small></div><div class="month-col aug"><strong>${fmtMoney(now)}</strong><div class="month-bar" style="height:${Math.max(5,now/maximum*100)}%"></div><small>${comparisonMonths.now}</small></div></div><div class="comparison-note">${inverse?(difference<=0?"แนวโน้มดีขึ้น: ลดลงจากเดือนก่อน":"ควบคุมเพิ่ม: สูงขึ้นจากเดือนก่อน"):(difference>=0?"เติบโตจากเดือนก่อน":"ลดลงจากเดือนก่อน")}</div></article>`;
}

function groupAreas(rows){
  const groups=new Map();
  rows.forEach(row=>{const items=groups.get(row.Region)||[];items.push(row);groups.set(row.Region,items);});
  return [...groups].map(([region,items])=>({region,...aggregatePerformance(items)}));
}

function areaSummary(rows){
  const request=sum(rows,"Rev Request"),save=sum(rows,"Rev Save"),churn=sum(rows,"Churn Value"),budget=sum(rows,"Budget Churn Month");
  const mtdBudget=rows.reduce((total,row)=>{const days=n(row["Days in Month"]),cutoff=n(row["Cutoff Day"]);return total+(days?n(row["Budget Churn Month"])*cutoff/days:0);},0);
  return {request,save,churn,budget,mtdBudget,saveRate:request?save/request:0,overBudget:mtdBudget?churn/mtdBudget:0};
}

function tierStatus(row){
  if(row.overBudget<=1&&row.saveRateOct>=.88) return {code:"T1",text:"T1 • In Cap / Save ≥ 88%"};
  if(row.overBudget>1&&row.saveRateOct>=.88) return {code:"T2",text:"T2 • Over Cap / Save ≥ 88%"};
  if(row.overBudget>1&&row.saveRateOct<.88) return {code:"T3",text:"T3 • Over Cap / Save < 88%"};
  return {code:"WATCH",text:"Watch • In Cap / Save < 88%"};
}

function comparisonRow(region,july,august){
  const row={region,requestSep:july.request,requestOct:august.request,saveSep:july.save,saveOct:august.save,churnSep:july.churn,churnOct:august.churn,saveRateSep:july.saveRate,saveRateOct:august.saveRate,budget:august.budget,mtdBudget:august.mtdBudget,overBudget:august.overBudget};
  row.requestDiff=row.requestOct-row.requestSep;row.requestMom=delta(row.requestOct,row.requestSep);
  row.saveDiff=row.saveOct-row.saveSep;row.saveMom=delta(row.saveOct,row.saveSep);
  row.churnDiff=row.churnOct-row.churnSep;row.churnMom=delta(row.churnOct,row.churnSep);
  row.saveRateDiff=row.saveRateOct-row.saveRateSep;row.tier=tierStatus(row);
  return row;
}

function areaFocusData(service,group,region){
  const pool=store.performance.filter(row=>row.Region&&row.Region!=="ALL"&&(service==="ALL"||row.Service===service)&&inScope(row.Region,group,region));
  const {latest,prior}=latestRows(service,group,region),regions=[...new Set(pool.map(row=>row.Region))].sort();
  const rows=regions.map(area=>comparisonRow(area,areaSummary(pool.filter(row=>row.Region===area&&row["Report Date"]===prior)),areaSummary(pool.filter(row=>row.Region===area&&row["Report Date"]===latest))));
  const total=comparisonRow("Selection Total",areaSummary(pool.filter(row=>row["Report Date"]===prior)),areaSummary(pool.filter(row=>row["Report Date"]===latest)));
  return {rows,total,latest,prior};
}

const tone=(value,inverse=false)=>deltaClass(value,inverse);
const serviceClass=service=>service==="TMH"?"tmh":service==="TOL"?"tol":"all";
function focusRowHtml(row,selectedRegion,isTotal=false){
  const selected=!isTotal&&selectedRegion!=="ALL"&&row.region===selectedRegion;
  return `<tr class="${isTotal?"grand-total ":""}${selected?"is-focus":""}"${selected?' aria-current="true"':""}><th class="region-cell" scope="row">${escapeHtml(row.region)}${selected?'<span class="focus-mark">Focus</span>':""}</th><td>${fmtFull(row.requestSep)}</td><td>${fmtFull(row.requestOct)}</td><td class="cell-tone ${tone(row.requestDiff,true)}">${fmtSignedFull(row.requestDiff)}</td><td class="cell-tone ${tone(row.requestMom,true)}">${fmtDelta(row.requestMom)}</td><td>${fmtFull(row.saveSep)}</td><td>${fmtFull(row.saveOct)}</td><td class="cell-tone ${tone(row.saveDiff)}">${fmtSignedFull(row.saveDiff)}</td><td class="cell-tone ${tone(row.saveMom)}">${fmtDelta(row.saveMom)}</td><td>${fmtFull(row.churnSep)}</td><td>${fmtFull(row.churnOct)}</td><td class="cell-tone ${tone(row.churnDiff,true)}">${fmtSignedFull(row.churnDiff)}</td><td class="cell-tone ${tone(row.churnMom,true)}">${fmtDelta(row.churnMom)}</td><td>${fmtPct(row.saveRateSep)}</td><td>${fmtPct(row.saveRateOct)}</td><td class="cell-tone ${tone(row.saveRateDiff)}">${fmtPP(row.saveRateDiff)}</td><td>${fmtFull(row.budget)}</td><td>${fmtFull(row.mtdBudget)}</td><td class="over-budget ${row.overBudget>1?"bad":"good"}">${fmtPct(row.overBudget)}</td><td><span class="tier-pill ${row.tier.code.toLowerCase()}" title="${escapeHtml(row.tier.text)}">${row.tier.code}</span></td></tr>`;
}

function renderAreaFocusTable(service,group,selectedRegion){
  const data=areaFocusData(service,group,selectedRegion);
  $("focusTableService").textContent=service==="ALL"?"TMH + TOL":service;
  $("focusTableService").className=`product-badge ${serviceClass(service)}`;
  $("focusTableCount").textContent=`${data.rows.length} ${data.rows.length===1?"Area":"Areas"}`;
  $("focusTableBody").innerHTML=data.rows.length?data.rows.map(row=>focusRowHtml(row,selectedRegion)).join("")+focusRowHtml(data.total,selectedRegion,true):'<tr><td colspan="20" class="empty-state">ไม่มีข้อมูลตามตัวกรอง</td></tr>';
}

function bars(target,rows,key,{max,sort="desc",kind="teal",suffix="%",noteKey}={}){
  const sorted=[...rows].sort((a,b)=>sort==="asc"?a[key]-b[key]:b[key]-a[key]).slice(0,6),ceiling=max||Math.max(...sorted.map(item=>item[key]),1);
  $(target).innerHTML=sorted.map(item=>`<div class="bar-row"><div class="bar-label" title="${escapeHtml(item.region)}">${escapeHtml(item.region)}</div><div class="bar-track"><div class="bar-fill ${kind}" style="width:${Math.min(100,item[key]/ceiling*100)}%"></div></div><div class="bar-value">${suffix==="%"?fmtPct(item[key]):fmtMoney(item[key])}</div>${noteKey?`<div class="bar-sub">${noteKey(item)}</div>`:""}</div>`).join("")||'<p>ไม่มีข้อมูลตามตัวกรอง</p>';
}

function downsellData(group,region){
  let pool=store.downsell;
  if(store.live) pool=pool.filter(row=>inScope(row.Region,group,region));
  else if(group==="ALL"&&region==="ALL"&&pool.some(row=>row.Region==="ALL")) pool=pool.filter(row=>row.Region==="ALL");
  else pool=pool.filter(row=>inScope(row.Region,group,region));
  const latest=[...new Set(pool.map(row=>row["Report Date"]))].sort().at(-1),latestPool=pool.filter(row=>row["Report Date"]===latest);
  return {latest,rows:latestPool.filter(row=>row.Region!=="ALL"),total:{budget:sum(latestPool,"Budget Downsell"),retention:sum(latestPool,"Downsell Retention"),after:sum(latestPool,"Downsell Aftersale"),mtd:sum(latestPool,"Total Downsell"),rr:sum(latestPool,"RR Downsell"),over:sum(latestPool,"Over Budget Records"),shops:sum(latestPool,"No Shop")}};
}

function renderDownsell(group,region){
  const data=downsellData(group,region),total=data.total,mtdPct=total.budget?total.mtd/total.budget:0,rrPct=total.budget?total.rr/total.budget:0,mix=total.mtd?total.retention/total.mtd:0;
  $("downsellDate").textContent=fmtDate(data.latest);
  $("downsellSummary").innerHTML=`<div class="donut" style="--donut:${Math.min(100,mtdPct*100)}%"><div class="donut__label"><strong>${fmtPct(mtdPct)}</strong><small>MTD / Budget</small></div></div><div class="downsell-details"><div class="detail-stat"><small>Budget</small><strong>${fmtMoney(total.budget)}</strong></div><div class="detail-stat"><small>Downsell MTD</small><strong>${fmtMoney(total.mtd)}</strong></div><div class="detail-stat alert"><small>Run rate / Budget</small><strong>${fmtPct(rrPct)}</strong></div><div class="detail-stat alert"><small>Projected gap</small><strong>${fmtMoney(Math.max(0,total.rr-total.budget))}</strong></div><div class="mix-bar"><small>สัดส่วนประเภท Downsell</small><div class="mix-bar__track"><div class="mix-bar__retention" style="width:${mix*100}%"></div><div class="mix-bar__after" style="width:${(1-mix)*100}%"></div></div><div class="mix-legend"><span>Retention ${fmtPct(mix)}</span><span>Aftersale ${fmtPct(1-mix)}</span></div></div></div>`;
  const areas=data.rows.map(row=>({region:row.Region,rrPct:n(row["RR / Budget"]),over:n(row["Over Budget Records"]),shops:n(row["No Shop"])}));
  bars("downsellBars",areas,"rrPct",{max:Math.max(1.5,...areas.map(item=>item.rrPct)),kind:"risk",noteKey:item=>`${fmtFull(item.over)} จาก ${fmtFull(item.shops)} records เกิน Budget`});
  return {data,total,mtdPct,rrPct};
}

function renderInsights(now,before,areas,downsell){
  const worstSave=[...areas].sort((a,b)=>a.saveRate-b.saveRate)[0],worstRR=[...areas].sort((a,b)=>b.rrCap-a.rrCap)[0],churnMom=delta(now.churn,before.churn),gap=Math.max(0,downsell.total.rr-downsell.total.budget);
  const items=[["signal","MoM signal",`Save rate เปลี่ยน <strong>${fmtPP(now.saveRate-before.saveRate)}</strong> ขณะที่ Churn <strong>${fmtDelta(churnMom)}</strong> จากงวดก่อน`],["risk","Priority area",worstSave?`Save rate ต่ำสุดคือ <strong>${escapeHtml(worstSave.region)}</strong> (${fmtPct(worstSave.saveRate)}) และ RR / Cap สูงสุดคือ <strong>${escapeHtml(worstRR.region)}</strong> (${fmtPct(worstRR.rrCap)})`:"ไม่มีข้อมูล Area ตามตัวกรอง"],["action","Daily action",gap>0?`Run rate Downsell สูงกว่า Budget ราว <strong>${fmtMoney(gap)}</strong> ควรทบทวนเคส over-budget และ owner รายพื้นที่ทุกวัน`:`Run rate ยังอยู่ใน Budget ควรรักษาจังหวะและติดตามพื้นที่ใกล้เกณฑ์ทุกวัน`]];
  $("insightGrid").innerHTML=items.map(([style,title,copy],index)=>`<article class="insight ${style}"><div class="insight__number">0${index+1}</div><h3>${title}</h3><p>${copy}</p></article>`).join("");
}

function summarizeBranchRows(rows,service){
  const requestSep=sum(rows,"Request Sep"),requestOct=sum(rows,"Request Oct"),saveSep=sum(rows,"Save Sep"),saveOct=sum(rows,"Save Oct"),churnSep=sum(rows,"Churn Sep"),churnOct=sum(rows,"Churn Oct"),budget=sum(rows,"Budget Churn"),mtdBudget=sum(rows,"MTD Budget Churn");
  const item={shop:rows[0]["Shop Name"],region:rows[0].Region,service,shopType:[...new Set(rows.map(row=>row["Shop Type"]).filter(Boolean))].join(" / "),requestSep,requestOct,saveSep,saveOct,churnSep,churnOct,budget,mtdBudget,saveRateSep:requestSep?saveSep/requestSep:0,saveRateOct:requestOct?saveOct/requestOct:0,overBudget:mtdBudget?churnOct/mtdBudget:0};
  item.requestDiff=requestOct-requestSep;item.requestMom=delta(requestOct,requestSep);item.saveDiff=saveOct-saveSep;item.saveMom=delta(saveOct,saveSep);item.churnDiff=churnOct-churnSep;item.churnMom=delta(churnOct,churnSep);item.saveRateDiff=item.saveRateOct-item.saveRateSep;item.tier=tierStatus(item);
  return item;
}

const hasBranchActivityOrTarget=row=>[row.budget,row.mtdBudget,row.requestSep,row.requestOct,row.saveSep,row.saveOct,row.churnSep,row.churnOct].some(value=>n(value)!==0);

function branchFocusData(service,group,region,shopType="ALL"){
  let pool=store.branches.filter(row=>(service==="ALL"||row.Service===service)&&inScope(row.Region,group,region)&&(shopType==="ALL"||normalizeShopType(row["Shop Type"])===shopType));
  const latest=[...new Set(pool.map(row=>row["Report Date"]))].sort().at(-1);
  pool=pool.filter(row=>row["Report Date"]===latest&&row["Shop Name"]);
  const grouped=new Map();
  pool.forEach(row=>{const key=service==="ALL"?`${row.Region}|${row["Shop Name"]}`:`${row.Service}|${row.Region}|${row["Shop Name"]}`,items=grouped.get(key)||[];items.push(row);grouped.set(key,items);});
  const label=service==="ALL"?"TMH + TOL":service;
  return {latest,rows:[...grouped.values()].map(items=>summarizeBranchRows(items,label)).filter(hasBranchActivityOrTarget).sort((a,b)=>a.region.localeCompare(b.region)||b.overBudget-a.overBudget||a.shop.localeCompare(b.shop))};
}

function branchRowHtml(row){
  return `<tr><th class="branch-cell" scope="row"><strong>${escapeHtml(row.shop)}</strong><small>${escapeHtml(row.shopType)}</small></th><td class="area-cell">${escapeHtml(row.region)}</td><td><span class="service-pill ${serviceClass(row.service)}">${escapeHtml(row.service.replace(" + ","+"))}</span></td><td>${fmtFull(row.requestSep)}</td><td>${fmtFull(row.requestOct)}</td><td class="cell-tone ${tone(row.requestDiff,true)}">${fmtSignedFull(row.requestDiff)}</td><td class="cell-tone ${tone(row.requestMom,true)}">${fmtDelta(row.requestMom)}</td><td>${fmtFull(row.saveSep)}</td><td>${fmtFull(row.saveOct)}</td><td class="cell-tone ${tone(row.saveDiff)}">${fmtSignedFull(row.saveDiff)}</td><td class="cell-tone ${tone(row.saveMom)}">${fmtDelta(row.saveMom)}</td><td>${fmtFull(row.churnSep)}</td><td>${fmtFull(row.churnOct)}</td><td class="cell-tone ${tone(row.churnDiff,true)}">${fmtSignedFull(row.churnDiff)}</td><td class="cell-tone ${tone(row.churnMom,true)}">${fmtDelta(row.churnMom)}</td><td>${fmtPct(row.saveRateSep)}</td><td>${fmtPct(row.saveRateOct)}</td><td class="cell-tone ${tone(row.saveRateDiff)}">${fmtPP(row.saveRateDiff)}</td><td>${fmtFull(row.budget)}</td><td>${fmtFull(row.mtdBudget)}</td><td class="over-budget ${row.overBudget>1?"bad":"good"}">${fmtPct(row.overBudget)}</td><td><span class="tier-pill ${row.tier.code.toLowerCase()}" title="${escapeHtml(row.tier.text)}">${row.tier.code}</span></td></tr>`;
}

function hallCard(service,group,region){
  let pool=store.branches.filter(row=>row.Service===service&&normalizeShopType(row["Shop Type"])==="Hall"&&inScope(row.Region,group,region));
  const latest=[...new Set(pool.map(row=>row["Report Date"]))].sort().at(-1);
  pool=pool.filter(row=>row["Report Date"]===latest&&row["Shop Name"]);
  const requestBefore=sum(pool,"Request Sep"),requestNow=sum(pool,"Request Oct"),saveNow=sum(pool,"Save Oct"),churnNow=sum(pool,"Churn Oct"),budget=sum(pool,"Budget Churn");
  const cutoff=n(pool[0]?.["Cutoff Day"]),days=n(pool[0]?.["Days in Month"]),rr=cutoff?churnNow/cutoff*days:0,saveRate=requestNow?saveNow/requestNow:0,rrCap=budget?rr/budget:0;
  const branches=new Set(pool.map(row=>row["Shop Name"])).size;
  return `<article class="hall-service-card ${service.toLowerCase()}"><div class="hall-card-head"><div><small>SHOP TYPE</small><h3>Hall • ${service}</h3></div><strong>${branches} สาขา</strong></div><div class="hall-card-period"><span>${comparisonMonths.before} ${fmtMoney(requestBefore)}</span><b>→</b><span>${comparisonMonths.now} ${fmtMoney(requestNow)}</span></div><div class="hall-card-metrics"><div><small>Request</small><strong>${fmtMoney(requestNow)}</strong></div><div><small>Save</small><strong>${fmtMoney(saveNow)}</strong></div><div><small>Churn</small><strong>${fmtMoney(churnNow)}</strong></div><div><small>Save rate</small><strong>${fmtPct(saveRate)}</strong></div><div><small>RR / Cap</small><strong>${fmtPct(rrCap)}</strong></div></div></article>`;
}

function renderHallCards(group,region){
  $("hallServiceCards").innerHTML=["TMH","TOL"].map(service=>hallCard(service,group,region)).join("");
}

function renderBranchTable(service,group,region){
  const shopType=$("shopTypeFilter").value,data=branchFocusData(service,group,region,shopType);
  $("branchTableScope").textContent=scopeLabel(group,region);$("branchTableCount").textContent=`${data.rows.length} Branches`;
  $("branchDataNotice").textContent=store.branchLive?`ข้อมูล ณ ${fmtDate(data.latest)} • Shop Type: ${shopType==="ALL"?"ทุกประเภท":shopType} • แสดงเฉพาะชื่อสาขา • ซ่อนรหัส TDS/WW`:`ไม่สามารถโหลดข้อมูลรายสาขาได้ กรุณาตรวจสิทธิ์ Google Sheet`;
  $("branchTableBody").innerHTML=data.rows.length?data.rows.map(branchRowHtml).join(""):'<tr><td colspan="22" class="empty-state">ไม่มีข้อมูลรายสาขาตามตัวกรอง</td></tr>';
}

function downsellDetailData(level,group,region){
  const detail=store.downsellDetails.filter(row=>String(row.Level).toUpperCase()===level);
  const source=detail.length?detail:(level==="AREA"?store.downsell:[]);
  let pool=source.filter(row=>inScope(row.Region,group,region));
  const latest=[...new Set(pool.map(row=>row["Report Date"]))].sort().at(-1);
  pool=pool.filter(row=>row["Report Date"]===latest);
  if(level==="BRANCH") pool=pool.filter(hasDownsellBudgetOrTransaction);
  const sortRisk=(a,b)=>n(b["RR / Budget"])-n(a["RR / Budget"]);
  if(level==="AREA") pool.sort((a,b)=>sortRisk(a,b)||String(a.Region).localeCompare(String(b.Region)));
  else pool.sort((a,b)=>String(a.Region).localeCompare(String(b.Region))||sortRisk(a,b)||String(a["Shop Name"]).localeCompare(String(b["Shop Name"])));
  return {latest,rows:pool};
}

const hasDownsellBudgetOrTransaction=row=>n(row["Budget Downsell"])!==0||n(row["Total Downsell"])!==0;
const budgetStatus=row=>n(row["RR / Budget"])>1?"over":"safe";
function downsellMomCells(row){
 const base=row["Last Month"],current=row["RR / Budget"],valid=typeof base==="number"&&Number.isFinite(base)&&base>0&&typeof current==="number"&&Number.isFinite(current);
 const mom=valid?current/base-1:null;
 return `<td>${typeof base==="number"&&Number.isFinite(base)?fmtPct(base):"—"}</td><td class="${mom===null?"neutral":deltaClass(mom,true)}" title="${mom===null?"ไม่มีฐานเดือนก่อนที่ใช้คำนวณได้":"(RR/Budget เดือนนี้ ÷ RR/Budget เดือนก่อน − 1) × 100"}">${mom===null?"—":fmtDelta(mom)}</td>`;
}
function downsellAreaRowHtml(row){
  const state=budgetStatus(row);
  return `<tr><th class="area-name" scope="row">${escapeHtml(row.Region)}</th><td>${fmtFull(row["No Shop"])}</td><td>${fmtFull(row["Budget Downsell"])}</td><td>${fmtFull(row["Downsell Retention"])}</td><td>${fmtFull(row["Downsell Aftersale"])}</td><td>${fmtFull(row["Total Downsell"])}</td><td>${fmtFull(row["RR Downsell"])}</td><td>${fmtPct(row["MTD / Budget"])}</td><td class="over-budget ${state==="over"?"bad":"good"}">${fmtPct(row["RR / Budget"])}</td><td>${fmtFull(row["Over Budget Records"])}</td><td><span class="budget-pill ${state}">${escapeHtml(row.Status||(state==="over"?"Over Budget":"In Budget"))}</span></td>${downsellMomCells(row)}</tr>`;
}

function downsellBranchRowHtml(row){
  const state=budgetStatus(row);
  return `<tr><th class="branch-name" scope="row">${escapeHtml(row["Shop Name"])}</th><td class="area-name">${escapeHtml(row.Region)}</td><td>${escapeHtml(row["Shop Type"])}</td><td>${fmtFull(row["Budget Downsell"])}</td><td>${fmtFull(row["Downsell Retention"])}</td><td>${fmtFull(row["Downsell Aftersale"])}</td><td>${fmtFull(row["Total Downsell"])}</td><td>${fmtFull(row["RR Downsell"])}</td><td>${fmtPct(row["MTD / Budget"])}</td><td class="over-budget ${state==="over"?"bad":"good"}">${fmtPct(row["RR / Budget"])}</td><td><span class="budget-pill ${state}">${escapeHtml(row.Status||(state==="over"?"Over Budget":"In Budget"))}</span></td>${downsellMomCells(row)}</tr>`;
}

function renderDownsellTolTables(group,region){
  const source=store.tolDownsellDetails,scope=scopeLabel(group,region);
  const latest=source.map(row=>row["Report Date"]).sort().at(-1);
  const rows=source.filter(row=>row["Report Date"]===latest&&inScope(row.Region,group,region));
  const areas=rows.filter(row=>String(row.Level).toUpperCase()==="AREA").sort((a,b)=>n(b["RR / Budget"])-n(a["RR / Budget"]));
  const branches=rows.filter(row=>String(row.Level).toUpperCase()==="BRANCH"&&hasDownsellBudgetOrTransaction(row)).sort((a,b)=>String(a.Region).localeCompare(String(b.Region))||n(b["RR / Budget"])-n(a["RR / Budget"])||String(a["Shop Name"]).localeCompare(String(b["Shop Name"])));
  $("tolDownsellDate").textContent=fmtDate(latest);
  $("tolDownsellAreaScope").textContent=scope;$("tolDownsellBranchScope").textContent=scope;
  $("tolDownsellAreaCount").textContent=`${areas.length} ${areas.length===1?"Area":"Areas"}`;
  $("tolDownsellBranchCount").textContent=`${branches.length} Branches`;
  $("tolDownsellAreaTableBody").innerHTML=areas.map(downsellAreaRowHtml).join("");
  $("tolDownsellBranchTableBody").innerHTML=branches.map(downsellBranchRowHtml).join("");
}

function renderDownsellTables(group,region){
  const areas=downsellDetailData("AREA",group,region),branches=downsellDetailData("BRANCH",group,region),scope=scopeLabel(group,region);
  $("downsellAreaScope").textContent=scope;$("downsellBranchScope").textContent=scope;
  $("downsellAreaCount").textContent=`${areas.rows.length} ${areas.rows.length===1?"Area":"Areas"}`;
  $("downsellBranchCount").textContent=`${branches.rows.length} Branches`;
  $("downsellBranchNotice").textContent=store.downsellDetailLive?`ข้อมูล ณ ${fmtDate(branches.latest||areas.latest)} • แสดงชื่อสาขาเท่านั้น • ซ่อนรหัส TDS/WW • Service filter ไม่มีผลกับ Downsell`:`ไม่สามารถโหลด Downsell รายสาขาได้ กรุณาตรวจสิทธิ์ Google Sheet`;
  $("downsellAreaTableBody").innerHTML=areas.rows.length?areas.rows.map(downsellAreaRowHtml).join(""):'<tr><td colspan="13" class="empty-state">ไม่มีข้อมูล Downsell ระดับ Area ตามตัวกรอง</td></tr>';
  $("downsellBranchTableBody").innerHTML=branches.rows.length?branches.rows.map(downsellBranchRowHtml).join(""):'<tr><td colspan="13" class="empty-state">ไม่มีข้อมูล Downsell รายสาขาตามตัวกรอง</td></tr>';
}

const solutionMetricLabels={cases:"Request Sub",churn:"Churn Value",request:"Revenue Request",save:"Revenue Save"};
const solutionHasCases=rows=>rows.length>0&&rows.every(r=>typeof r["Request Sub"]==="number"&&Number.isFinite(r["Request Sub"]));
const solutionMetricValue=(item,metric)=>metric==="cases"?item.cases:item[metric];
const solutionMetricText=(item,metric)=>metric==="cases"?fmtFull(item.cases):fmtMoney(item[metric]);
const isMissingSolution=value=>!String(value||"").trim()||String(value).trim()==="ไม่ระบุ Solution";

function latestSolutionRows(){
  const latest=[...new Set(store.solutions.map(row=>row["Report Date"]).filter(Boolean))].sort().at(-1);
  return {latest,rows:store.solutions.filter(row=>row["Report Date"]===latest)};
}

function solutionScopeRows(product,group,region,branch="ALL"){
  return latestSolutionRows().rows.filter(row=>(product==="ALL"||row.Product===product)&&inScope(row.Region,group,region)&&(branch==="ALL"||row["Shop Name"]===branch));
}

function aggregateSolutions(rows){
  const grouped=new Map();
  rows.forEach(row=>{
    const name=String(row["Solution Name"]||"").trim()||"ไม่ระบุ Solution",item=grouped.get(name)||{solution:name,cases:0,request:0,save:0,churn:0};
    item.cases+=n(row["Request Sub"]);item.request+=n(row["Rev Request"]);item.save+=n(row["Rev Save"]);item.churn+=n(row["Churn Value"]);grouped.set(name,item);
  });
  return [...grouped.values()];
}

function rankedSolutions(items,metric){
  return [...items].filter(item=>!isMissingSolution(item.solution)&&(item.request||item.save||item.churn||item.cases)).sort((a,b)=>solutionMetricValue(b,metric)-solutionMetricValue(a,metric)||b.cases-a.cases||a.solution.localeCompare(b.solution,"th"));
}

function solutionProducts(service){return service==="ALL"?["TMH","TOL"]:[service];}

function populateSolutionBranches(){
  const select=$("solutionBranchFilter"),service=$("serviceFilter").value,group=$("areaGroupFilter").value,region=$("regionFilter").value,current=select.value;
  const branches=[...new Set(solutionScopeRows(service,group,region).map(row=>row["Shop Name"]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"th"));
  select.innerHTML='<option value="ALL">ทุกสาขา</option>'+branches.map(branch=>`<option value="${escapeHtml(branch)}">${escapeHtml(branch)}</option>`).join("");
  select.value=branches.includes(current)?current:"ALL";
}

function solutionComparisonCard(product,rows,metric){
 const items=aggregateSolutions(rows),ranked=rankedSolutions(items,metric).slice(0,10),hasCases=solutionHasCases(rows),totalRequest=sum(rows,"Rev Request"),totalSave=sum(rows,"Rev Save"),totalChurn=sum(rows,"Churn Value"),totalCases=sum(rows,"Request Sub");
 const cells=item=>`${hasCases?"<td>"+fmtFull(item.cases)+"</td>":""}<td>${fmtFull(item.request)}</td><td class="customer-rate">${fmtFull(item.save)}</td><td>${fmtPct(item.request?item.save/item.request:0)}</td><td>${fmtPct(totalRequest?item.request/totalRequest:0)}</td><td>${fmtFull(item.churn)}</td>`;
 return `<article class="solution-comparison-card ${product.toLowerCase()}"><div class="solution-comparison-head"><h3>${product}</h3><span>Top 10 by ${solutionMetricLabels[metric]}</span></div><div class="table-scroll solution-comparison-scroll"><table class="solution-comparison-table"><thead><tr><th>SOLUTION NAME</th>${hasCases?"<th>Request Sub</th>":""}<th>Rev Request</th><th>Rev Save</th><th>%Save Revenue</th><th>สัดส่วน Request</th><th>Churn Value</th></tr></thead><tbody>${ranked.length?ranked.map(item=>"<tr><th scope='row'>"+escapeHtml(item.solution)+"</th>"+cells(item)+"</tr>").join(""):`<tr><td colspan="${hasCases?7:6}">ไม่มีข้อมูลตามตัวกรอง</td></tr>`}</tbody><tfoot><tr><th>ผลรวมทุกสาเหตุ</th>${cells({cases:totalCases,request:totalRequest,save:totalSave,churn:totalChurn})}</tr></tfoot></table></div></article>`;
}

function renderSolutionLeaders(products,group,region,branch,metric){
  $("solutionLeaders").innerHTML=products.map(product=>{
    const rows=solutionScopeRows(product,group,region,branch),items=aggregateSolutions(rows),top=rankedSolutions(items,metric)[0],validCases=items.filter(item=>!isMissingSolution(item.solution)).reduce((total,item)=>total+item.cases,0);
    if(!top)return `<article class="solution-leader-card ${product.toLowerCase()}"><div class="solution-leader-head"><span>${product}</span><small>ไม่มีข้อมูล</small></div></article>`;
    return `<article class="solution-leader-card ${product.toLowerCase()}"><div class="solution-leader-head"><span>${product}</span><small>อันดับ 1 • ${solutionMetricLabels[metric]}</small></div><h3>${escapeHtml(top.solution)}</h3><div class="solution-leader-metrics"><div><small>Revenue Save</small><strong>${fmtMoney(top.save)}</strong></div><div><small>%Save Revenue</small><strong>${top.request?fmtPct(top.save/top.request):"—"}</strong></div><div><small>Revenue Request</small><strong>${fmtMoney(top.request)}</strong></div></div></article>`;
  }).join("");
}

function renderSolutionMatrices(products,group,region,metric,branch){
  const areas=(group==="ALL"?Object.values(AREA_GROUPS).flat():AREA_GROUPS[group]||[]).filter(area=>region==="ALL"||area===region);
  if(group==="ALL"&&region==="ALL"&&latestSolutionRows().rows.some(r=>r.Region==="ไม่ระบุพื้นที่"))areas.push("ไม่ระบุพื้นที่");
  $("solutionAreaMatrices").innerHTML=products.map(product=>{
    const body=areas.map(area=>{
      const top=rankedSolutions(aggregateSolutions(solutionScopeRows(product,group,area,branch)),metric).slice(0,10);
      return `<tr data-solution-area="${escapeHtml(area)}"><th scope="row">${escapeHtml(area)}</th>${Array.from({length:10},(_,index)=>{const item=top[index];return item?`<td class="solution-rank-cell ${index===0?"is-first":""}" title="${escapeHtml(item.solution)}"><strong>${escapeHtml(item.solution)}</strong><span>${solutionMetricText(item,metric)}</span></td>`:'<td class="solution-rank-cell">—</td>'}).join("")}</tr>`;
    }).join("")||'<tr><td colspan="11" class="empty-state">ไม่มีข้อมูลในขอบเขตนี้</td></tr>';
    return `<article class="solution-matrix-card ${product.toLowerCase()}"><div class="solution-matrix-head"><h3>${product}</h3><span>${areas.length} Areas • Top 10 by ${solutionMetricLabels[metric]}</span></div><div class="table-scroll solution-matrix-scroll"><table class="solution-matrix"><thead><tr><th>AREA</th>${Array.from({length:10},(_,index)=>`<th>#${index+1}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div></article>`;
  }).join("");
  document.querySelectorAll("[data-solution-area]").forEach(row=>row.addEventListener("click",()=>{$("regionFilter").value=Object.values(AREA_GROUPS).flat().includes(row.dataset.solutionArea)?row.dataset.solutionArea:"ALL";populateSolutionBranches();render();document.querySelector(".solution-branch-card").scrollIntoView({behavior:"smooth",block:"start"});}));
}

function renderSolutionBranches(products,group,region,metric){
  const rows=solutionScopeRows("ALL",group,region),grouped=new Map();
  rows.filter(row=>products.includes(row.Product)&&row["Shop Name"]).forEach(row=>{const key=`${row.Product}|${row.Region}|${row["Shop Name"]}`,items=grouped.get(key)||[];items.push(row);grouped.set(key,items);});
  const branches=[...grouped.values()].map(items=>{const product=items[0].Product,area=items[0].Region,branch=items[0]["Shop Name"],solutions=aggregateSolutions(items),top=rankedSolutions(solutions,metric)[0],totalRequest=solutions.reduce((total,item)=>total+item.request,0);return {product,area,branch,top,totalRequest};}).filter(item=>item.top).sort((a,b)=>a.area.localeCompare(b.area)||a.product.localeCompare(b.product)||solutionMetricValue(b.top,metric)-solutionMetricValue(a.top,metric)||a.branch.localeCompare(b.branch,"th"));
  $("solutionBranchScope").textContent=scopeLabel(group,region);$("solutionBranchCount").textContent=`${branches.length} Branches`;
  $("solutionBranchTableBody").innerHTML=branches.length?branches.map(item=>`<tr data-solution-branch="${escapeHtml(item.branch)}" data-solution-area="${escapeHtml(item.area)}"><td><span class="service-pill ${item.product.toLowerCase()}">${item.product}</span></td><th scope="row">${escapeHtml(item.branch)}</th><td>${escapeHtml(item.area)}</td><td>${escapeHtml(item.top.solution)}</td><td>${fmtFull(item.top.save)}</td><td>${fmtPct(item.totalRequest?item.top.request/item.totalRequest:0)}</td><td>${fmtFull(item.top.request)}</td><td>${fmtPct(item.top.request?item.top.save/item.top.request:0)}</td></tr>`).join(""):'<tr><td colspan="8" class="empty-state">ไม่มีข้อมูลรายสาขาตามตัวกรอง</td></tr>';
  document.querySelectorAll("[data-solution-branch]").forEach(row=>row.addEventListener("click",()=>{$("regionFilter").value=Object.values(AREA_GROUPS).flat().includes(row.dataset.solutionArea)?row.dataset.solutionArea:"ALL";populateSolutionBranches();$("solutionBranchFilter").value=row.dataset.solutionBranch;renderSolutions();document.querySelector("#solutionPartition section:nth-child(2)").scrollIntoView({behavior:"smooth",block:"start"});}));
}

function renderSolutions(){
  const caseOption=$("solutionMetricFilter").querySelector('option[value="cases"]');
  caseOption.disabled=!solutionHasCases(latestSolutionRows().rows);
  if(caseOption.disabled&&$("solutionMetricFilter").value==="cases")$("solutionMetricFilter").value="save";
  populateSolutionBranches();
  renderSolutionFocus();
  const service=$("serviceFilter").value,products=solutionProducts(service),group=$("areaGroupFilter").value,region=$("regionFilter").value,branch=$("solutionBranchFilter").value,metric=$("solutionMetricFilter").value,{latest}=latestSolutionRows(),scope=[scopeLabel(group,region),branch!=="ALL"?branch:null].filter(Boolean).join(" • ");
  $("solutionDataNotice").textContent=store.solutionLive?`ข้อมูล ณ ${fmtDate(latest)} • เชื่อมข้อมูลต้นทางอัตโนมัติ${solutionHasCases(latestSolutionRows().rows)?"":" • ต้นทางไม่มี Request Sub / ARPU จึงแสดงเฉพาะรายได้"} • ${latestSolutionRows().rows.filter(r=>r.Region==="ไม่ระบุพื้นที่").length} รายการยังไม่พบพื้นที่ในทะเบียนสาขา (รวมใน ALL)`:(store.solutions.length?`ข้อมูล ณ ${fmtDate(latest)} • ใช้ Snapshot สำรอง`:"ไม่สามารถโหลดข้อมูล Solution ได้ กรุณาตรวจสิทธิ์ Google Sheet");
  $("solutionLeaderScope").textContent=scope;$("solutionComparisonScope").textContent=scope;
  renderSolutionLeaders(products,group,region,branch,metric);
  $("solutionComparisonTables").innerHTML=products.map(product=>solutionComparisonCard(product,solutionScopeRows(product,group,region,branch),metric)).join("");
  renderSolutionMatrices(products,group,region,metric,branch);renderSolutionBranches(products,group,region,metric);
}


function customerSummary(rows, branch=false){
  const request=sum(rows,branch?"Request Oct":"Rev Request"),save=sum(rows,branch?"Save Oct":"Rev Save"),churn=sum(rows,branch?"Churn Oct":"Churn Value");
  return {request,save,churn,rate:request?save/request:null};
}
function customerSummaryTable(items,label){
  const headers=[label,"Rev Req ฿","Rev Save ฿","%Save Rev","Churn ฿"];
  const cells=item=>`<th scope="row">${escapeHtml(item.name)}</th><td>${fmtFull(item.request)}</td><td>${fmtFull(item.save)}</td><td class="customer-rate">${item.rate===null?"—":fmtPct(item.rate)}</td><td>${fmtFull(item.churn)}</td>`;
  const totals=items.reduce((t,r)=>({name:"Total",request:t.request+r.request,save:t.save+r.save,churn:t.churn+r.churn}),{name:"Total",request:0,save:0,churn:0});
  totals.rate=totals.request?totals.save/totals.request:null;
  return `<table class="customer-table"><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${items.length?items.map(r=>`<tr>${cells(r)}</tr>`).join(""):'<tr><td colspan="5" class="empty-state">ไม่มีข้อมูลตามตัวกรอง</td></tr>'}</tbody>${items.length?`<tfoot><tr>${cells(totals)}</tr></tfoot>`:""}</table>`;
}
function renderHomeOverview(service,group,region){
  const data=latestRows(service,group,region),total=customerSummary(data.now);
  $("customerScope").textContent=`${service==="ALL"?"TMH + TOL":service} • ${scopeLabel(group,region)} • ${fmtDate(data.latest)}`;
  const card=(label,value,note,kind="")=>`<article class="customer-metric ${kind}"><small>${label}</small><strong>${value}</strong><span>${note}</span></article>`;

  $("customerRevenue").innerHTML=card("REVENUE REQ",data.now.length?"฿"+fmtFull(total.request):"—","รายได้ที่ขอยกเลิก")+card("REVENUE SAVE",data.now.length?"฿"+fmtFull(total.save):"—","รายได้ที่รักษาไว้","customer-save")+card("%REVENUE SAVE",total.rate===null?"—":fmtPct(total.rate),"Revenue Save / Revenue Req","customer-save")+card("CHURN (VALUE)",data.now.length?"฿"+fmtFull(total.churn):"—","มูลค่ารายได้ที่ยกเลิก","customer-cancel");

  const priorMonthDate=data.latest?new Date(data.latest+"T00:00:00"):null;
  if(priorMonthDate){priorMonthDate.setDate(1);priorMonthDate.setMonth(priorMonthDate.getMonth()-1);}
  const previousMonth=priorMonthDate?priorMonthDate.getFullYear()+"-"+String(priorMonthDate.getMonth()+1).padStart(2,"0"):null;
  const hasPreviousMonth=Boolean(data.prior&&data.prior.slice(0,7)===previousMonth&&data.before.length);
  const previous=customerSummary(hasPreviousMonth?data.before:[]);
  const mom=(current,base)=>hasPreviousMonth&&base!==0?(current-base)/base:null;
  const saveMom=mom(total.save,previous.save),churnMom=mom(total.churn,previous.churn);
  const momValue=value=>value===null?"—":(value>0?"+":"")+fmtPct(value);
  const momNote=hasPreviousMonth?`${fmtDate(data.prior)} → ${fmtDate(data.latest)}`:"ไม่มีฐานเดือนก่อนสำหรับเปรียบเทียบ";
  $("customerRevenue").innerHTML+=card("%MoM SAVE",momValue(saveMom),momNote,saveMom===null?"":saveMom>=0?"customer-save":"customer-cancel")+card("%MoM CHURN VALUE",momValue(churnMom),momNote,churnMom===null?"":churnMom<=0?"customer-save":"customer-cancel");
  const products=["TMH","TOL"].filter(p=>service==="ALL"||p===service).map(p=>({name:p,...customerSummary(data.now.filter(r=>r.Service===p))})).filter(p=>data.now.some(r=>r.Service===p.name));
  $("customerProductTable").innerHTML=customerSummaryTable(products,"Product");
  // Only use branch data from the same reporting date as the overview.
  const branchRows=store.branches.filter(r=>r["Report Date"]===data.latest&&(service==="ALL"||r.Service===service)&&inScope(r.Region,group,region)&&r["Shop Name"]&&(n(r["Request Oct"])!==0||n(r["Budget Churn"])!==0));
  const types=[...new Set(branchRows.map(r=>normalizeShopType(r["Shop Type"])||"ไม่ระบุ"))].sort().map(type=>({name:type,...customerSummary(branchRows.filter(r=>(normalizeShopType(r["Shop Type"])||"ไม่ระบุ")===type),true)}));
  $("customerTypeTable").innerHTML=customerSummaryTable(types,"Shop Type");
  $("customerTypeNote").textContent="ใช้ Shop Type จากข้อมูลรายสาขา: Matching / Non Matching / Hall • Hall แสดงแยกตามข้อมูลต้นทาง";
  const typeTotal=types.reduce((t,r)=>t+r.request,0);
  if(branchRows.length&&Math.abs(typeTotal-total.request)>1)$("customerTypeNote").textContent+=" • ยอดรวมครอบคลุมเฉพาะสาขาที่มีข้อมูล จึงต่างจากยอดระดับพื้นที่";
  const findings=[];
  if(data.now.length){
    findings.push(`Revenue Request <strong>฿${fmtFull(total.request)}</strong> → Save <strong>฿${fmtFull(total.save)} (${total.rate===null?"—":fmtPct(total.rate)})</strong> • Churn <strong>฿${fmtFull(total.churn)}</strong>`);
    const rankedProducts=products.filter(p=>p.rate!==null).sort((a,b)=>b.rate-a.rate);
    if(rankedProducts.length)findings.push(`<b>By Product:</b> ${rankedProducts.map(p=>`${escapeHtml(p.name)} Save Revenue <strong>${fmtPct(p.rate)}</strong>`).join(" • ")}`);
    const rankTypes=types.filter(t=>t.rate!==null).sort((a,b)=>b.rate-a.rate);
    if(rankTypes.length)findings.push(`<b>Shop Type:</b> Save Revenue สูงสุด ${escapeHtml(rankTypes[0].name)} <strong>${fmtPct(rankTypes[0].rate)}</strong>${rankTypes.length>1?` • ต่ำสุด ${escapeHtml(rankTypes.at(-1).name)} <strong>${fmtPct(rankTypes.at(-1).rate)}</strong>`:""}`);
    const areaMap=new Map();data.now.forEach(r=>{const items=areaMap.get(r.Region)||[];items.push(r);areaMap.set(r.Region,items);});
    const areas=[...areaMap].map(([name,rows])=>({name,...customerSummary(rows)})).filter(r=>r.rate!==null).sort((a,b)=>b.rate-a.rate);
    if(areas.length)findings.push(`<b>Area:</b> Save Revenue สูงสุด ${escapeHtml(areas[0].name)} <strong>${fmtPct(areas[0].rate)}</strong>${areas.length>1?` • ต่ำสุด ${escapeHtml(areas.at(-1).name)} <strong>${fmtPct(areas.at(-1).rate)}</strong>`:""}`);
    const budget=sum(data.now,"Budget Churn Month"),rr=sum(data.now,"RR Churn");
    if(budget>0)findings.push(`<b>Churn Run rate:</b> <strong>฿${fmtFull(rr)}</strong> / Cap ฿${fmtFull(budget)} = <strong>${fmtPct(rr/budget)}</strong>`);
    const lows=branchRows.filter(r=>n(r["Request Oct"])>0).map(r=>({name:r["Shop Name"],product:r.Service,rate:n(r["Save Oct"])/n(r["Request Oct"])})).sort((a,b)=>a.rate-b.rate).slice(0,3);
    if(lows.length)findings.push(`<b>สาขาที่ควรติดตาม (%Save Revenue ต่ำสุด):</b> ${lows.map(r=>`${escapeHtml(r.name)} (${escapeHtml(r.product)}) <strong>${fmtPct(r.rate)}</strong>`).join(" • ")}`);
  } else findings.push("ไม่มีข้อมูลตามตัวกรองที่เลือก");
  if(data.now.length){
    const risks=[...areaMapForFocus(data.now)].sort((a,b)=>b.churn-a.churn).slice(0,5);
    findings.push(`พื้นที่ที่มี Churn สูงสุด: ${risks.map(r=>`${escapeHtml(r.name)} ฿${fmtFull(r.churn)} (${total.churn?fmtPct(r.churn/total.churn):"—"} ของกลุ่ม)`).join(" • ")}`);
    findings.push("แนวทางติดตาม: เริ่มจากพื้นที่ที่มีมูลค่า Churn สูง ตรวจสาขา Save ต่ำและเคสมูลค่าสูงในหน้า Branch Performance แล้วใช้หน้า Solution เพื่อกำหนด Action ตามสาเหตุ พร้อมติดตามผลรอบถัดไป");
  }
  $("customerFindings").innerHTML=findings.map(t=>`<li>${t}</li>`).join("");
}


function areaMapForFocus(rows){const map=new Map();rows.forEach(r=>map.set(r.Region,(map.get(r.Region)||0)+n(r["Churn Value"])));return [...map].map(([name,churn])=>({name,churn}));}
function focusCard(label,value,note=""){return `<article class="customer-metric"><small>${label}</small><strong>${value}</strong><span>${escapeHtml(note)}</span></article>`;}
function focusMom(current,previous){return previous?(current>previous?"+":"")+fmtPct((current-previous)/previous):"—";}
function focusPanel(id,title,date,cards,findings){
  $(id).innerHTML=`<div class="section-title"><div><h2>${title}</h2></div><p>ข้อมูล ณ ${fmtDate(date)}</p></div><div class="customer-revenue-grid">${cards}</div><article class="panel customer-findings"><h3>🔎 บทสรุปและประเด็นที่ควรติดตาม</h3><ul>${findings.map(t=>`<li>${t}</li>`).join("")}</ul></article>`;
}
function renderBranchFocus(service,group,region){
 const data=branchFocusData(service,group,region,$("shopTypeFilter").value),rows=data.rows;
 const total=key=>rows.reduce((v,r)=>v+n(r[key]),0),request=total("requestOct"),save=total("saveOct"),churn=total("churnOct"),budget=total("mtdBudget");
 const cards=focusCard("REVENUE REQ","฿"+fmtFull(request))+focusCard("REVENUE SAVE","฿"+fmtFull(save))+focusCard("%REVENUE SAVE",request?fmtPct(save/request):"—")+focusCard("CHURN VALUE","฿"+fmtFull(churn))+focusCard("%MoM SAVE",focusMom(save,total("saveSep")),"Sep → Oct")+focusCard("%MoM CHURN VALUE",focusMom(churn,total("churnSep")),"Sep → Oct");
 const low=rows.filter(r=>r.requestOct>0&&r.saveRateOct<.88).sort((a,b)=>b.churnOct-a.churnOct),over=rows.filter(r=>r.mtdBudget>0&&r.churnOct>r.mtdBudget).sort((a,b)=>(b.churnOct-b.mtdBudget)-(a.churnOct-a.mtdBudget));
 const name=r=>escapeHtml(r.shop)+" ("+escapeHtml(r.region)+")";
 const findings=rows.length?[
 `ครอบคลุม <b>${rows.length} สาขา</b> • Save ฿${fmtFull(save)} จาก Request ฿${fmtFull(request)} • Churn ฿${fmtFull(churn)}`,
 `Save Revenue ต่ำกว่าเกณฑ์ติดตาม 88% จำนวน <b>${low.length} สาขา</b> • Churn รวม ฿${fmtFull(low.reduce((v,r)=>v+r.churnOct,0))}`,
 low.length?`ชี้เป้าสาขา Save ต่ำ เรียงตามมูลค่า Churn: ${low.slice(0,5).map(r=>`${name(r)} — Save ${fmtPct(r.saveRateOct)}, Churn ฿${fmtFull(r.churnOct)}`).join(" • ")}`:"ทุกสาขาที่มี Request ผ่านเกณฑ์ Save Revenue 88%",
 budget?`Churn / Budget MTD รวม <b>${fmtPct(churn/budget)}</b> • เกิน Budget MTD ${over.length} สาขา`:"ไม่มี Budget MTD สำหรับเทียบยอดรวม",
 over.length?`สาขาที่เกิน Budget MTD สูงสุด: ${over.slice(0,3).map(r=>`${name(r)} เกิน ฿${fmtFull(r.churnOct-r.mtdBudget)}`).join(" • ")}`:"ไม่มีสาขาเกิน Budget MTD ในกลุ่มที่มี Budget",
 "แนวทางติดตาม: ให้หัวหน้าสาขากลุ่ม Save ต่ำตรวจเคสยกเลิกที่มีมูลค่าสูงและข้อเสนอที่ใช้ แล้วสรุปผล Save/Churn ในรอบถัดไป; กลุ่มเกิน Budget ให้กำหนดผู้รับผิดชอบและติดตามรายวัน"
 ]:["ไม่มีข้อมูลตามตัวกรอง"];
 focusPanel("branchFocus","Retention • Branch Focus",data.latest,cards,findings);
}
function renderDownsellFocus(id,product,source,group,region){
 const pool=source.filter(r=>inScope(r.Region,group,region)),date=pool.map(r=>r["Report Date"]).sort().at(-1),now=pool.filter(r=>r["Report Date"]===date);
 const areas=now.filter(r=>String(r.Level).toUpperCase()==="AREA"),branches=now.filter(r=>String(r.Level).toUpperCase()==="BRANCH"&&hasDownsellBudgetOrTransaction(r)),base=areas.length?areas:branches;
 const budget=sum(base,"Budget Downsell"),actual=sum(base,"Total Downsell"),rr=sum(base,"RR Downsell");
 const rank=rows=>rows.filter(r=>n(r["Budget Downsell"])>0&&n(r["RR Downsell"])>n(r["Budget Downsell"])).sort((a,b)=>(n(b["RR Downsell"])-n(b["Budget Downsell"]))-(n(a["RR Downsell"])-n(a["Budget Downsell"])));
 const over=rank(branches),riskAreas=rank(areas),unknown=branches.filter(r=>!n(r["Budget Downsell"])&&n(r["Total Downsell"])>0);
 const cards=focusCard("BUDGET","฿"+fmtFull(budget))+focusCard("DOWNSELL MTD","฿"+fmtFull(actual))+focusCard("RUN RATE","฿"+fmtFull(rr))+focusCard("RR / BUDGET",budget?fmtPct(rr/budget):"—")+focusCard("PROJECTED OVER BUDGET","฿"+fmtFull(Math.max(0,rr-budget)))+focusCard("BRANCHES OVER BUDGET",fmtFull(over.length),"เทียบ Run rate กับ Budget");
 const findings=base.length?[
 `${product} • Downsell MTD ฿${fmtFull(actual)} • Run rate ฿${fmtFull(rr)} • Budget ฿${fmtFull(budget)} ${areas.length?"(ยอดรวมระดับพื้นที่)":"(ยอดรวมจากสาขาที่มีข้อมูล)"}`,
 `Run rate ${rr>budget?"สูงกว่า":"ไม่เกิน"} Budget ฿${fmtFull(Math.abs(rr-budget))} • Retention ฿${fmtFull(sum(base,"Downsell Retention"))} / Aftersale ฿${fmtFull(sum(base,"Downsell Aftersale"))}`,
 riskAreas.length?`พื้นที่ควรติดตาม เรียงตามมูลค่าเกิน Budget: ${riskAreas.slice(0,5).map(r=>`${escapeHtml(r.Region)} — ${fmtPct(n(r["RR Downsell"])/n(r["Budget Downsell"]))}, เกิน ฿${fmtFull(n(r["RR Downsell"])-n(r["Budget Downsell"]))}`).join(" • ")}`:"ไม่มีพื้นที่ที่ Run rate เกิน Budget ในกลุ่มที่มี Budget",
 over.length?`ชี้เป้า 5 สาขาที่เกินสูงสุด: ${over.slice(0,5).map(r=>`${escapeHtml(r["Shop Name"])} (${escapeHtml(r.Region)}) เกิน ฿${fmtFull(n(r["RR Downsell"])-n(r["Budget Downsell"]))}`).join(" • ")}`:"ไม่มีสาขาที่ Run rate เกิน Budget ในกลุ่มที่มี Budget",
 `มี Downsell แต่ไม่มี Budget ${unknown.length} สาขา${unknown.length?" — ควรตรวจการกำหนด Budget ก่อนประเมินผล":""}`,
 "แนวทางติดตาม: ตรวจเคสลดแพ็กเกจของพื้นที่และสาขาที่เกิน Budget สูงสุด แยก Retention/Aftersale เพื่อหาจุดที่ลดรายได้มาก และทบทวนข้อเสนอรักษารายได้ก่อนอนุมัติส่วนลด พร้อมติดตาม Run rate ทุกวัน"
 ]:["ไม่มีข้อมูลตามตัวกรอง"];
 focusPanel(id,"Downsell "+product+" • Focus",date,cards,findings);
}
function renderSolutionFocus(){
 const service=$("serviceFilter").value,group=$("areaGroupFilter").value,region=$("regionFilter").value,branch=$("solutionBranchFilter").value;
 const rows=solutionScopeRows(service,group,region,branch),date=latestSolutionRows().latest,request=sum(rows,"Rev Request"),save=sum(rows,"Rev Save"),churn=sum(rows,"Churn Value");
 const cards=focusCard("REVENUE REQ","฿"+fmtFull(request))+focusCard("REVENUE SAVE","฿"+fmtFull(save))+focusCard("%REVENUE SAVE",request?fmtPct(save/request):"—")+focusCard("CHURN VALUE","฿"+fmtFull(churn));
 const rank=key=>{const map=new Map();rows.forEach(r=>{const name=r[key]||"ไม่ระบุ";map.set(name,(map.get(name)||0)+n(r["Churn Value"]));});return [...map].sort((a,b)=>b[1]-a[1]);};
 const reasons=rank("Solution Name"),shops=rank("Shop Name");
 const findings=rows.length?[
 `สรุปจากข้อมูล Solution ณ ${fmtDate(date)} • Request ฿${fmtFull(request)} • Save ฿${fmtFull(save)} • Churn ฿${fmtFull(churn)}`,
 `5 สาเหตุที่มี Churn สูงสุด: ${reasons.slice(0,5).map(([name,value])=>`${escapeHtml(name)} ฿${fmtFull(value)} (${churn?fmtPct(value/churn):"—"})`).join(" • ")}`,
 `5 สาขาที่มี Churn สูงสุดในข้อมูล Solution: ${shops.slice(0,5).map(([name,value])=>`${escapeHtml(name)} ฿${fmtFull(value)}`).join(" • ")}`,
 `สาเหตุอันดับหนึ่งคิดเป็น ${churn&&reasons.length?fmtPct(reasons[0][1]/churn):"—"} ของ Churn — ให้เริ่มทบทวนเคสกลุ่มนี้กับสาขาที่มีมูลค่าสูงก่อน`,
 "แนวทางติดตาม: ตรวจรายละเอียดเคสเพื่อยืนยันสาเหตุและข้อเสนอที่เคยใช้ กำหนด Action และผู้รับผิดชอบตามสาเหตุ แล้วติดตามมูลค่า Save/Churn ในรอบถัดไป ข้อมูลนี้แสดงการกระจุกตัวของยอด ยังไม่ยืนยันสาเหตุเชิงลึก"
 ]:["ไม่มีข้อมูล Solution ตามตัวกรอง"];
 focusPanel("solutionFocus","Solution • Focus",date,cards,findings);
}
function renderPageFocus(service,group,region){
 renderBranchFocus(service,group,region);
 renderDownsellFocus("downsellFocus","TMH",store.downsellDetails,group,region);
 renderDownsellFocus("downsellTolFocus","TOL",store.tolDownsellDetails,group,region);
}


/* Executive report: same live branch snapshot and scope as the dashboard. */
function executiveMetrics(rows){
 const save=sum(rows,"Save Oct"),previous=sum(rows,"Save Sep"),request=sum(rows,"Request Oct"),previousRequest=sum(rows,"Request Sep");
 return {save,previous,request,rate:request?save/request:null,priorRate:previousRequest?previous/previousRequest:null,mom:previous?(save-previous)/previous:null,churn:sum(rows,"Churn Oct")};
}
function executiveModel(service,group,region){
 const latest=store.branches.map(r=>r["Report Date"]).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort().at(-1);
 const rows=store.branches.filter(r=>r["Report Date"]===latest&&r["Shop Name"]&&(service==="ALL"||r.Service===service)&&inScope(r.Region,group,region));
 const groups=key=>[...new Set(rows.map(key))].filter(Boolean).map(label=>({label,...executiveMetrics(rows.filter(r=>key(r)===label))})).filter(r=>r.request||r.save||r.previous);
 const priority=rows.filter(r=>n(r["Request Oct"])>0&&n(r["Save Oct"])/n(r["Request Oct"])<.88).sort((a,b)=>n(b["Churn Oct"])-n(a["Churn Oct"])).slice(0,6);
 const downsell=["TMH","TOL"].filter(p=>service==="ALL"||service===p).map(product=>{
  const pool=(product==="TMH"?store.downsellDetails:store.tolDownsellDetails||[]).filter(r=>String(r.Level).toUpperCase()==="AREA");
  const date=pool.map(r=>r["Report Date"]).sort().at(-1);
  const selected=pool.filter(r=>r["Report Date"]===date&&inScope(r.Region,group,region));
  const budget=sum(selected,"Budget Downsell"),rr=sum(selected,"RR Downsell");
  return {product,date,available:selected.length>0,budget,rr,ratio:budget?rr/budget:null,total:sum(selected,"Total Downsell"),retention:sum(selected,"Downsell Retention"),aftersale:sum(selected,"Downsell Aftersale")};
 });
 return {latest,rows,total:executiveMetrics(rows),products:groups(r=>r.Service),groups:groups(r=>areaGroupFor(r.Region)),types:groups(r=>normalizeShopType(r["Shop Type"])),areas:groups(r=>r.Region).sort((a,b)=>(a.rate??1)-(b.rate??1)),bmav:["TMH","TOL"].filter(p=>rows.some(r=>r.Service===p&&r.Region==="BMA V - Central")).map(label=>({label,...executiveMetrics(rows.filter(r=>r.Service===label&&r.Region==="BMA V - Central"))})),priority,downsell};
}
const executivePct=value=>value===null?"—":(value*100).toFixed(2)+"%";
const executiveMom=value=>value===null?"ไม่มีฐานเปรียบเทียบ":fmtDelta(value);
function executiveTable(title,items,latest){
 const current=new Date(latest+"T00:00:00"),prior=new Date(current);prior.setDate(1);prior.setMonth(prior.getMonth()-1);
 const month=d=>isNaN(d)?"—":d.toLocaleDateString("en-US",{month:"short",year:"2-digit"});
 return `<article class="panel executive-block"><h3>${escapeHtml(title)}</h3><div class="table-scroll"><table class="executive-table"><thead><tr><th>มุมมอง</th><th>Save ${month(prior)}</th><th>Save ${month(current)}</th><th>Save MoM</th><th>%Save</th><th>เปลี่ยนแปลง</th></tr></thead><tbody>${items.map(r=>`<tr><th scope="row">${escapeHtml(r.label)}</th><td>${fmtFull(r.previous)}</td><td class="executive-save">${fmtFull(r.save)}</td><td>${executiveMom(r.mom)}</td><td class="${r.rate!==null&&r.rate<.88?"executive-watch":"executive-save"}">${executivePct(r.rate)}</td><td>${r.rate===null||r.priorRate===null?"—":fmtPP(r.rate-r.priorRate)}</td></tr>`).join("")||'<tr><td colspan="6">ไม่มีข้อมูลตามตัวกรอง</td></tr>'}</tbody></table></div></article>`;
}
function renderExecutiveSummary(service,group,region){
 const m=executiveModel(service,group,region),t=m.total,scope=(service==="ALL"?"TMH + TOL":service)+" • "+scopeLabel(group,region);
 $("executiveScope").textContent=`${scope} • Retention ณ ${fmtDate(m.latest)} • ข้อมูลจากรอบล่าสุดของ Dashboard`;
 $("executiveCopyStatus").textContent="";
 if(!m.rows.length){
  $("executiveContent").innerHTML='<article class="panel"><h3>ยังไม่มีข้อมูลสำหรับสรุป</h3><p>ไม่พบข้อมูลรายสาขารอบล่าสุดตามตัวกรอง กรุณาอัปเดตข้อมูลหรือเปลี่ยนพื้นที่</p></article>';
  $("executiveNote").value="";$("executiveCopy").disabled=true;return;
 }
 $("executiveCopy").disabled=false;
 const below=m.areas.filter(r=>r.rate!==null&&r.rate<.88),best=m.areas.filter(r=>r.rate!==null).at(-1);
 const findings=[
  `รักษารายได้ ${fmtFull(t.save)} บาท • Save ${executivePct(t.rate)} • MoM ${executiveMom(t.mom)}`,
  `พื้นที่ผ่านเกณฑ์ Save 88% จำนวน ${m.areas.length-below.length}/${m.areas.length} พื้นที่${best?" • สูงสุด "+best.label+" ("+executivePct(best.rate)+")":""}`,
  below.length?"พื้นที่ควรเร่งเพิ่ม Save: "+below.map(r=>r.label+" "+executivePct(r.rate)).join(" • "):"ทุกพื้นที่ที่มีข้อมูลผ่านเกณฑ์ Save 88%",
  "ติดตามผล Save ควบคู่รายได้หลังปรับข้อเสนอ เพื่อรักษารายได้และควบคุม Downsell"
 ];
 const priorityHtml=`<article class="panel executive-block"><h3>สาขาที่ควรติดตาม • Save ต่ำกว่า 88%</h3><p>6 รายการที่มี Request เรียงตาม Churn สูงเพื่อชี้โอกาสรักษารายได้ • แยก TMH / TOL</p><div class="table-scroll"><table class="executive-table"><thead><tr><th>สาขา / พื้นที่</th><th>Product</th><th>Revenue Save</th><th>%Save</th><th>Churn รอง</th></tr></thead><tbody>${m.priority.map(r=>`<tr><th scope="row">${escapeHtml(r["Shop Name"])}<small>${escapeHtml(r.Region)}</small></th><td>${escapeHtml(r.Service)}</td><td class="executive-save">${fmtFull(r["Save Oct"])}</td><td class="executive-watch">${executivePct(n(r["Save Oct"])/n(r["Request Oct"]))}</td><td>${fmtFull(r["Churn Oct"])}</td></tr>`).join("")||'<tr><td colspan="5">ไม่มีรายการที่ Save ต่ำกว่า 88% ตามตัวกรอง</td></tr>'}</tbody></table></div></article>`;
 const downHtml=`<article class="panel executive-block"><h3>คุณภาพการ Save • Downsell</h3><div class="table-scroll"><table class="executive-table"><thead><tr><th>Product / วันที่</th><th>Downsell MTD</th><th>Budget เดือน</th><th>Run rate</th><th>RR / Budget</th><th>Retention</th><th>Aftersale</th></tr></thead><tbody>${m.downsell.map(d=>d.available?`<tr><th>${d.product}<small>${fmtDate(d.date)}</small></th><td>${fmtFull(d.total)}</td><td>${fmtFull(d.budget)}</td><td>${fmtFull(d.rr)}</td><td class="${d.ratio>1?"executive-watch":""}">${executivePct(d.ratio)}</td><td>${fmtFull(d.retention)}</td><td>${fmtFull(d.aftersale)}</td></tr>`:`<tr><th>${d.product}</th><td colspan="6">ยังไม่มีข้อมูล Downsell ตามตัวกรอง</td></tr>`).join("")}</tbody></table></div><p>Run rate เป็นประมาณการจากค่าเฉลี่ยต่อวัน • วันที่ Downsell อาจต่างจาก Retention</p></article>`;
 const actions=[
  "RM/FRM และหัวหน้าสาขาทบทวนเคส Save ไม่สำเร็จ เริ่มจากสาขา Priority และเคสมูลค่าสูง พร้อมระบุผู้รับผิดชอบ",
  "เสนอทางเลือกตามสาเหตุและเงื่อนไขที่ใช้ได้ เช่น ย้ายจุดติดตั้ง โอนผู้ใช้ ระงับชั่วคราว หรือปรับแพ็กเกจ",
  "ติดตาม Revenue Save, %Save และรายได้หลังปรับข้อเสนอร่วมกัน แยก Retention / Aftersale เพื่อควบคุม Downsell",
  "แลกเปลี่ยนแนวทางจากพื้นที่ Save สูง และติดตามผลรายวันในกลุ่มต่ำกว่า 88%"
 ];
 $("executiveContent").innerHTML=`
  <div class="executive-kpis">
   <article><small>REVENUE SAVE</small><strong>${(t.save/1e6).toFixed(2)} <span>ล้านบาท</span></strong><p>${fmtFull(t.save)} บาท</p></article>
   <article><small>SAVE RATE</small><strong>${executivePct(t.rate)}</strong><p>${t.rate!==null&&t.priorRate!==null?fmtPP(t.rate-t.priorRate)+" จากเดือนก่อน":"ไม่มีฐานเปรียบเทียบ"}</p></article>
   <article><small>SAVE MoM</small><strong>${t.mom===null?"—":fmtDelta(t.mom)}</strong><p>เทียบจำนวนวันตามข้อมูลต้นทาง</p></article>
  </div>
  <article class="panel executive-block"><h3>Key Findings • ชี้เป้าเพิ่ม Save</h3><ul class="executive-findings">${findings.map(s=>"<li>"+escapeHtml(s)+"</li>").join("")}</ul></article>
  ${executiveTable("By Product",m.products,m.latest)}
  <div class="executive-pair">${executiveTable("By Area Group",m.groups,m.latest)}${executiveTable("By Shop Type",m.types,m.latest)}</div>
  ${executiveTable("Performance by Area",m.areas,m.latest)}
  ${priorityHtml}
  ${m.bmav.length?executiveTable("Focus • BMA V – Central",m.bmav,m.latest):""}
  ${downHtml}
  <article class="panel executive-block"><h3>Action • ข้อเสนอแนะเพื่อเพิ่ม Save</h3><ol>${actions.map(s=>"<li>"+escapeHtml(s)+"</li>").join("")}</ol></article>
  <details class="panel executive-block executive-secondary"><summary>ข้อมูลประกอบ • Churn Value ${fmtFull(t.churn)} บาท</summary><p>ใช้ประกอบการจัดลำดับเคสที่ควรเร่งติดตาม โดยเน้นผล Save เป็นหลัก</p></details>
  <p class="executive-method">จำนวนเงิน: บาท • %Save = Revenue Save / Request • pp = จุดเปอร์เซ็นต์ • เกณฑ์ติดตาม 88% • สรุปตามตัวกรองบริการและพื้นที่ด้านบน • ยังไม่รวมสาเหตุ Solution</p>`;
 $("executiveNote").value=[
  `เรียนผู้บริหาร | Retention ณ ${fmtDate(m.latest)} | ${scope}`,
  `รักษารายได้รวม ${(t.save/1e6).toFixed(2)} ล้านบาท • Save Rate ${executivePct(t.rate)} • Save MoM ${executiveMom(t.mom)}`,
  "By Product: "+m.products.map(r=>`${r.label} Save ${(r.save/1e6).toFixed(2)} ล้านบาท / ${executivePct(r.rate)}`).join(" | "),
  "By Area Group: "+m.groups.map(r=>r.label+" "+executivePct(r.rate)).join(" • "),
  "By Shop Type: "+m.types.map(r=>r.label+" "+executivePct(r.rate)).join(" • "),
  below.length?"พื้นที่เร่งเพิ่ม Save: "+below.map(r=>r.label+" "+executivePct(r.rate)).join(" • "):"ทุกพื้นที่ที่มีข้อมูลผ่านเกณฑ์ Save 88%",
  m.priority.length?"สาขาติดตาม: "+m.priority.map(r=>r["Shop Name"]+" ("+r.Service+" "+executivePct(n(r["Save Oct"])/n(r["Request Oct"]))+")").join(" • "):"ไม่มีสาขา Save ต่ำกว่า 88% ตามตัวกรอง",
  ...m.downsell.map(d=>d.available?`Downsell ${d.product} ณ ${fmtDate(d.date)}: ${fmtFull(d.total)} บาท • RR/Budget ${executivePct(d.ratio)}`:`Downsell ${d.product}: ยังไม่มีข้อมูลตามตัวกรอง`),
  "Action: "+actions.join(" / "),
  `ข้อมูลรอง: Churn ${fmtFull(t.churn)} บาท`
 ].join("\n\n");
}
async function copyExecutiveNote(){
 const note=$("executiveNote"),status=$("executiveCopyStatus");
 try{await navigator.clipboard.writeText(note.value);status.textContent="คัดลอก Note แล้ว";}
 catch{note.focus();note.select();status.textContent="เลือกข้อความแล้ว กด Ctrl+C หรือคัดลอกข้อความ";}
}

// Churn Cap uses the budgets and components published in Retention Focus Tier.
const capNumber=value=>typeof value==="number"&&Number.isFinite(value)?value:null;
const capRatio=(value,budget)=>value!==null&&budget!==null&&budget>0?value/budget:null;
const capMoney=value=>value===null?"—":"฿"+fmtFull(value);
const capPercent=value=>value===null?"—":fmtPct(value);
function capProject(value,row){
 const day=capNumber(row?.["Cutoff Day"]),days=capNumber(row?.["Days in Month"]);
 return value!==null&&day>0&&days>=day?value/day*days:null;
}
function capFinish(item){
 item.budget=item.churnBudget!==null&&item.downBudget!==null?item.churnBudget+item.downBudget:null;
 item.mtd=item.churn!==null&&item.down!==null?item.churn+item.down:null;
 item.rr=item.churnRR!==null&&item.downRR!==null?item.churnRR+item.downRR:null;
 item.mtdRatio=capRatio(item.mtd,item.budget);item.rrRatio=capRatio(item.rr,item.budget);
 item.remaining=item.budget!==null&&item.mtd!==null?item.budget-item.mtd:null;
 item.gap=item.budget!==null&&item.rr!==null?item.rr-item.budget:null;
 item.status=item.rrRatio===null?"unknown":item.rrRatio>1?"over":item.rrRatio>=.9?"near":"safe";
 return item;
}
function capBranchModel(service,group,region){
 const output=[],periods=[];
 for(const product of solutionProducts(service)){
  const allChurn=store.branches.filter(r=>r.Service===product);
  const churnDate=allChurn.map(r=>r["Report Date"]).sort().at(-1);
  const allDown=(product==="TMH"?store.downsellDetails:store.tolDownsellDetails||[]).filter(r=>String(r.Level).toUpperCase()==="BRANCH");
  const downDate=allDown.map(r=>r["Report Date"]).sort().at(-1);
  const sameMonth=churnDate&&downDate&&churnDate.slice(0,7)===downDate.slice(0,7);
  periods.push({product,churnDate,downDate,sameMonth});
  const rows=new Map(),key=r=>r.Region+"|"+String(r["Shop Name"]||"").trim().replace(/\s+/g," ").toLowerCase();
  for(const r of allChurn.filter(r=>r["Report Date"]===churnDate&&inScope(r.Region,group,region))){
   if(r["Shop Name"])rows.set(key(r),{c:r,d:null});
  }
  if(sameMonth)for(const r of allDown.filter(r=>r["Report Date"]===downDate&&inScope(r.Region,group,region))){
   if(!r["Shop Name"])continue;
   const pair=rows.get(key(r))||{c:null,d:null};pair.d=r;rows.set(key(r),pair);
  }
  for(const {c,d} of rows.values()){
   const base=c||d,churn=capNumber(c?.["Churn Oct"]),down=capNumber(d?.["Total Downsell"]);
   const churnBudget=capNumber(c?.["Budget Churn"]),downBudget=capNumber(d?.["Budget Downsell"]);
   if(![churn,down,churnBudget,downBudget].some(v=>v!==null&&v!==0))continue;
   output.push(capFinish({product,area:base.Region,name:base["Shop Name"],type:normalizeShopType(base["Shop Type"]),churn,down,churnBudget,downBudget,
    churnRR:capProject(churn,c),downRR:capProject(down,d),retention:capNumber(d?.["Downsell Retention"]),aftersale:capNumber(d?.["Downsell Aftersale"])}));
  }
 }
 return {rows:output,periods};
}
function capAggregate(rows){
 const result={count:rows.length};
 for(const field of ["churn","down","churnBudget","downBudget","churnRR","downRR","retention","aftersale"]){
  result[field]=rows.length&&rows.every(r=>r[field]!==null)?rows.reduce((s,r)=>s+r[field],0):null;
 }
 return capFinish(result);
}
const capStatusLabels={safe:"อยู่ใน Cap",near:"ใกล้ Cap",over:"เกิน Cap",unknown:"ข้อมูลไม่ครบ / ไม่มี Budget"};
function capBadge(row){return '<span class="cap-badge '+row.status+'">'+capStatusLabels[row.status]+'</span>';}
function capTable(rows,branch){
 const headers=["Product",branch?"สาขา":"Area",...(branch?["Area","Type Shop"]:[]),"Budget Churn","Churn MTD","RR Churn","RR Churn / Budget","Budget Downsell","Downsell MTD","RR Downsell","Budget รวม","Out Flow MTD","RR Out Flow","RR %Churn Cap","RR เกิน / ต่ำกว่า Budget","สถานะ"];
 const money=value=>"<td>"+capMoney(value)+"</td>";
 const body=rows.map(r=>'<tr><td>'+escapeHtml(r.product)+'</td><th scope="row">'+escapeHtml(branch?r.name:r.area)+'</th>'+
 (branch?'<td>'+escapeHtml(r.area)+'</td><td>'+escapeHtml(r.type)+'</td>':"")+
 money(r.churnBudget)+money(r.churn)+money(r.churnRR)+'<td>'+capPercent(capRatio(r.churnRR,r.churnBudget))+'</td>'+
 money(r.downBudget)+money(r.down)+money(r.downRR)+money(r.budget)+money(r.mtd)+money(r.rr)+
 '<td class="'+(r.status==="over"?"bad":r.status==="safe"?"good":"")+'">'+capPercent(r.rrRatio)+'</td>'+money(r.gap)+'<td>'+capBadge(r)+'</td></tr>').join("");
 return '<table class="cap-table"><thead><tr>'+headers.map(h=>'<th scope="col">'+h+'</th>').join("")+'</tr></thead><tbody>'+
 (body||'<tr><td colspan="'+headers.length+'" class="empty-state">ไม่มีข้อมูลตามตัวกรอง</td></tr>')+'</tbody></table>';
}
function capBudgetBar(label,mtd,rr,budget){
 const m=capRatio(mtd,budget),r=capRatio(rr,budget),scale=Math.max(1.2,m||0,r||0);
 return '<article class="cap-budget-row"><div><strong>'+label+'</strong><span>Budget '+capMoney(budget)+'</span></div>'+
 '<p>MTD <b>'+capMoney(mtd)+'</b> ('+capPercent(m)+') · RR <b>'+capMoney(rr)+'</b> ('+capPercent(r)+')</p>'+
 '<div class="cap-track" aria-hidden="true"><i class="cap-rr" style="width:'+((r||0)/scale*100)+'%"></i><i class="cap-mtd" style="width:'+((m||0)/scale*100)+'%"></i><i class="cap-limit" style="left:'+(100/scale)+'%"></i></div></article>';
}
function renderChurnCap(){
 const service=$("serviceFilter").value,group=$("areaGroupFilter").value,region=$("regionFilter").value;
 const model=capBranchModel(service,group,region),typeSelect=$("capType"),old=typeSelect.value;
 const types=[...new Set(model.rows.map(r=>r.type).filter(Boolean))].sort();
 typeSelect.innerHTML='<option value="ALL">ทุก Type Shop</option>'+types.map(t=>'<option value="'+escapeHtml(t)+'">'+escapeHtml(t)+'</option>').join("");
 typeSelect.value=types.includes(old)?old:"ALL";
 const query=$("capSearch").value.trim().toLowerCase(),status=$("capStatus").value;
 const scoped=model.rows.filter(r=>(typeSelect.value==="ALL"||r.type===typeSelect.value)&&(!query||r.name.toLowerCase().includes(query)));
 const rows=scoped.filter(r=>status==="ALL"||r.status===status),total=capAggregate(rows);
 $("capScope").textContent=scopeLabel(group,region)+" • "+rows.length+" รายการสาขา/Product • "+model.periods.map(p=>p.product+": Churn "+fmtDate(p.churnDate)+" / Downsell "+fmtDate(p.downDate)).join(" • ");
 $("capAvailability").textContent="Budget จาก Retention Focus Tier ตามเดือนที่เลือก • Out Flow = Churn Value + Downsell Retention + Downsell Aftersale ที่รายงานในไฟล์ • ยังไม่มีข้อมูลยืนยัน Churn DTAC และ Share Plan แยก จึงไม่บวกเพิ่มเติม • RR คำนวณแยกตามวันข้อมูลของแต่ละองค์ประกอบ แล้วจึงรวม"+(model.periods.some(p=>!p.sameMonth)?" • มีชุดข้อมูลไม่ครบเดือนเดียวกัน จึงไม่แสดง Cap รวมในรายการนั้น":"");
 const card=(label,value,note)=>'<article class="customer-metric"><small>'+label+'</small><strong>'+value+'</strong><span>'+note+'</span></article>';
 $("capCards").innerHTML=card("BUDGET OUT FLOW",capMoney(total.budget),"Budget Churn + Budget Downsell ทั้งเดือน")+
 card("OUT FLOW MTD",capMoney(total.mtd),"สะสมตามวันที่ข้อมูลแต่ละชุด")+
 card("%CHURN CAP MTD",capPercent(total.mtdRatio),"Out Flow MTD ÷ Budget ทั้งเดือน")+
 card("RR %CHURN CAP",capPercent(total.rrRatio),"RR Out Flow "+capMoney(total.rr))+
 card("BUDGET คงเหลือ",capMoney(total.remaining),"Budget ทั้งเดือน − Out Flow MTD");
 $("capBudgetBars").innerHTML=capBudgetBar("Churn",total.churn,total.churnRR,total.churnBudget)+capBudgetBar("Downsell",total.down,total.downRR,total.downBudget)+capBudgetBar("Out Flow รวม",total.mtd,total.rr,total.budget);
 $("capComponents").innerHTML='<dl>'+[["Churn Value",total.churn],["Downsell Retention",total.retention],["Downsell Aftersale",total.aftersale],["Out Flow รวม",total.mtd]].map(([label,value])=>'<div><dt>'+label+'</dt><dd>'+capMoney(value)+'</dd></div>').join("")+'</dl>';
 const areas=new Map();rows.forEach(r=>{const key=r.product+"|"+r.area;if(!areas.has(key))areas.set(key,[]);areas.get(key).push(r);});
 const areaRows=[...areas.values()].map(items=>({...capAggregate(items),product:items[0].product,area:items[0].area}));
 const rank=(a,b)=>(b.rrRatio??-1)-(a.rrRatio??-1);
 areaRows.sort(rank);rows.sort(rank);
 $("capAreaTable").innerHTML=capTable(areaRows,false);$("capBranchTable").innerHTML=capTable(rows,true);
 const over=rows.filter(r=>r.status==="over"),near=rows.filter(r=>r.status==="near"),unknown=rows.filter(r=>r.status==="unknown");
 const findings=[];
 findings.push('เกิน Cap <strong>'+over.length+'</strong> รายการ • ใกล้ Cap (90–100%) <strong>'+near.length+'</strong> รายการ • ข้อมูลไม่ครบ/ไม่มี Budget <strong>'+unknown.length+'</strong> รายการ');
 if(total.gap!==null)findings.push('คาดการณ์ Out Flow สิ้นเดือน <strong>'+capMoney(total.rr)+'</strong> เทียบ Budget '+capMoney(total.budget)+' — '+(total.gap>0?'เกิน':'ต่ำกว่า')+' Budget <strong>'+capMoney(Math.abs(total.gap))+'</strong>');
 const highest=[...over].sort((a,b)=>(b.gap||0)-(a.gap||0)).slice(0,3);
 if(highest.length)findings.push('สาขาที่ควรติดตามก่อน (มูลค่าคาดการณ์เกิน Budget สูงสุด): '+highest.map(r=>escapeHtml(r.name)+' ('+r.product+') <strong>'+capMoney(r.gap)+'</strong>').join(' • '));
 if(total.churnRR!==null&&total.downRR!==null)findings.push('องค์ประกอบ RR ที่สูงกว่า: <strong>'+(total.churnRR>=total.downRR?'Churn':'Downsell')+'</strong> • ตรวจสาเหตุในหน้า Solution และติดตามผลรายสาขา');
 $("capFindings").innerHTML=findings.map(t=>'<li>'+t+'</li>').join("");
}

function render(){
  const service=$("serviceFilter").value,group=$("areaGroupFilter").value,region=$("regionFilter").value,data=latestRows(service,group,region),now=aggregatePerformance(data.now),before=aggregatePerformance(data.before);
  renderPeriodLabels(data.prior,data.latest);
  document.documentElement.dataset.service=service.toLowerCase();
  $("performanceDate").textContent=fmtDate(data.latest);renderHomeOverview(service,group,region);
  $("serviceCards").innerHTML=service==="ALL"?serviceCard("TMH",group,region)+serviceCard("TOL",group,region):serviceCard(service,group,region);
  $("comparisonGrid").innerHTML=comparisonCard("Request",now.request,before.request)+comparisonCard("Save",now.save,before.save)+comparisonCard("Churn",now.churn,before.churn,true);
  const areaPool=store.performance.filter(row=>row["Report Date"]===data.latest&&row.Region!=="ALL"&&(service==="ALL"||row.Service===service)&&inScope(row.Region,group,region)),areas=groupAreas(areaPool);
  bars("saveRateBars",areas,"saveRate",{max:1,sort:"asc",kind:"teal",noteKey:item=>item.saveRate<.88?"ต่ำกว่าเป้าหมาย 88%":"ผ่านเป้าหมาย 88%"});
  bars("runRateBars",areas,"rrCap",{max:Math.max(1.6,...areas.map(item=>item.rrCap)),sort:"desc",kind:"warn",noteKey:item=>item.rrCap>1?`เกิน Cap ${fmtPct(item.rrCap-1)}`:"อยู่ใน Cap"});
  renderAreaFocusTable(service,group,region);const downsell=renderDownsell(group,region);renderInsights(now,before,areas,downsell);renderHallCards(group,region);renderBranchTable(service,group,region);renderDownsellTables(group,region);renderDownsellTolTables(group,region);renderSolutions();renderPageFocus(service,group,region);renderExecutiveSummary(service,group,region);renderChurnCap();
}


let tableCaptureState=null;

const tableFitPreferences=new WeakMap();
let tableFitPending=false;
function scheduleTableFit(){
 if(tableFitPending)return;
 tableFitPending=true;requestAnimationFrame(()=>{tableFitPending=false;fitPageTables();});
}
function fitPageTables(){
 document.querySelectorAll(".partition table").forEach(table=>{
  const wrap=table.closest(".table-scroll")||table.parentElement;
  if(!wrap.clientWidth||!table.getClientRects().length)return;
  let settings=tableFitPreferences.get(table);
  if(!settings){settings={fit:true,width:table.style.width};tableFitPreferences.set(table,settings);}
  table.style.zoom="1";table.style.width=settings.width;
  wrap.classList.toggle("table-page-fit",settings.fit);
  const natural=Math.max(table.scrollWidth,table.offsetWidth);
  const scale=settings.fit?Math.min(1,wrap.clientWidth/Math.max(1,natural)):1;
  if(settings.fit){table.style.width=natural+"px";table.style.zoom=String(scale);}
  const controls=wrap.previousElementSibling;
  const size=controls?.querySelector("[data-fit-size]"),label=Math.round(scale*100)+"%";
  if(size&&size.textContent!==label)size.textContent=label;
  controls?.querySelector("[data-fit-page]")?.setAttribute("aria-pressed",String(settings.fit));
  controls?.querySelector("[data-fit-actual]")?.setAttribute("aria-pressed",String(!settings.fit));
 });
}

function installTableCaptureButtons(){
 document.querySelectorAll(".partition table").forEach(table=>{
  const wrap=table.closest(".table-scroll")||table.parentElement;
  if(wrap.previousElementSibling?.classList.contains("table-capture-tools"))return;
  const tools=document.createElement("div");tools.className="table-capture-tools";
  const button=document.createElement("button");button.type="button";button.className="table-capture-button";button.textContent="⛶ Capture ตารางเต็มกรอบ";
  button.addEventListener("click",()=>openTableCapture(wrap.querySelector("table")));
  const fit=document.createElement("button");fit.type="button";fit.className="table-capture-button";fit.dataset.fitPage="";fit.textContent="Fit to page";
 const actual=document.createElement("button");actual.type="button";actual.className="table-capture-button";actual.dataset.fitActual="";actual.textContent="ขนาดจริง 100%";
 const size=document.createElement("span");size.dataset.fitSize="";size.className="table-fit-size";
 const change=value=>{const target=wrap.querySelector("table");if(!target)return;const state=tableFitPreferences.get(target)||{width:target.style.width};state.fit=value;tableFitPreferences.set(target,state);scheduleTableFit();};
 fit.addEventListener("click",()=>change(true));actual.addEventListener("click",()=>change(false));
 tools.append(fit,actual,size,button);wrap.before(tools);
 });
}
function openTableCapture(table){
 if(!table)return;
 const dialog=$("tableCaptureDialog"),sheet=$("tableCaptureSheet"),container=table.closest("article,.focus-table-card,.solution-matrix-card,.solution-comparison-card");
 const heading=container?.querySelector("h3,h2")?.textContent||table.caption?.textContent||"Performance";
 const scope=["serviceFilter","areaGroupFilter","regionFilter"].map(id=>$(id)?.selectedOptions?.[0]?.textContent).filter(Boolean);
 if(table.closest("#branchPartition"))scope.push($("shopTypeFilter").selectedOptions[0].textContent);
 if(table.closest("#solutionPartition"))scope.push($("solutionBranchFilter").selectedOptions[0].textContent);
 sheet.replaceChildren();
 const title=document.createElement("h2");title.textContent=heading;
 const detail=document.createElement("p");detail.textContent=scope.join(" • ");
 const notice=container?.querySelector(".data-notice,.branch-data-notice");
 if(notice?.textContent)detail.textContent+=" • "+notice.textContent;
 const copy=table.cloneNode(true);
 copy.style.zoom="1";
 copy.removeAttribute("id");copy.querySelectorAll("[id]").forEach(el=>el.removeAttribute("id"));
 copy.querySelectorAll("th,td").forEach(cell=>{cell.style.setProperty("position","static","important");cell.style.setProperty("overflow","visible","important");cell.style.setProperty("text-overflow","clip","important");});
 copy.querySelectorAll("caption").forEach(el=>el.remove());
 sheet.append(title,detail,copy);
 // Preserve actual column widths and colors in the captured table.
 const originals=table.querySelectorAll("th,td"),copies=copy.querySelectorAll("th,td");
 originals.forEach((cell,i)=>{const style=getComputedStyle(cell);["background-color","color","border-color","font-weight"].forEach(key=>copies[i].style.setProperty(key,style.getPropertyValue(key)));});
 const width=Math.max(table.scrollWidth,table.getBoundingClientRect().width,900);
 copy.style.setProperty("width","100%","important");copy.style.setProperty("min-width","0","important");copy.style.setProperty("table-layout","auto","important");copy.style.fontSize="14px";
 sheet.style.width=(width+48)+"px";
 tableCaptureState={opener:document.activeElement,mode:"frame"};
 dialog.showModal();requestAnimationFrame(()=>fitTableCapture("frame"));
}
function fitTableCapture(mode){
 if(!tableCaptureState)return;
 tableCaptureState.mode=mode;
 const sheet=$("tableCaptureSheet"),stage=$("tableCaptureStage"),frame=$("tableCaptureFrame");
 sheet.style.transform="none";
 const w=sheet.offsetWidth,h=sheet.offsetHeight;
 const scale=mode==="actual"?1:Math.min(1,(stage.clientWidth-32)/w,...(mode==="frame"?[(stage.clientHeight-32)/h]:[]));
 sheet.style.transform=`scale(${scale})`;
 frame.style.width=Math.ceil(w*scale)+"px";frame.style.height=Math.ceil(h*scale)+"px";
 $("tableCaptureZoom").textContent=Math.round(scale*100)+"%";
 stage.scrollTop=0;stage.scrollLeft=0;
}
function closeTableCapture(){const opener=tableCaptureState?.opener;$("tableCaptureDialog").close();tableCaptureState=null;opener?.focus();}

function setPartition(partition){
  scheduleTableFit();
  $("churnCapPartition").hidden=partition!=="churnCap";
  $("executivePartition").hidden=partition!=="executive";
  document.querySelectorAll(".partition-tab[data-partition]").forEach(button=>{const active=button.dataset.partition===partition;button.classList.toggle("is-active",active);button.setAttribute("aria-selected",String(active));});
  $("overviewPartition").hidden=partition!=="overview";$("branchPartition").hidden=partition!=="branch";$("downsellPartition").hidden=partition!=="downsell";$("downsellTolPartition").hidden=partition!=="downsellTol";$("solutionPartition").hidden=partition!=="solution";
}

["capType","capStatus"].forEach(id=>$(id).addEventListener("change",renderChurnCap));
$("capSearch").addEventListener("input",renderChurnCap);
$("capReset").addEventListener("click",()=>{$("capType").value="ALL";$("capStatus").value="ALL";$("capSearch").value="";renderChurnCap();});
$("monthTabs").addEventListener("click",event=>{const button=event.target.closest("[data-month]");if(button)selectReportMonth(button.dataset.month);});
$("executiveCopy").addEventListener("click",copyExecutiveNote);
$("executiveShortcut").addEventListener("click",()=>{setPartition("executive");$("executivePartition").scrollIntoView({behavior:"smooth",block:"start"});});
$("serviceFilter").addEventListener("change",render);
$("areaGroupFilter").addEventListener("change",()=>{populateRegions();render();});
$("regionFilter").addEventListener("change",render);
$("shopTypeFilter").addEventListener("change",render);
$("solutionBranchFilter").addEventListener("change",renderSolutions);
$("solutionMetricFilter").addEventListener("change",renderSolutions);
$("refreshButton").addEventListener("click",loadData);
document.querySelectorAll(".partition-tab[data-partition]").forEach(button=>button.addEventListener("click",()=>setPartition(button.dataset.partition)));
$("captureModeButton").addEventListener("click",()=>{const active=document.body.classList.toggle("capture-mode");$("captureModeButton").textContent=active?"✕ ออกจากโหมด Capture":"⛶ โหมด Capture";});
$("tableCaptureClose").addEventListener("click",closeTableCapture);
$("tableCaptureFit").addEventListener("click",()=>fitTableCapture("frame"));
$("tableCaptureWidth").addEventListener("click",()=>fitTableCapture("width"));
$("tableCaptureActual").addEventListener("click",()=>fitTableCapture("actual"));
$("tableCapturePrint").addEventListener("click",()=>window.print());
$("tableCaptureDialog").addEventListener("cancel",event=>{event.preventDefault();closeTableCapture();});
window.addEventListener("resize",()=>{scheduleTableFit();if(tableCaptureState)fitTableCapture(tableCaptureState.mode);});
let captureInstallPending=false;
const captureObserver=new MutationObserver(()=>{if(captureInstallPending)return;captureInstallPending=true;requestAnimationFrame(()=>{captureInstallPending=false;installTableCaptureButtons();scheduleTableFit();});});
document.querySelectorAll(".partition").forEach(part=>captureObserver.observe(part,{childList:true,subtree:true}));
installTableCaptureButtons();
scheduleTableFit();
if(document.fonts?.ready)document.fonts.ready.then(scheduleTableFit);
if(typeof ResizeObserver!=="undefined"){const observer=new ResizeObserver(scheduleTableFit);observer.observe(document.querySelector("main.dashboard"));}
$("sheetLink").href=SHEET_URL;
loadData();
window.setInterval(()=>{if(document.visibilityState==="visible")loadData();},5*60*1000);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")loadData();});

