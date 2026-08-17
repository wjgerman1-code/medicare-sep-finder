/* sep-core.js — Medicare SEP Finder rule engine and date utilities.
   Pure logic, no DOM: loaded by index.html in the browser and by the node
   test suite (tests/core.test.js). All eligibility rules, CMS source
   metadata, questionnaire definitions, and election-window math live here so
   a CMS guidance update is a data change, not a UI rewrite. */
(function(root,factory){
  if(typeof module!=='undefined'&&module.exports)module.exports=factory();
  else root.SEPCore=factory();
})(typeof self!=='undefined'?self:this,function(){
'use strict';

/* ── date utilities ────────────────────────────────────────────────────────
   All math is done on ISO `YYYY-MM-DD` strings pinned to UTC so results are
   identical in every timezone; only todayISO() reads the local clock. */
const M=['January','February','March','April','May','June','July','August','September','October','November','December'];
const MS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmt=iso=>{if(!iso)return '—';const[y,m,d]=iso.split('-').map(Number);return `${M[m-1]} ${d}, ${y}`};
const short=iso=>{if(!iso)return '—';const[y,m,d]=iso.split('-').map(Number);return `${MS[m-1]} ${d}`};
/* Last day of the month `add` full months after the given date's month.
   Date.UTC month overflow handles year boundaries and leap years. */
const monthEnd=(iso,add)=>{const[y,m]=iso.split('-').map(Number);const d=new Date(Date.UTC(y,m-1+add+1,0));return d.toISOString().slice(0,10)};
const monthStart=(iso,add)=>{const[y,m]=iso.split('-').map(Number);const d=new Date(Date.UTC(y,m-1+add,1));return d.toISOString().slice(0,10)};
const days=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/864e5);
const iso=v=>v?String(v).slice(0,10):null;
const todayISO=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};

/* ── CMS / data source registry ──────────────────────────────────────────── */
const SOURCES={
  cmsGuidance:{id:'cmsGuidance',kind:'guidance',
    name:'Medicare Advantage & Part D Enrollment and Disenrollment Guidance (Ch. 2)',
    url:'https://www.cms.gov/medicare/enrollment-renewal/health-plans/managed-care-eligibility-enrollment',
    version:'Ch. 2 guidance, rev. 2025-08',published:'2025-08',
    lastChecked:'2026-08-12',lastVerified:'2026-08-12'},
  fema:{id:'fema',kind:'live',
    name:'FEMA OpenFEMA — Disaster Declarations Summaries v2',
    url:'https://www.fema.gov/about/openfema/data-sets',
    api:'https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries',
    version:'v2',lastChecked:'live at search time',lastVerified:'live at search time'},
  census:{id:'census',kind:'live',
    name:'FCC Census Area API — 2020 county boundaries',
    url:'https://geo.fcc.gov/api/census/',
    api:'https://geo.fcc.gov/api/census/area',
    version:'2020 vintage',lastChecked:'live at search time',lastVerified:'live at search time'},
  zippo:{id:'zippo',kind:'live',
    name:'Zippopotam — USPS ZIP directory',
    url:'https://api.zippopotam.us',
    api:'https://api.zippopotam.us/us/',
    version:'USPS ZIP file',lastChecked:'live at search time',lastVerified:'live at search time'}
};
const CMS_REF='§30.6.13 — SEP for Government Entity-Declared Disaster or Other Emergency';
const CMS_URL=SOURCES.cmsGuidance.url;
const CMS_VERSION=SOURCES.cmsGuidance.version;
const PLANS='MA • MA-PD • PDP • Cost • SNP';
const RULES_VERIFIED=SOURCES.cmsGuidance.lastVerified;

