const SPREADSHEET_ID = "1gw9c97wtVitsn5B8P9ugwavD4xOGf3M_RScNGvk_hNM";
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`;
const PERF_HEADERS = ["Report Date","Service","Region","No Shop","Rev Request","Rev Save","Churn Value","Budget Churn Month","Cutoff Day","Days in Month","Save Rate","RR Churn","RR / Cap","Tier"];
const DOWN_HEADERS = ["Report Date","Region","No Shop","Budget Downsell","Downsell Retention","Downsell Aftersale","Cutoff Day","Days in Month","Total Downsell","RR Downsell","MTD / Budget","RR / Budget","Over Budget Records","Status"];
const BRANCH_HEADERS = ["Report Date","Service","Area Group","Region","Shop Name","Shop Type","Request Jul","Request Aug","Request MoM","Request %MoM","Save Jul","Save Aug","Save MoM","Save %MoM","Churn Jul","Churn Aug","Churn MoM","Churn %MoM","Save Rate Jul","Save Rate Aug","Save Rate MoM","Budget Churn","MTD Budget Churn","Over Budget","Tier","Cutoff Day","Days in Month"];
const DOWNSELL_DETAIL_HEADERS = ["Report Date","Level","Area Group","Region","Shop Name","Shop Type","No Shop","Budget Downsell","Downsell Retention","Downsell Aftersale","Total Downsell","RR Downsell","MTD / Budget","RR / Budget","Over Budget Records","Status","Last Month","Cutoff Day","Days in Month"];
const SOLUTION_HEADERS = ["Report Date","Product","Area Group","Region","Shop Name","Solution Name","Request Sub","Rev Request","Rev Save","Churn Value","Cutoff Day","Days in Month"];
const AREA_GROUPS = {
  "BMA 5 Area": ["BMA I - North West","BMA II - South West","BMA III - North East","BMA IV - South East","BMA V - Central"],
  UPC1: ["UPC - Central Northeast","UPC - Lower North","UPC - Lower Northeast","UPC - Upper North","UPC - Upper Northeast"],
  UPC2: ["UPC - Central","UPC - East","UPC - Upper South","UPC - West","UPC - Lower South"]
};
let store = { performance: [], downsell: [], branches: [], downsellDetails: [], solutions: [], live: false, branchLive: false, downsellDetailLive: false, solutionLive: false };
let comparisonMonths = { before: "July", now: "August" };
const periodTemplates = new Map();

function renderPeriodLabels(prior, latest){
  const month=(value,short=false)=>{
    const date=new Date(`${dateKey(value)}T00:00:00`);
    if(isNaN(date)) return "—";
    return short ? `${date.toLocaleDateString("en-US",{month:"short"})}-${String(date.getFullYear()).slice(-2)}` : date.toLocaleDateString("en-US",{month:"long"});
  };
  comparisonMonths={before:month(prior),now:month(latest)};
  document.querySelectorAll("h2,p,caption,th").forEach(element=>{
    if(!periodTemplates.has(element) && /July|August|Jul-26|Aug-26/.test(element.textContent)) periodTemplates.set(element,element.textContent);
  });
  periodTemplates.forEach((template,element)=>{
    const labels={"Jul-26":month(prior,true),"Aug-26":month(latest,true),July:comparisonMonths.before,August:comparisonMonths.now};
    element.textContent=template.replace(/Jul-26|Aug-26|July|August/g,key=>labels[key]);
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
    script.src=`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json;responseHandler:${callback}&sheet=${encodeURIComponent(sheet)}&headers=1`;
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

async function loadData(){
  const status=$("dataStatus");
  status.className="status-pill";
  status.innerHTML="<span></span>กำลังโหลดข้อมูล...";
  const [performance,downsell,branches,downsellDetails,solutions]=await Promise.allSettled([
    loadGviz("Performance_Daily"),loadGviz("Downsell_Area_Daily"),loadGviz("Branch_Performance_Daily"),loadGviz("Downsell_Performance_Daily"),loadGviz("Solution_Performance_Daily")
  ]);
  const coreLive=performance.status==="fulfilled"&&downsell.status==="fulfilled";
  store={
    performance:coreLive?rowObjects(performance.value,PERF_HEADERS):rowObjects(window.RETENTION_FALLBACK.performance,PERF_HEADERS),
    downsell:coreLive?rowObjects(downsell.value,DOWN_HEADERS):rowObjects(window.RETENTION_FALLBACK.downsell,DOWN_HEADERS),
    branches:branches.status==="fulfilled"?rowObjects(branches.value,BRANCH_HEADERS):[],
    downsellDetails:downsellDetails.status==="fulfilled"?rowObjects(downsellDetails.value,DOWNSELL_DETAIL_HEADERS):[],
    solutions:solutions.status==="fulfilled"?rowObjects(solutions.value,SOLUTION_HEADERS):solutionFallbackRows(),
    live:coreLive,
    branchLive:branches.status==="fulfilled",
    downsellDetailLive:downsellDetails.status==="fulfilled",
    solutionLive:solutions.status==="fulfilled"
  };
  if(coreLive&&store.branchLive&&store.downsellDetailLive&&store.solutionLive){status.className="status-pill live";status.innerHTML="<span></span>Live from Google Sheet";}
  else if(coreLive){status.className="status-pill fallback";status.innerHTML="<span></span>Live • บางตารางใช้ข้อมูลสำรอง";}
  else{status.className="status-pill fallback";status.innerHTML="<span></span>Snapshot • รอสิทธิ์ Google Sheet";}
  populateRegions();render();
}

function populateRegions(){
  const select=$("regionFilter"),group=$("areaGroupFilter").value,current=select.value;
  const regions=[...new Set([...store.performance.map(row=>row.Region),...store.downsell.map(row=>row.Region),...store.branches.map(row=>row.Region),...store.downsellDetails.map(row=>row.Region),...store.solutions.map(row=>row.Region)].filter(region=>region&&region!=="ALL"&&(group==="ALL"||AREA_GROUPS[group]?.includes(region))))].sort();
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
  const dates=[...new Set(pool.map(row=>row["Report Date"]))].sort(),latest=dates.at(-1),prior=dates.at(-2);
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
  if(row.overBudget<=1&&row.saveRateAug>=.88) return {code:"T1",text:"T1 • In Cap / Save ≥ 88%"};
  if(row.overBudget>1&&row.saveRateAug>=.88) return {code:"T2",text:"T2 • Over Cap / Save ≥ 88%"};
  if(row.overBudget>1&&row.saveRateAug<.88) return {code:"T3",text:"T3 • Over Cap / Save < 88%"};
  return {code:"WATCH",text:"Watch • In Cap / Save < 88%"};
}

function comparisonRow(region,july,august){
  const row={region,requestJul:july.request,requestAug:august.request,saveJul:july.save,saveAug:august.save,churnJul:july.churn,churnAug:august.churn,saveRateJul:july.saveRate,saveRateAug:august.saveRate,budget:august.budget,mtdBudget:august.mtdBudget,overBudget:august.overBudget};
  row.requestDiff=row.requestAug-row.requestJul;row.requestMom=delta(row.requestAug,row.requestJul);
  row.saveDiff=row.saveAug-row.saveJul;row.saveMom=delta(row.saveAug,row.saveJul);
  row.churnDiff=row.churnAug-row.churnJul;row.churnMom=delta(row.churnAug,row.churnJul);
  row.saveRateDiff=row.saveRateAug-row.saveRateJul;row.tier=tierStatus(row);
  return row;
}

function areaFocusData(service,group,region){
  const pool=store.performance.filter(row=>row.Region&&row.Region!=="ALL"&&(service==="ALL"||row.Service===service)&&inScope(row.Region,group,region));
  const dates=[...new Set(pool.map(row=>row["Report Date"]))].sort(),latest=dates.at(-1),prior=dates.at(-2),regions=[...new Set(pool.map(row=>row.Region))].sort();
  const rows=regions.map(area=>comparisonRow(area,areaSummary(pool.filter(row=>row.Region===area&&row["Report Date"]===prior)),areaSummary(pool.filter(row=>row.Region===area&&row["Report Date"]===latest))));
  const total=comparisonRow("Selection Total",areaSummary(pool.filter(row=>row["Report Date"]===prior)),areaSummary(pool.filter(row=>row["Report Date"]===latest)));
  return {rows,total,latest,prior};
}

const tone=(value,inverse=false)=>deltaClass(value,inverse);
const serviceClass=service=>service==="TMH"?"tmh":service==="TOL"?"tol":"all";
function focusRowHtml(row,selectedRegion,isTotal=false){
  const selected=!isTotal&&selectedRegion!=="ALL"&&row.region===selectedRegion;
  return `<tr class="${isTotal?"grand-total ":""}${selected?"is-focus":""}"${selected?' aria-current="true"':""}><th class="region-cell" scope="row">${escapeHtml(row.region)}${selected?'<span class="focus-mark">Focus</span>':""}</th><td>${fmtFull(row.requestJul)}</td><td>${fmtFull(row.requestAug)}</td><td class="cell-tone ${tone(row.requestDiff,true)}">${fmtSignedFull(row.requestDiff)}</td><td class="cell-tone ${tone(row.requestMom,true)}">${fmtDelta(row.requestMom)}</td><td>${fmtFull(row.saveJul)}</td><td>${fmtFull(row.saveAug)}</td><td class="cell-tone ${tone(row.saveDiff)}">${fmtSignedFull(row.saveDiff)}</td><td class="cell-tone ${tone(row.saveMom)}">${fmtDelta(row.saveMom)}</td><td>${fmtFull(row.churnJul)}</td><td>${fmtFull(row.churnAug)}</td><td class="cell-tone ${tone(row.churnDiff,true)}">${fmtSignedFull(row.churnDiff)}</td><td class="cell-tone ${tone(row.churnMom,true)}">${fmtDelta(row.churnMom)}</td><td>${fmtPct(row.saveRateJul)}</td><td>${fmtPct(row.saveRateAug)}</td><td class="cell-tone ${tone(row.saveRateDiff)}">${fmtPP(row.saveRateDiff)}</td><td>${fmtFull(row.budget)}</td><td>${fmtFull(row.mtdBudget)}</td><td class="over-budget ${row.overBudget>1?"bad":"good"}">${fmtPct(row.overBudget)}</td><td><span class="tier-pill ${row.tier.code.toLowerCase()}" title="${escapeHtml(row.tier.text)}">${row.tier.code}</span></td></tr>`;
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
  const requestJul=sum(rows,"Request Jul"),requestAug=sum(rows,"Request Aug"),saveJul=sum(rows,"Save Jul"),saveAug=sum(rows,"Save Aug"),churnJul=sum(rows,"Churn Jul"),churnAug=sum(rows,"Churn Aug"),budget=sum(rows,"Budget Churn"),mtdBudget=sum(rows,"MTD Budget Churn");
  const item={shop:rows[0]["Shop Name"],region:rows[0].Region,service,shopType:[...new Set(rows.map(row=>row["Shop Type"]).filter(Boolean))].join(" / "),requestJul,requestAug,saveJul,saveAug,churnJul,churnAug,budget,mtdBudget,saveRateJul:requestJul?saveJul/requestJul:0,saveRateAug:requestAug?saveAug/requestAug:0,overBudget:mtdBudget?churnAug/mtdBudget:0};
  item.requestDiff=requestAug-requestJul;item.requestMom=delta(requestAug,requestJul);item.saveDiff=saveAug-saveJul;item.saveMom=delta(saveAug,saveJul);item.churnDiff=churnAug-churnJul;item.churnMom=delta(churnAug,churnJul);item.saveRateDiff=item.saveRateAug-item.saveRateJul;item.tier=tierStatus(item);
  return item;
}

function branchFocusData(service,group,region,shopType="ALL"){
  let pool=store.branches.filter(row=>(service==="ALL"||row.Service===service)&&inScope(row.Region,group,region)&&(shopType==="ALL"||normalizeShopType(row["Shop Type"])===shopType));
  const latest=[...new Set(pool.map(row=>row["Report Date"]))].sort().at(-1);
  pool=pool.filter(row=>row["Report Date"]===latest&&row["Shop Name"]);
  const grouped=new Map();
  pool.forEach(row=>{const key=service==="ALL"?`${row.Region}|${row["Shop Name"]}`:`${row.Service}|${row.Region}|${row["Shop Name"]}`,items=grouped.get(key)||[];items.push(row);grouped.set(key,items);});
  const label=service==="ALL"?"TMH + TOL":service;
  return {latest,rows:[...grouped.values()].map(items=>summarizeBranchRows(items,label)).sort((a,b)=>a.region.localeCompare(b.region)||b.overBudget-a.overBudget||a.shop.localeCompare(b.shop))};
}

function branchRowHtml(row){
  return `<tr><th class="branch-cell" scope="row"><strong>${escapeHtml(row.shop)}</strong><small>${escapeHtml(row.shopType)}</small></th><td class="area-cell">${escapeHtml(row.region)}</td><td><span class="service-pill ${serviceClass(row.service)}">${escapeHtml(row.service.replace(" + ","+"))}</span></td><td>${fmtFull(row.requestJul)}</td><td>${fmtFull(row.requestAug)}</td><td class="cell-tone ${tone(row.requestDiff,true)}">${fmtSignedFull(row.requestDiff)}</td><td class="cell-tone ${tone(row.requestMom,true)}">${fmtDelta(row.requestMom)}</td><td>${fmtFull(row.saveJul)}</td><td>${fmtFull(row.saveAug)}</td><td class="cell-tone ${tone(row.saveDiff)}">${fmtSignedFull(row.saveDiff)}</td><td class="cell-tone ${tone(row.saveMom)}">${fmtDelta(row.saveMom)}</td><td>${fmtFull(row.churnJul)}</td><td>${fmtFull(row.churnAug)}</td><td class="cell-tone ${tone(row.churnDiff,true)}">${fmtSignedFull(row.churnDiff)}</td><td class="cell-tone ${tone(row.churnMom,true)}">${fmtDelta(row.churnMom)}</td><td>${fmtPct(row.saveRateJul)}</td><td>${fmtPct(row.saveRateAug)}</td><td class="cell-tone ${tone(row.saveRateDiff)}">${fmtPP(row.saveRateDiff)}</td><td>${fmtFull(row.budget)}</td><td>${fmtFull(row.mtdBudget)}</td><td class="over-budget ${row.overBudget>1?"bad":"good"}">${fmtPct(row.overBudget)}</td><td><span class="tier-pill ${row.tier.code.toLowerCase()}" title="${escapeHtml(row.tier.text)}">${row.tier.code}</span></td></tr>`;
}

function hallCard(service,group,region){
  let pool=store.branches.filter(row=>row.Service===service&&normalizeShopType(row["Shop Type"])==="Hall"&&inScope(row.Region,group,region));
  const latest=[...new Set(pool.map(row=>row["Report Date"]))].sort().at(-1);
  pool=pool.filter(row=>row["Report Date"]===latest&&row["Shop Name"]);
  const requestBefore=sum(pool,"Request Jul"),requestNow=sum(pool,"Request Aug"),saveNow=sum(pool,"Save Aug"),churnNow=sum(pool,"Churn Aug"),budget=sum(pool,"Budget Churn");
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
  const source=level==="AREA"&&store.live
    ? store.downsell
    : store.downsellDetails.filter(row=>String(row.Level).toUpperCase()===level);
  let pool=source.filter(row=>inScope(row.Region,group,region));
  const latest=[...new Set(pool.map(row=>row["Report Date"]))].sort().at(-1);
  pool=pool.filter(row=>row["Report Date"]===latest);
  const sortRisk=(a,b)=>n(b["RR / Budget"])-n(a["RR / Budget"]);
  if(level==="AREA") pool.sort((a,b)=>sortRisk(a,b)||String(a.Region).localeCompare(String(b.Region)));
  else pool.sort((a,b)=>String(a.Region).localeCompare(String(b.Region))||sortRisk(a,b)||String(a["Shop Name"]).localeCompare(String(b["Shop Name"])));
  return {latest,rows:pool};
}

const budgetStatus=row=>n(row["RR / Budget"])>1?"over":"safe";
function downsellAreaRowHtml(row){
  const state=budgetStatus(row);
  return `<tr><th class="area-name" scope="row">${escapeHtml(row.Region)}</th><td>${fmtFull(row["No Shop"])}</td><td>${fmtFull(row["Budget Downsell"])}</td><td>${fmtFull(row["Downsell Retention"])}</td><td>${fmtFull(row["Downsell Aftersale"])}</td><td>${fmtFull(row["Total Downsell"])}</td><td>${fmtFull(row["RR Downsell"])}</td><td>${fmtPct(row["MTD / Budget"])}</td><td class="over-budget ${state==="over"?"bad":"good"}">${fmtPct(row["RR / Budget"])}</td><td>${fmtFull(row["Over Budget Records"])}</td><td><span class="budget-pill ${state}">${escapeHtml(row.Status||(state==="over"?"Over Budget":"In Budget"))}</span></td></tr>`;
}

function downsellBranchRowHtml(row){
  const state=budgetStatus(row);
  return `<tr><th class="branch-name" scope="row">${escapeHtml(row["Shop Name"])}</th><td class="area-name">${escapeHtml(row.Region)}</td><td>${escapeHtml(row["Shop Type"])}</td><td>${fmtFull(row["Budget Downsell"])}</td><td>${fmtFull(row["Downsell Retention"])}</td><td>${fmtFull(row["Downsell Aftersale"])}</td><td>${fmtFull(row["Total Downsell"])}</td><td>${fmtFull(row["RR Downsell"])}</td><td>${fmtPct(row["MTD / Budget"])}</td><td class="over-budget ${state==="over"?"bad":"good"}">${fmtPct(row["RR / Budget"])}</td><td><span class="budget-pill ${state}">${escapeHtml(row.Status||(state==="over"?"Over Budget":"In Budget"))}</span></td><td>${row["Last Month"]===""?"—":fmtPct(row["Last Month"])}</td></tr>`;
}

function renderDownsellTables(group,region){
  const areas=downsellDetailData("AREA",group,region),branches=downsellDetailData("BRANCH",group,region),scope=scopeLabel(group,region);
  $("downsellAreaScope").textContent=scope;$("downsellBranchScope").textContent=scope;
  $("downsellAreaCount").textContent=`${areas.rows.length} ${areas.rows.length===1?"Area":"Areas"}`;
  $("downsellBranchCount").textContent=`${branches.rows.length} Branches`;
  $("downsellBranchNotice").textContent=store.downsellDetailLive?`ข้อมูล ณ ${fmtDate(branches.latest||areas.latest)} • แสดงชื่อสาขาเท่านั้น • ซ่อนรหัส TDS/WW • Service filter ไม่มีผลกับ Downsell`:`ไม่สามารถโหลด Downsell รายสาขาได้ กรุณาตรวจสิทธิ์ Google Sheet`;
  $("downsellAreaTableBody").innerHTML=areas.rows.length?areas.rows.map(downsellAreaRowHtml).join(""):'<tr><td colspan="11" class="empty-state">ไม่มีข้อมูล Downsell ระดับ Area ตามตัวกรอง</td></tr>';
  $("downsellBranchTableBody").innerHTML=branches.rows.length?branches.rows.map(downsellBranchRowHtml).join(""):'<tr><td colspan="12" class="empty-state">ไม่มีข้อมูล Downsell รายสาขาตามตัวกรอง</td></tr>';
}

const solutionMetricLabels={cases:"Request Sub",churn:"Churn Value",request:"Revenue Request"};
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
  return [...items].filter(item=>!isMissingSolution(item.solution)).sort((a,b)=>solutionMetricValue(b,metric)-solutionMetricValue(a,metric)||b.cases-a.cases||a.solution.localeCompare(b.solution,"th"));
}

function solutionProducts(service){return service==="ALL"?["TMH","TOL"]:[service];}

function populateSolutionBranches(){
  const select=$("solutionBranchFilter"),service=$("serviceFilter").value,group=$("areaGroupFilter").value,region=$("regionFilter").value,current=select.value;
  const branches=[...new Set(solutionScopeRows(service,group,region).map(row=>row["Shop Name"]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"th"));
  select.innerHTML='<option value="ALL">ทุกสาขา</option>'+branches.map(branch=>`<option value="${escapeHtml(branch)}">${escapeHtml(branch)}</option>`).join("");
  select.value=branches.includes(current)?current:"ALL";
}

function solutionComparisonCard(product,rows,metric){
  const items=aggregateSolutions(rows),ranked=rankedSolutions(items,metric).slice(0,10),totalCases=items.reduce((total,item)=>total+item.cases,0),totalRequest=items.reduce((total,item)=>total+item.request,0),totalSave=items.reduce((total,item)=>total+item.save,0);
  const body=ranked.length?ranked.map(item=>`<tr><th scope="row" title="${escapeHtml(item.solution)}">${escapeHtml(item.solution)}</th><td>${fmtFull(item.cases)}</td><td>${fmtFull(item.request)}</td><td>${fmtFull(item.cases?item.request/item.cases:0)}</td><td>${fmtPct(totalRequest?item.request/totalRequest:0)}</td><td>${fmtPct(item.request?item.save/item.request:0)}</td></tr>`).join(""):'<tr><td colspan="6" class="empty-state">ไม่มีข้อมูลในขอบเขตนี้</td></tr>';
  return `<article class="solution-comparison-card ${product.toLowerCase()}"><div class="solution-comparison-head"><h3>${product}</h3><span>Top 10 by ${solutionMetricLabels[metric]}</span></div><div class="table-scroll solution-comparison-scroll"><table class="solution-comparison-table"><thead><tr><th>SOLUTION NAME</th><th>Request Sub</th><th>Rev Request</th><th>ARPU/Sub</th><th>Contribution</th><th>%Save Revenue</th></tr></thead><tbody>${body}</tbody><tfoot><tr><th>ผลรวม</th><td>${fmtFull(totalCases)}</td><td>${fmtFull(totalRequest)}</td><td>${fmtFull(totalCases?totalRequest/totalCases:0)}</td><td>${fmtPct(totalRequest?1:0)}</td><td>${fmtPct(totalRequest?totalSave/totalRequest:0)}</td></tr></tfoot></table></div></article>`;
}

function renderSolutionLeaders(products,group,region,branch,metric){
  $("solutionLeaders").innerHTML=products.map(product=>{
    const rows=solutionScopeRows(product,group,region,branch),items=aggregateSolutions(rows),top=rankedSolutions(items,metric)[0],validCases=items.filter(item=>!isMissingSolution(item.solution)).reduce((total,item)=>total+item.cases,0);
    if(!top)return `<article class="solution-leader-card ${product.toLowerCase()}"><div class="solution-leader-head"><span>${product}</span><small>ไม่มีข้อมูล</small></div></article>`;
    return `<article class="solution-leader-card ${product.toLowerCase()}"><div class="solution-leader-head"><span>${product}</span><small>อันดับ 1 • ${solutionMetricLabels[metric]}</small></div><h3>${escapeHtml(top.solution)}</h3><div class="solution-leader-metrics"><div><small>Request Sub</small><strong>${fmtFull(top.cases)}</strong></div><div><small>สัดส่วนเคส</small><strong>${fmtPct(validCases?top.cases/validCases:0)}</strong></div><div><small>Churn Value</small><strong>${fmtMoney(top.churn)}</strong></div></div></article>`;
  }).join("");
}

function renderSolutionMatrices(products,group,region,metric,branch){
  const areas=(group==="ALL"?Object.values(AREA_GROUPS).flat():AREA_GROUPS[group]||[]).filter(area=>region==="ALL"||area===region);
  $("solutionAreaMatrices").innerHTML=products.map(product=>{
    const body=areas.map(area=>{
      const top=rankedSolutions(aggregateSolutions(solutionScopeRows(product,group,area,branch)),metric).slice(0,10);
      return `<tr data-solution-area="${escapeHtml(area)}"><th scope="row">${escapeHtml(area)}</th>${Array.from({length:10},(_,index)=>{const item=top[index];return item?`<td class="solution-rank-cell ${index===0?"is-first":""}" title="${escapeHtml(item.solution)}"><strong>${escapeHtml(item.solution)}</strong><span>${solutionMetricText(item,metric)}</span></td>`:'<td class="solution-rank-cell">—</td>'}).join("")}</tr>`;
    }).join("")||'<tr><td colspan="11" class="empty-state">ไม่มีข้อมูลในขอบเขตนี้</td></tr>';
    return `<article class="solution-matrix-card ${product.toLowerCase()}"><div class="solution-matrix-head"><h3>${product}</h3><span>${areas.length} Areas • Top 10 by ${solutionMetricLabels[metric]}</span></div><div class="table-scroll solution-matrix-scroll"><table class="solution-matrix"><thead><tr><th>AREA</th>${Array.from({length:10},(_,index)=>`<th>#${index+1}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div></article>`;
  }).join("");
  document.querySelectorAll("[data-solution-area]").forEach(row=>row.addEventListener("click",()=>{$("regionFilter").value=row.dataset.solutionArea;populateSolutionBranches();render();document.querySelector(".solution-branch-card").scrollIntoView({behavior:"smooth",block:"start"});}));
}

