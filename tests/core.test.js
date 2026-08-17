'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../sep-core.js');

/* ── date utilities ─────────────────────────────────────────────────────── */
test('monthEnd: end of month, two months out',()=>{
  assert.equal(C.monthEnd('2026-07-19',2),'2026-09-30');
});
test('monthEnd: year boundary',()=>{
  assert.equal(C.monthEnd('2026-11-15',2),'2027-01-31');
});
test('monthEnd: leap year February',()=>{
  assert.equal(C.monthEnd('2023-12-05',2),'2024-02-29');
  assert.equal(C.monthEnd('2024-12-05',2),'2025-02-28');
});
test('monthEnd: 31st-day month boundary does not skip a month',()=>{
  assert.equal(C.monthEnd('2026-01-31',1),'2026-02-28');
});
test('monthStart: backwards across a year boundary',()=>{
  assert.equal(C.monthStart('2026-01-15',-1),'2025-12-01');
});
test('days: simple difference and same-day',()=>{
  assert.equal(C.days('2026-08-14','2026-08-15'),1);
  assert.equal(C.days('2026-08-14','2026-08-14'),0);
});
test('winEnd: last day of second full month after incident end',()=>{
  assert.equal(C.winEnd({end:'2026-07-19'}),'2026-09-30');
  assert.equal(C.winEnd({end:null}),null);
});
test('stateFromZip: valid and invalid ZIPs',()=>{
  assert.equal(C.stateFromZip('78701'),'TX');
  assert.equal(C.stateFromZip('99501'),'AK');
  assert.equal(C.stateFromZip('00001'),null);
  assert.equal(C.stateFromZip('123'),null);
});

/* ── FEMA event handling ────────────────────────────────────────────────── */
const row=(n,over)=>({disasterNumber:n,declarationTitle:'TEST EVENT',femaDeclarationString:`DR-${n}-TX`,
  declarationDate:'2026-07-02T00:00:00.000Z',incidentBeginDate:'2026-06-28T00:00:00.000Z',
  incidentEndDate:'2026-07-19T00:00:00.000Z',designatedArea:'Travis (County)',state:'TX',
  ihProgramDeclared:true,incidentType:'Severe Storm',...over});

test('buildEvents: expired event (window closed before search date) is excluded',()=>{
  const ev=C.buildEvents([row(1,{incidentEndDate:'2025-07-18T00:00:00.000Z',incidentBeginDate:'2025-07-02T00:00:00.000Z'})],'2026-08-14');
  assert.equal(ev.length,0);
});
test('buildEvents: window closing exactly on the search date is still included',()=>{
  const ev=C.buildEvents([row(1,{incidentEndDate:'2026-06-15T00:00:00.000Z'})],'2026-08-31');
  assert.equal(ev.length,1);
});
test('buildEvents: active event is included with correct fields',()=>{
  const ev=C.buildEvents([row(2)],'2026-08-14');
  assert.equal(ev.length,1);
  assert.equal(ev[0].start,'2026-06-28');
  assert.equal(ev[0].end,'2026-07-19');
  assert.equal(ev[0].stale,false);
  assert.match(ev[0].geo,/Individual Assistance/);
});
test('buildEvents: unknown end date + old start is flagged stale, not dropped',()=>{
  const ev=C.buildEvents([row(3,{incidentEndDate:null,incidentBeginDate:'2025-09-01T00:00:00.000Z'})],'2026-08-14');
  assert.equal(ev.length,1);
  assert.equal(ev[0].stale,true);
  assert.equal(ev[0].openPeriod,true);
});
test('buildEvents: recent open incident period is usable (not stale)',()=>{
  const ev=C.buildEvents([row(4,{incidentEndDate:null,incidentBeginDate:'2026-07-01T00:00:00.000Z'})],'2026-08-14');
  assert.equal(ev[0].stale,false);
});
test('buildEvents: duplicate disaster numbers are deduped, fresh sorts first',()=>{
  const ev=C.buildEvents([
    row(5,{incidentEndDate:null,incidentBeginDate:'2025-09-01T00:00:00.000Z'}),
    row(5),row(6)],'2026-08-14');
  assert.equal(ev.length,2);
  assert.equal(ev[0].stale,false);
});

/* ── disaster qualification ─────────────────────────────────────────────── */
test('evaluateDQ: fully qualifying answers',()=>{
  assert.equal(C.evaluateDQ({reside:'Yes',other:'Yes',missed:'Yes',used:'No'}).status,'qualified');
});
test('evaluateDQ: any explicit disqualifier wins',()=>{
  assert.equal(C.evaluateDQ({reside:'No',other:'Yes',missed:'Yes',used:'No'}).status,'disqualified');
  assert.equal(C.evaluateDQ({reside:'Yes',other:'Yes',missed:'Yes',used:'Yes'}).status,'disqualified');
});
test('evaluateDQ: "Not sure" means verification needed, not disqualified',()=>{
  const r=C.evaluateDQ({reside:'Yes',other:'Not sure',missed:'Yes',used:'No'});
  assert.equal(r.status,'verify');
  assert.equal(r.unsure.length,1);
});
test('evaluateDQ: unanswered questionnaire is incomplete',()=>{
  assert.equal(C.evaluateDQ({}).status,'incomplete');
  assert.equal(C.evaluateDQ({reside:'Yes'}).status,'incomplete');
});