/* ── ZIP3 → state, complete for all 50 states + DC (USPS allocations) ───── */
const ZIP3=[['AL',350,352],['AL',354,369],['AK',995,999],['AZ',850,850],['AZ',852,853],['AZ',855,857],['AZ',859,860],['AZ',863,865],['AR',716,729],['CA',900,908],['CA',910,928],['CA',930,961],['CO',800,816],['CT',60,69],['DE',197,199],['DC',200,205],['DC',569,569],['FL',320,339],['FL',341,342],['FL',344,344],['FL',346,347],['FL',349,349],['GA',300,319],['GA',398,399],['HI',967,968],['ID',832,838],['IL',600,629],['IN',460,479],['IA',500,528],['KS',660,679],['KY',400,427],['LA',700,701],['LA',703,708],['LA',710,714],['ME',39,49],['MD',206,219],['MA',10,27],['MA',55,55],['MI',480,499],['MN',550,567],['MS',386,397],['MO',630,658],['MT',590,599],['NE',680,693],['NV',889,898],['NH',30,38],['NJ',70,89],['NM',870,884],['NY',5,5],['NY',100,149],['NC',270,289],['ND',580,588],['OH',430,459],['OK',730,731],['OK',734,749],['OR',970,979],['PA',150,196],['RI',28,29],['SC',290,299],['SD',570,577],['TN',370,385],['TX',733,733],['TX',750,799],['TX',885,885],['UT',840,847],['VT',50,54],['VT',56,59],['VA',201,201],['VA',220,246],['WA',980,994],['WV',247,268],['WI',530,549],['WY',820,831]];
const stateFromZip=z=>{if(!/^\d{5}$/.test(z))return null;const p=Number(z.slice(0,3));const hit=ZIP3.find(r=>p>=r[1]&&p<=r[2]);return hit?hit[0]:null};
const normCounty=s=>String(s||'').toLowerCase().replace(/\s+(county|parish|borough|municipality|census area|municipio)$/,'').trim();

/* ── disaster event model ────────────────────────────────────────────────── */
const EMPTY_EVENT={name:'',declared:'',start:'',end:null,geo:'',ref:CMS_REF,refShort:'§30.6.13',plans:PLANS,source:'',url:CMS_URL,version:CMS_VERSION,verified:''};
const DEMO_EVENT={
  name:'Severe Storms, Straight-line Winds and Flooding — DR-4839-TX',
  declared:'2026-07-02',start:'2026-06-28',end:'2026-07-19',
  geo:'Travis County, TX — Individual Assistance designated',
  ref:CMS_REF,refShort:'§30.6.13',plans:PLANS,
  source:'Medicare Advantage & Part D Enrollment and Disenrollment Guidance',
  url:CMS_URL,version:CMS_VERSION,verified:'2026-08-12'
};

/* Window: incident start → last day of the second full calendar month after
   the incident end (per stored §30.6.13 rule). No end date → open. */
const winEnd=e=>(e&&e.end?monthEnd(e.end,2):null);
const winLabel=e=>!e||!e.start?'—':`${fmt(e.start)} – ${e.end?fmt(winEnd(e)):'open (incident period ongoing)'}`;

/* FEMA OpenFEMA rows → usable event list: dedupe by disaster number, drop
   events whose window closed before the search date, flag never-closed
   incident periods older than six months as needing verification. */
function buildEvents(rows,searchDate){
  const seen=new Set(),events=[];
  (rows||[]).forEach(r=>{
    if(seen.has(r.disasterNumber))return;seen.add(r.disasterNumber);
    const e={name:`${r.declarationTitle} — ${r.femaDeclarationString||('DR-'+r.disasterNumber)}`,
      declared:iso(r.declarationDate),start:iso(r.incidentBeginDate),end:iso(r.incidentEndDate),
      geo:`${r.designatedArea}, ${r.state}${r.ihProgramDeclared?' — Individual Assistance designated':' — Public Assistance designated'}`,
      type:r.incidentType,number:r.disasterNumber,declarer:'FEMA — federal declaration',
      ref:CMS_REF,refShort:'§30.6.13',plans:PLANS,
      source:'Medicare Advantage & Part D Enrollment and Disenrollment Guidance · FEMA OpenFEMA v2',
      url:CMS_URL,version:CMS_VERSION,verified:todayISO()};
    e.openPeriod=!e.end;
    e.stale=!e.end&&e.start<monthStart(searchDate,-6);
    if(e.end&&winEnd(e)<searchDate)return;
    events.push(e);
  });
  events.sort((a,b)=>(a.stale?1:0)-(b.stale?1:0)||(b.start||'').localeCompare(a.start||''));
  return events;
}

