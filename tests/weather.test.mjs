import test from 'node:test';
import assert from 'node:assert/strict';
import {STATION, parseCoverage, summariseHistory} from '../server/weather-core.mjs';
import {createWeatherApi} from '../server/weather-api.mjs';

function payload(times, values, shape = [times.length,1,1]) {
  return {type:'CoverageCollection', coverages:[{type:'Coverage', 'eumetnet:locationId':STATION.id,
    domain:{axes:{t:{values:times}, x:{values:[4.4469]}, y:{values:[51.9606]}}},
    ranges:Object.fromEntries(Object.entries(values).map(([code, values])=>[code,{axisNames:['t','y','x'],shape,values}]))}]};
}
function call(api, url, method = 'GET') {
  return new Promise(resolve => {
    const headers={};
    const res={setHeader(name,value){headers[name]=value;},end(body){resolve({status:res.statusCode,headers,body:body?JSON.parse(body):null});}};
    api({url,method},res);
  });
}
test('CoverageJSON preserves missing values and zero, merges variables by timestamp', () => {
  const p=payload(['2025-12-02T00:00:00Z','2025-12-03T00:00:00Z'],{TG:[null,0],FG:[0,null]});
  p.coverages.push(...payload(['2025-12-02T00:00:00Z'],{TG:[8]}).coverages);
  assert.deepEqual(parseCoverage(p,['TG','FG']).map(row=>[row.TG,row.FG]),[[8,0],[0,null]]);
});
test('multi-station array is rejected instead of flattening incorrect coordinates', () => {
  assert.throws(()=>parseCoverage(payload(['2025-01-01T00:00:00Z'],{TG:[1,2]},[1,2,1]),['TG']),/dimensions/);
});
test('another station cannot enter the selected station summary', () => {
  const p=payload(['2025-01-01T00:00:00Z'],{TG:[4]});p.coverages[0]['eumetnet:locationId']='other';
  assert.equal(parseCoverage(p,['TG']).length,0);
});
test('daily end timestamps fall in the correct preceding month and year', () => {
  const result=summariseHistory([
    {time:'2025-01-01T00:00:00Z',TG:99,FG:99},
    {time:'2025-02-01T00:00:00Z',TG:5,FG:2},
    {time:'2026-01-01T00:00:00Z',TG:6,FG:3},
  ],2025,0);
  assert.equal(result[0].temperature.value,5);assert.equal(result[1].temperature.validDays,0);
  assert.equal(result[11].temperature.value,6);
});
test('December with only three wind days is suppressed; temperature remains complete', () => {
  const rows=Array.from({length:31},(_,i)=>({time:new Date(Date.UTC(2025,11,i+2)).toISOString(),TG:6.54,FG:i<3?4.74:null}));
  const month=summariseHistory(rows,2025)[11];
  assert.equal(month.windSpeed.value,null);assert.equal(month.windSpeed.validDays,3);
  assert.equal(month.temperature.validDays,31);assert.ok(Math.abs(month.temperature.value-6.54)<1e-10);
  const full=summariseHistory(rows.map(row=>({...row,FG:4.74})),2025)[11];
  assert.ok(Math.abs(full.windSpeed.value-4.74)<1e-10);
});
test('coverage rule uses the number of days in the month, including leap February', () => {
  const rows=Array.from({length:23},(_,i)=>({time:new Date(Date.UTC(2024,1,i+2)).toISOString(),TG:1,FG:0}));
  assert.equal(summariseHistory(rows,2024)[1].temperature.expectedDays,29);
  assert.equal(summariseHistory(rows,2024)[1].temperature.value,null);
  rows.push({time:'2024-02-25T00:00:00Z',TG:1,FG:0});
  assert.equal(summariseHistory(rows,2024)[1].windSpeed.value,0);
});
test('missing key returns useful configuration guidance and no upstream request', async () => {
  const api=createWeatherApi({fetchImpl:()=>assert.fail('No upstream call expected')});
  const result=await call(api,'/api/weather/live');assert.equal(result.status,503);
  assert.match(result.body.error,/KNMI_EDR_API_KEY/);
});
test('concurrent live requests share one call; failed refresh labels retained data', async () => {
  let stamp=Date.parse('2026-10-22T13:40:00Z'),calls=0,failed=false;
  const secret='test-private-key';
  const api=createWeatherApi({apiKey:secret,now:()=>stamp,fetchImpl:async(url, options)=>{
    calls++;assert.equal(options.headers.Authorization,secret);assert.equal(url.searchParams.get('parameter-name'),'ta,ff,dd');
    await new Promise(resolve=>setTimeout(resolve,5));
    if(failed) throw new Error('Connection failed');
    return {ok:true,status:200,json:async()=>payload(['2026-10-22T13:30:00Z'],{ta:[15.1],ff:[3.2],dd:[225]})};
  }});
  const results=await Promise.all([call(api,'/api/weather/live'),call(api,'/api/weather/live')]);
  assert.equal(calls,1);assert.equal(results[0].body.rows[0].ta,15.1);
  assert.ok(!JSON.stringify(results).includes(secret));
  stamp+=660_000;failed=true;
  const stale=await call(api,'/api/weather/live');assert.equal(stale.status,200);assert.equal(stale.body.upstreamError,true);
  assert.equal(stale.body.checkedAt,results[0].body.checkedAt);
});
test('history requests correct daily endpoint and full-year interval', async () => {
  const api=createWeatherApi({apiKey:'test',now:()=>Date.parse('2026-10-22T00:00:00Z'),fetchImpl:async(url)=>{
    assert.match(url.pathname,/daily-in-situ-meteorological-observations-validated/);
    assert.equal(url.searchParams.get('datetime'),'2025-01-02T00:00:00Z/2026-01-01T00:00:00Z');
    return {ok:true,status:200,json:async()=>payload(['2026-01-01T00:00:00Z'],{TG:[6],FG:[4]})};
  }});
  const result=await call(api,'/api/weather/history?year=2025');assert.equal(result.status,200);assert.equal(result.body.months[11].windSpeed.validDays,1);
  assert.equal((await call(api,'/api/weather/history?year=2026')).status,400);
  assert.equal((await call(api,'/api/weather/history?year=nope')).status,400);
  assert.equal((await call(api,'/api/weather/live','POST')).status,405);
});
test('authentication errors never echo upstream text or credentials', async () => {
  const api=createWeatherApi({apiKey:'do-not-expose',fetchImpl:async()=>({ok:false,status:403,text:async()=>'do-not-expose'})});
  const result=await call(api,'/api/weather/live');assert.equal(result.status,502);assert.ok(!JSON.stringify(result).includes('do-not-expose'));
});
