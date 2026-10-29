import assert from 'node:assert/strict';
import axios from 'axios';
import { HizliConnectService } from '../services/hizliConnectService';

const originalGet = axios.get;
const originalWarn = console.warn;
const warnings: string[] = [];
let body: unknown;
let failure: unknown;
let requests = 0;
let lastUrl = '';
let lastAuthorization = '';
let checks = 0;
axios.get = (async (url: string, config: { headers?: Record<string,string> }) => {
  requests++; lastUrl = url; lastAuthorization = config.headers?.Authorization || '';
  if (failure) throw failure;
  return {data:body} as never;
}) as typeof axios.get;
console.warn = (...values: unknown[]) => { warnings.push(values.map(String).join(' ')); };
const token = 'isolated-test-token';
async function call(type = 'BIRIM') { checks++; return HizliConnectService.getCodeList(type,token,true); }

try {
  body = {IsSucceeded:true,Codes:[{Code:'NIU',Explanation:'ADET',Percent:0},{Code:'CEN\r\n',Explanation:'YÜZ ADET',Percent:null},{Code:'MWH',Explanation:'MEGAWATT SAAT'},{Code:'MWH',Explanation:'MEGAWATT SAAT (1000 kW.h)'}],Message:null};
  const valid = await call();
  assert.equal(valid.success,true);
  assert.deepEqual(valid.list,[{code:'NIU',name:'ADET',alternativeNames:[],percent:0},{code:'CEN',name:'YÜZ ADET',alternativeNames:[]},{code:'MWH',name:'MEGAWATT SAAT',alternativeNames:['MEGAWATT SAAT (1000 kW.h)']}]);
  assert.equal(new URL(lastUrl).searchParams.get('type'),'BIRIM');
  assert.equal(new URL(lastUrl).searchParams.size,1);
  assert.equal(lastAuthorization,'Bearer '+token);
  assert(!JSON.stringify(valid).includes('BirimId'));
  for(const invalid of [null,[],{IsSucceeded:false,Codes:[{Code:'NIU',Explanation:'ADET'}],Message:'unsafe provider message'},
    {IsSucceeded:true,Prefix:['NIU']},{IsSucceeded:true,Codes:[]},
    {IsSucceeded:true,Codes:[null]},{IsSucceeded:true,Codes:[{Code:'',Explanation:'ADET'}]},
    {IsSucceeded:true,Codes:[{Code:'NIU',Explanation:'  '}]},{IsSucceeded:true,Codes:[{Code:'NIU',Explanation:'ADET',Percent:Infinity}]},
    {IsSucceeded:true,Codes:[{Code:'NIU',Explanation:'ADET',Percent:'0'}]},
    {IsSucceeded:true,Codes:[{Code:'NIU',Explanation:'ADET',code:'KGM'}]},
    {IsSucceeded:true,Codes:[{Code:'NIU',Explanation:'ADET',Name:'KİLOGRAM'}]},
    {IsSucceeded:true,Codes:[{Code:'N\nIU',Explanation:'ADET'}]},
    {IsSucceeded:true,Codes:[{Code:"X' or 1=1",Explanation:'ADET'}]},
    {IsSucceeded:true,Codes:[{Code:'MWH',Explanation:'MEGAWATT SAAT',Percent:0},{Code:'MWH',Explanation:'MEGAWATT SAAT (1000 kW.h)',Percent:1}]}]) {
    body=invalid;const result=await call();assert.equal(result.success,false,JSON.stringify(invalid));assert.deepEqual(result.list,[]);
    assert(!JSON.stringify(result).includes('unsafe provider message'));
  }
  body={IsSucceeded:true,Codes:[{Code:' niu ',Explanation:' ADET '},{Code:'NIU',Explanation:'ADET',Percent:0}]};
  assert.deepEqual((await call(' birim ')).list,[{code:'NIU',name:'ADET',alternativeNames:[],percent:0}]);
  body={IsSucceeded:true,Codes:[{Code:'20.00',Explanation:'YÜZDE YİRMİ',Percent:20}]};
  assert.equal((await call('TEVKIFAT')).success,true,'Generic code types must not use unit-only regex');
  const before = requests;
  for(const type of ['BIRIM&token=leak','BIRIM?x=1','', 'BIRIM\n', 'x'.repeat(100)]) {
    const result=await call(type);assert.equal(result.success,false);
  }
  assert.equal(requests,before,'Invalid type triggered an outbound request');
  failure={message:'private-secret-error',response:{data:{Message:'private-secret-error',token}}};
  const failed=await call();assert.equal(failed.success,false);assert.deepEqual(failed.list,[]);
  assert(!JSON.stringify(failed).includes('private-secret-error'));assert(!JSON.stringify(failed).includes(token));
  assert(!warnings.join(' ').includes('private-secret-error'));assert(!warnings.join(' ').includes(token));
  console.log(`Hızlı code list: ${checks} checks; official Codes shape, unit normalization, duplicate synonyms, percent validation, query safety and clean failures PASS.`);
} finally { axios.get=originalGet;console.warn=originalWarn; }