/* ── disaster qualification questionnaire + evaluation ───────────────────── */
const DQ=[
 {id:'reside',title:'Did the client — or the person who makes their health decisions — live in the declared area during the incident period?',help:'geo+period',opts:[{label:'Yes',sub:'Resided in or received care in the county'},{label:'No',sub:'Neither client nor authorized representative'}]},
 {id:'other',title:'Did the client have another valid election period open during the incident period?',help:'period',opts:[{label:'Yes',sub:'Another election period was open'},{label:'No',sub:''},{label:'Not sure',sub:'Flag for verification'}]},
 {id:'missed',title:'Did the client fail to make that election because of the disaster?',help:'CMS requires that the client did not make an election they otherwise would have made.',opts:[{label:'Yes',sub:''},{label:'No',sub:'They already made their election'},{label:'Not sure',sub:'Flag for verification'}]},
 {id:'used',title:'Has the client already used this disaster SEP for this incident?',help:'The SEP may be used once per declared incident period.',opts:[{label:'No',sub:''},{label:'Yes',sub:''}]}
];

/* Distinguish "does not qualify" from "cannot tell yet": an explicit
   disqualifying answer wins; otherwise any "Not sure" means the SEP needs
   verification, not that it is unavailable. */
function evaluateDQ(d){
  d=d||{};
  const fails=[];
  if(d.reside==='No')fails.push('the client (and their decision-maker) did not reside in the affected area');
  if(d.other==='No')fails.push('no other election period was open during the incident');
  if(d.missed==='No')fails.push('the client already made their election');
  if(d.used==='Yes')fails.push('this disaster SEP was already used for this incident');
  if(fails.length)return{status:'disqualified',reasons:fails};
  if(!['reside','other','missed','used'].every(k=>d[k]!==undefined))return{status:'incomplete'};
  const unsure=[];
  if(d.other==='Not sure')unsure.push('whether another election period was open during the incident');
  if(d.missed==='Not sure')unsure.push('whether the missed election was caused by the disaster');
  if(unsure.length)return{status:'verify',unsure};
  return{status:'qualified'};
}