/* ── rule engine / results ──────────────────────────────────────────────── */
const EVT={...C.DEMO_EVENT,stale:false,openPeriod:false};
const run=(over={})=>C.computeResults({event:over.event!==undefined?over.event:EVT,
  hasEvent:over.event!==undefined?!!over.event:true,
  dqA:over.dqA||{},oqA:over.oqA||{},searchDate:over.searchDate||'2026-08-14'});

test('results: qualified disaster with fresh event is the primary available option',()=>{
  const r=run({dqA:{reside:'Yes',other:'Yes',missed:'Yes',used:'No'}});
  assert.equal(r.avail[0].id,'disaster');
  assert.match(r.avail[0].window,/June 28, 2026 – September 30, 2026/);
  assert.ok(r.avail[0].effective.length>0);
});
test('results: qualified but stale event needs verification, never available',()=>{
  const r=run({event:{...EVT,end:null,stale:true},dqA:{reside:'Yes',other:'Yes',missed:'Yes',used:'No'}});
  assert.equal(r.avail.length,0);
  assert.equal(r.maybe[0].id,'disaster');
});
test('results: "Not sure" disaster answers land in maybe, not in not-available',()=>{
  const r=run({dqA:{reside:'Yes',other:'Not sure',missed:'Yes',used:'No'}});
  assert.equal(r.maybe[0].id,'disaster');
  assert.ok(!r.no.find(x=>x.name==='Disaster / Emergency SEP'));
});
test('results: disqualified disaster is not-available with a specific reason',()=>{
  const r=run({dqA:{reside:'No',other:'Yes',missed:'Yes',used:'No'}});
  assert.match(r.no.find(x=>x.name==='Disaster / Emergency SEP').reason,/did not reside/);
});
test('results: no event → disaster not available for geography reason',()=>{
  const r=run({event:null});
  assert.match(r.no.find(x=>x.name==='Disaster / Emergency SEP').reason,/No qualifying declaration/);
});
test('results: move with date and advance notice gets a calculated window',()=>{
  const r=run({event:null,oqA:{moved:'Yes',moveDate:'2026-07-10',notified:'Yes, before moving'}});
  const mv=r.avail.find(x=>x.id==='move');
  assert.equal(mv.window,'June 1, 2026 – September 30, 2026');
});
test('results: move with date, notice after the fact, anchors on the search date',()=>{
  const r=run({event:null,oqA:{moved:'Yes',moveDate:'2026-07-10',notified:'No, telling them now'},searchDate:'2026-08-14'});
  const mv=r.avail.find(x=>x.id==='move');
  assert.equal(mv.window,'August 1, 2026 – October 31, 2026');
});
test('results: move WITHOUT a move date is never available with a fabricated window',()=>{
  const r=run({event:null,oqA:{moved:'Yes'}});
  assert.ok(!r.avail.find(x=>x.id==='move'));
  assert.match(r.maybe.find(x=>x.id==='move').needs,/move date/i);
});
test('results: every screening "Yes" surfaces the SEP (no silent drops)',()=>{
  const r=run({event:null,oqA:{moved:'No',lis:'Gained Medicaid or LIS',institution:'Yes',employer:'Yes',creditable:'Yes',planAction:'Yes',newly:'Yes',fiveStar:'Yes'}});
  for(const id of['lis','institution','employer','creditable','plan','newly','star'])
    assert.ok(r.maybe.find(x=>x.id===id),`missing maybe entry for ${id}`);
  assert.equal(r.unscreened.length,0);
});
test('results: all-No answers produce a clean not-available list, nothing fabricated',()=>{
  const r=run({event:null,oqA:{moved:'No',lis:'No change',institution:'No',employer:'No',creditable:'No',planAction:'No',newly:'No',fiveStar:'No'}});
  assert.equal(r.avail.length,0);assert.equal(r.maybe.length,0);
  assert.ok(!r.no.find(x=>/Contract Violation|Poor Performance/.test(x.name)));
});
test('results: untouched questionnaire reports every rule as unscreened',()=>{
  const r=run({event:null,oqA:{}});
  assert.equal(r.unscreened.length,C.SCREEN_RULES.length);
});
test('rules: no rule carries an invented CMS election/reason code',()=>{
  for(const r of C.RULES)assert.equal(r.code,null);
});