function renderSolutionBranches(products,group,region,metric){
  const rows=solutionScopeRows("ALL",group,region),grouped=new Map();
  rows.filter(row=>products.includes(row.Product)&&row["Shop Name"]).forEach(row=>{const key=`${row.Product}|${row.Region}|${row["Shop Name"]}`,items=grouped.get(key)||[];items.push(row);grouped.set(key,items);});
  const branches=[...grouped.values()].map(items=>{const product=items[0].Product,area=items[0].Region,branch=items[0]["Shop Name"],solutions=aggregateSolutions(items),top=rankedSolutions(solutions,metric)[0],totalRequest=solutions.reduce((total,item)=>total+item.request,0);return {product,area,branch,top,totalRequest};}).filter(item=>item.top).sort((a,b)=>a.area.localeCompare(b.area)||a.product.localeCompare(b.product)||solutionMetricValue(b.top,metric)-solutionMetricValue(a.top,metric)||a.branch.localeCompare(b.branch,"th"));
  $("solutionBranchScope").textContent=scopeLabel(group,region);$("solutionBranchCount").textContent=`${branches.length} Branches`;
  $("solutionBranchTableBody").innerHTML=branches.length?branches.map(item=>`<tr data-solution-branch="${escapeHtml(item.branch)}" data-solution-area="${escapeHtml(item.area)}"><td><span class="service-pill ${item.product.toLowerCase()}">${item.product}</span></td><th scope="row">${escapeHtml(item.branch)}</th><td>${escapeHtml(item.area)}</td><td>${escapeHtml(item.top.solution)}</td><td>${fmtFull(item.top.cases)}</td><td>${fmtPct(item.totalRequest?item.top.request/item.totalRequest:0)}</td><td>${fmtFull(item.top.request)}</td><td>${fmtPct(item.top.request?item.top.save/item.top.request:0)}</td></tr>`).join(""):'<tr><td colspan="8" class="empty-state">ไม่มีข้อมูลรายสาขาตามตัวกรอง</td></tr>';
  document.querySelectorAll("[data-solution-branch]").forEach(row=>row.addEventListener("click",()=>{$("regionFilter").value=row.dataset.solutionArea;populateSolutionBranches();$("solutionBranchFilter").value=row.dataset.solutionBranch;renderSolutions();document.querySelector("#solutionPartition section:nth-child(2)").scrollIntoView({behavior:"smooth",block:"start"});}));
}