/* ── client SEP screening questionnaire (conditional) ────────────────────── */
function oqList(a){a=a||{};const L=[{id:'moved',type:'choice',title:'Has the client permanently moved recently?',help:'A permanent change of residence may open an SEP under §30.6.20.',opts:[{label:'Yes',sub:'New permanent address'},{label:'No',sub:'Skip residence questions'}]}];
  if(a.moved==='Yes'){L.push(
    {id:'moveDate',type:'date',title:'When did the client move?',help:'The date they began living at the new address.',label:'Date of move'},
    {id:'prevZip',type:'zip',title:'Previous ZIP code',help:'Used to compare plan service areas.',label:'Previous ZIP',ph:'00000'},
    {id:'newZip',type:'zip',title:'New ZIP code',help:'Used to compare plan service areas.',label:'New ZIP',ph:'00000'},
    {id:'hadCoverage',type:'choice',title:'Did the client have Medicare Advantage or Part D coverage before the move?',opts:[{label:'Yes — MA or MA-PD',sub:''},{label:'Yes — PDP only',sub:''},{label:'No — Original Medicare only',sub:''}]},
    {id:'notified',type:'choice',title:'Did the client tell the plan about the move before it happened?',help:'Advance notice changes when the election window opens.',opts:[{label:'Yes, before moving',sub:''},{label:'No, telling them now',sub:''}]});}
  L.push({id:'lis',type:'choice',title:'Has the client’s Medicaid or Extra Help (LIS) status changed in the last 3 months?',opts:[{label:'Gained Medicaid or LIS',sub:''},{label:'Lost Medicaid or LIS',sub:''},{label:'No change',sub:''},{label:'Not sure',sub:'Flag for verification'}]});
  if(a.lis&&a.lis!=='No change')L.push({id:'lisDate',type:'date',title:'When did the Medicaid or Extra Help change take effect?',help:'Or the date the client was notified, if later.',label:'Change date'});
  L.push(
    {id:'institution',type:'choice',title:'Is the client moving into, living in, or leaving a nursing home or other institution?',opts:[{label:'Yes',sub:''},{label:'No',sub:''}]},
    {id:'employer',type:'choice',title:'Is the client gaining, leaving, or losing employer or union group coverage?',opts:[{label:'Yes',sub:''},{label:'No',sub:''}]},
    {id:'creditable',type:'choice',title:'Has the client involuntarily lost creditable prescription drug coverage?',help:'Includes cases where the client did not receive adequate notice of the loss.',opts:[{label:'Yes',sub:''},{label:'No',sub:''}]},
    {id:'planAction',type:'choice',title:'Did the client’s plan terminate, non-renew, or face a CMS sanction?',opts:[{label:'Yes',sub:''},{label:'No',sub:''},{label:'Not sure',sub:'Flag for verification'}]},
    {id:'newly',type:'choice',title:'Is the client newly eligible for Medicare, or turning 65 within the next 3 months?',opts:[{label:'Yes',sub:''},{label:'No',sub:''}]},
    {id:'fiveStar',type:'choice',title:'Does the client want to move to a 5-star plan available in their area?',help:'Confirm that a 5-star contract is offered in the client’s county for the applicable plan year.',opts:[{label:'Yes',sub:''},{label:'No',sub:''}]});
  return L}

/* Move SEP window. Returns null when the move date is unknown — the caller
   must treat that as "more information needed", never fabricate a date. */
function moveWindow(a,searchDate){
  const md=a.moveDate;if(!md)return null;
  const advance=a.notified==='Yes, before moving';
  return{start:advance?monthStart(md,-1):monthStart(searchDate,0),
    end:monthEnd(advance?md:searchDate,2),md};
}

/* ── SEP rule registry ─────────────────────────────────────────────────────
   Each rule: identity + CMS metadata + an evaluate(answers, ctx) returning
   {status:'available'|'maybe'|'no'|'unscreened', window?, needs?, reason?}.
   `code:null` means no CMS election/reason code has been verified for this
   build — the UI must render "Reason code requires verification". */
const VERIFY_SECTION='Ch. 2 guidance — section requires verification';
const RULES=[
 {id:'disaster',name:'Disaster / Emergency SEP',ref:'§30.6.13',refLong:CMS_REF,code:null,
  plans:PLANS,geographic:true,source:'cmsGuidance',status:'active',
  plain:'For clients who missed another election because a declared disaster or emergency was in effect where they — or their decision-maker — lived.',
  effective:'First of the month after the plan receives the election — confirm with the receiving plan.',
  evaluate:null /* geographic rule — handled by computeResults with the event + DQ answers */},
 {id:'move',name:'SEP — Permanent Change of Residence',ref:'§30.6.20',code:null,
  plans:'MA • MA-PD • PDP',source:'cmsGuidance',status:'active',trigger:'moved',
  plain:'For clients who permanently moved out of their plan’s service area, or to an area with new plan options.',
  effective:'First of the month after the election, or up to three months later at the client’s choice.',
  evaluate(a,ctx){
    if(a.moved===undefined)return{status:'unscreened'};
    if(a.moved==='No')return{status:'no',reason:'No permanent move reported'};
    const w=moveWindow(a,ctx.searchDate);
    if(!w)return{status:'maybe',needs:'The date of the permanent move is required to calculate the election window. Ask the client for the move date, then re-screen.'};
    return{status:'available',window:`${fmt(w.start)} – ${fmt(w.end)}`};
  }},
 {id:'lis',name:'SEP — Change in Medicaid / LIS Status',ref:'§30.6.8',code:null,
  plans:PLANS,source:'cmsGuidance',status:'active',trigger:'lis',
  plain:'For clients who gained or lost Medicaid or Extra Help (LIS) within the last three months.',
  evaluate(a){
    if(a.lis===undefined)return{status:'unscreened'};
    if(a.lis==='No change')return{status:'no',reason:'No status change in the last 3 months'};
    if(a.lis==='Not sure')return{status:'maybe',needs:'Client’s Medicaid/LIS status is unconfirmed. Verify with the state Medicaid agency or plan before relying on this SEP.'};
    return{status:'maybe',needs:'Confirm the exact change effective date and whether the client has already used a dual/LIS election this quarter. Integrated-care rules may apply.'};
  }},
 {id:'institution',name:'SEP — Institutional Status Change',ref:VERIFY_SECTION,code:null,
  plans:PLANS,source:'cmsGuidance',status:'active',trigger:'institution',
  plain:'For clients moving into, living in, or leaving a nursing home or other qualifying institution.',
  evaluate(a){
    if(a.institution===undefined)return{status:'unscreened'};
    if(a.institution==='No')return{status:'no',reason:'Client is not moving into or out of an institution'};
    return{status:'maybe',needs:'Confirm the facility qualifies as an institution under CMS rules and the admission or discharge dates — the election window runs through the stay and for two months after discharge.'};
  }},
 {id:'employer',name:'SEP — Employer / Union Group Coverage',ref:VERIFY_SECTION,code:null,
  plans:PLANS,source:'cmsGuidance',status:'active',trigger:'employer',
  plain:'For clients gaining, dropping, or losing employer or union group health coverage.',
  evaluate(a){
    if(a.employer===undefined)return{status:'unscreened'};
    if(a.employer==='No')return{status:'no',reason:'No group coverage change reported'};
    return{status:'maybe',needs:'Confirm whether coverage is being gained, dropped, or lost and the exact date of the change — the election window is tied to that date. Document the employer/union plan details.'};
  }},
 {id:'creditable',name:'SEP — Loss of Creditable Drug Coverage',ref:VERIFY_SECTION,code:null,
  plans:'MA-PD • PDP',source:'cmsGuidance',status:'active',trigger:'creditable',
  plain:'For clients who involuntarily lost drug coverage that was at least as good as Medicare’s.',
  evaluate(a){
    if(a.creditable===undefined)return{status:'unscreened'};
    if(a.creditable==='No')return{status:'no',reason:'No involuntary loss reported'};
    return{status:'maybe',needs:'Confirm the loss was involuntary and when notice was received — the window is calculated from the loss of coverage or the notice date, whichever is later.'};
  }},
 {id:'plan',name:'SEP — Plan Termination or Non-renewal',ref:'§30.6.5',code:null,
  plans:PLANS,source:'cmsGuidance',status:'active',trigger:'planAction',
  plain:'For clients whose plan is terminating, non-renewing, leaving the service area, or under CMS sanction.',
  evaluate(a){
    if(a.planAction===undefined)return{status:'unscreened'};
    if(a.planAction==='No')return{status:'no',reason:'No plan termination, non-renewal, or sanction reported'};
    if(a.planAction==='Not sure')return{status:'maybe',needs:'Confirm against the current CMS contract and service-area dataset whether the client’s contract is terminating or non-renewing for the coming year.'};
    return{status:'maybe',needs:'Confirm the contract action and its effective date with the plan or CMS — the election window depends on the type of termination and when notice was issued.'};
  }},
 {id:'newly',name:'ICEP / Part D IEP — Newly Medicare Eligible',ref:VERIFY_SECTION,code:null,
  plans:PLANS,source:'cmsGuidance',status:'active',trigger:'newly',
  plain:'For clients new to Medicare — the initial enrollment windows around their entitlement date.',
  evaluate(a){
    if(a.newly===undefined)return{status:'unscreened'};
    if(a.newly==='No')return{status:'no',reason:'Client is not newly eligible'};
    return{status:'maybe',needs:'Confirm the client’s Part A / Part B entitlement dates — ICEP and IEP windows are calculated from entitlement, not from today’s date.'};
  }},
 {id:'star',name:'SEP — 5-Star Plan',ref:'§30.6.16',code:null,
  plans:'MA • MA-PD • PDP',source:'cmsGuidance',status:'active',trigger:'fiveStar',
  plain:'A once-per-year move into a plan holding a 5-star overall rating in the client’s area.',
  evaluate(a){
    if(a.fiveStar===undefined)return{status:'unscreened'};
    if(a.fiveStar==='No')return{status:'no',reason:'Agent indicated no interest this year'};
    return{status:'maybe',needs:'Confirm the target contract holds a 5-star overall rating for the applicable year and that the client has not already used this SEP in the current year.'};
  }}
];
const RULE=id=>RULES.find(r=>r.id===id);
const SCREEN_RULES=RULES.filter(r=>r.trigger);