function renderSolutions(){
  populateSolutionBranches();
  const service=$("serviceFilter").value,products=solutionProducts(service),group=$("areaGroupFilter").value,region=$("regionFilter").value,branch=$("solutionBranchFilter").value,metric=$("solutionMetricFilter").value,{latest}=latestSolutionRows(),scope=[scopeLabel(group,region),branch!=="ALL"?branch:null].filter(Boolean).join(" • ");
  $("solutionDataNotice").textContent=store.solutionLive?`ข้อมูล ณ ${fmtDate(latest)} • Live from Google Sheet`:(store.solutions.length?`ข้อมูล ณ ${fmtDate(latest)} • ใช้ Snapshot สำรอง`:"ไม่สามารถโหลดข้อมูล Solution ได้ กรุณาตรวจสิทธิ์ Google Sheet");
  $("solutionLeaderScope").textContent=scope;$("solutionComparisonScope").textContent=scope;
  renderSolutionLeaders(products,group,region,branch,metric);
  $("solutionComparisonTables").innerHTML=products.map(product=>solutionComparisonCard(product,solutionScopeRows(product,group,region,branch),metric)).join("");
  renderSolutionMatrices(products,group,region,metric,branch);renderSolutionBranches(products,group,region,metric);
}

function render(){
  const service=$("serviceFilter").value,group=$("areaGroupFilter").value,region=$("regionFilter").value,data=latestRows(service,group,region),now=aggregatePerformance(data.now),before=aggregatePerformance(data.before);
  renderPeriodLabels(data.prior,data.latest);
  document.documentElement.dataset.service=service.toLowerCase();
  $("performanceDate").textContent=fmtDate(data.latest);renderKpis(now,before);
  $("serviceCards").innerHTML=service==="ALL"?serviceCard("TMH",group,region)+serviceCard("TOL",group,region):serviceCard(service,group,region);
  $("comparisonGrid").innerHTML=comparisonCard("Request",now.request,before.request)+comparisonCard("Save",now.save,before.save)+comparisonCard("Churn",now.churn,before.churn,true);
  const areaPool=store.performance.filter(row=>row["Report Date"]===data.latest&&row.Region!=="ALL"&&(service==="ALL"||row.Service===service)&&inScope(row.Region,group,region)),areas=groupAreas(areaPool);
  bars("saveRateBars",areas,"saveRate",{max:1,sort:"asc",kind:"teal",noteKey:item=>item.saveRate<.88?"ต่ำกว่าเป้าหมาย 88%":"ผ่านเป้าหมาย 88%"});
  bars("runRateBars",areas,"rrCap",{max:Math.max(1.6,...areas.map(item=>item.rrCap)),sort:"desc",kind:"warn",noteKey:item=>item.rrCap>1?`เกิน Cap ${fmtPct(item.rrCap-1)}`:"อยู่ใน Cap"});
  renderAreaFocusTable(service,group,region);const downsell=renderDownsell(group,region);renderInsights(now,before,areas,downsell);renderHallCards(group,region);renderBranchTable(service,group,region);renderDownsellTables(group,region);renderSolutions();
}

function setPartition(partition){
  document.querySelectorAll(".partition-tab").forEach(button=>{const active=button.dataset.partition===partition;button.classList.toggle("is-active",active);button.setAttribute("aria-selected",String(active));});
  $("overviewPartition").hidden=partition!=="overview";$("branchPartition").hidden=partition!=="branch";$("downsellPartition").hidden=partition!=="downsell";$("solutionPartition").hidden=partition!=="solution";
}

$("serviceFilter").addEventListener("change",render);
$("areaGroupFilter").addEventListener("change",()=>{populateRegions();render();});
$("regionFilter").addEventListener("change",render);
$("shopTypeFilter").addEventListener("change",render);
$("solutionBranchFilter").addEventListener("change",renderSolutions);
$("solutionMetricFilter").addEventListener("change",renderSolutions);
$("refreshButton").addEventListener("click",loadData);
document.querySelectorAll(".partition-tab").forEach(button=>button.addEventListener("click",()=>setPartition(button.dataset.partition)));
$("captureModeButton").addEventListener("click",()=>{const active=document.body.classList.toggle("capture-mode");$("captureModeButton").textContent=active?"✕ ออกจากโหมด Capture":"⛶ โหมด Capture";});
$("sheetLink").href=SHEET_URL;
loadData();