/* ── deterministic result assembly ────────────────────────────────────────
   Never fabricates: unanswered questions surface as `unscreened`, unknown
   facts land in `maybe`, and only explicit answers place a rule in `no`. */
function computeResults({event,hasEvent,dqA,oqA,searchDate}){
  const a=oqA||{},avail=[],maybe=[],no=[],unscreened=[];
  const E=event||EMPTY_EVENT;
  const meta=r=>({ref:r.ref,version:CMS_VERSION,verified:fmt(RULES_VERIFIED),plain:r.plain,effective:r.effective||''});
  const dq=evaluateDQ(dqA);
  if(hasEvent){
    const dr=RULE('disaster');
    if(dq.status==='qualified'&&!E.stale)avail.push({id:'disaster',kicker:'Primary SEP option',name:dr.name,
      window:winLabel(E),...meta(dr),verified:fmt(E.verified)});
    else if(dq.status==='qualified'&&E.stale)maybe.push({id:'disaster',name:dr.name,
      needs:`${E.name} has no published incident end date and began ${fmt(E.start)}. Confirm the current incident period with the declaring authority before relying on this SEP — the election window cannot be calculated without it.`,
      ref:dr.ref,version:CMS_VERSION});
    else if(dq.status==='verify')maybe.push({id:'disaster',name:dr.name,
      needs:`Flagged for verification: ${dq.unsure.join('; ')}. Confirm these with the client or the plan before relying on this SEP.`,
      ref:dr.ref,version:CMS_VERSION});
    else if(dq.status==='disqualified')no.push({name:dr.name,reason:`Requirement not met — ${dq.reasons[0]}`});
    else unscreened.push(dr.name);
  }else no.push({name:'Disaster / Emergency SEP',reason:'No qualifying declaration for this geography'});
  SCREEN_RULES.forEach(r=>{
    const res=r.evaluate(a,{searchDate});
    if(res.status==='unscreened')unscreened.push(r.name);
    else if(res.status==='no')no.push({name:r.name,reason:res.reason});
    else if(res.status==='maybe')maybe.push({id:r.id,name:r.name,needs:res.needs,ref:r.ref,version:CMS_VERSION});
    else avail.push({id:r.id,kicker:'Client-specific',name:r.name,window:res.window,...meta(r)});
  });
  return{avail,maybe,no,unscreened,dqStatus:dq.status,dq};
}

return{M,MS,fmt,short,monthEnd,monthStart,days,iso,todayISO,
  SOURCES,CMS_REF,CMS_URL,CMS_VERSION,PLANS,RULES_VERIFIED,
  ZIP3,stateFromZip,normCounty,
  EMPTY_EVENT,DEMO_EVENT,winEnd,winLabel,buildEvents,
  DQ,evaluateDQ,oqList,moveWindow,RULES,RULE,SCREEN_RULES,computeResults};
});
