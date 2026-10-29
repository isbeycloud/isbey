import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = randomBytes(48).toString('hex');
process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'company-admin-password-')), 'database.json');
const { storage } = await import('../db/storage');
const { companiesRouter } = await import('../routes/companies');
const { authRouter, generateToken } = await import('../routes/auth');
const { HizliBilisimMapper } = await import('../services/hizliBilisim/hizliBilisimMapper');
const { productionReadinessErrors } = await import('../config/productionReadiness');
storage.update(db => {
  db.tenants = [{ ...structuredClone(db.tenants[0]), id: 'password-platform', status: 'ACTIVE', isArchived: false }];
  db.users = [{ id: 'password-platform-user', username: 'platform', fullName: 'Platform', email: 'platform@example.test', passwordHash: bcrypt.hashSync(randomBytes(32).toString('hex'), 4), role: 'SUPER_ADMIN', active: true, companyId: 'password-platform', allowedCompanyIds: ['password-platform'], createdAt: new Date().toISOString() }];
  db.tenantUsers = [];
});
const jwt = generateToken(storage.getState().users[0], 'password-platform');
const app = express();app.use(express.json());app.use('/api/companies', companiesRouter);app.use('/api/auth',authRouter);
const server = app.listen(0,'127.0.0.1');await new Promise<void>(resolve => server.once('listening',resolve));
const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
let checks = 0;
async function create(body: unknown, status = 200) {
  const before = fs.readFileSync(process.env.DATABASE_PATH!,'utf8');
  const response = await fetch(base+'/api/companies',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${jwt}`},body:JSON.stringify(body)});
  const result = await response.json();assert.equal(response.status,status,result.message);checks++;
  if(status>=400)assert.equal(fs.readFileSync(process.env.DATABASE_PATH!,'utf8'),before,'Rejected company creation wrote users or financial records');
  return result;
}
try {
  const external = { id:'external-fixture',companyName:'Activation Fixture',taxNumber:'1000000000',contactName:'Fixture Person',email:'activation@example.test',phone:'' } as never;
  const mapped = HizliBilisimMapper.mapToCompanyAdmin(external,'pending-activation','ISB-TEST');
  assert.match(mapped.user.passwordHash,/^\$2[aby]\$10\$[./A-Za-z0-9]{53}$/,'Pending activation account must have a valid bcrypt placeholder');
  for(const candidate of ['', '123', 'password', mapped.token])assert.equal(bcrypt.compareSync(candidate,mapped.user.passwordHash),false,'An activation account accepted a known/default credential');
  const mappedAgain = HizliBilisimMapper.mapToCompanyAdmin(external,'pending-activation','ISB-TEST');assert.notEqual(mappedAgain.user.passwordHash,mapped.user.passwordHash);
  assert(mapped.token.startsWith('act_'));assert(Date.parse(mapped.expiresAt)>Date.now());assert.equal(mapped.user.active,true,'Activation workflow changed');
  storage.update(db => { db.users.push(mapped.user); });
  assert(!productionReadinessErrors().some(error=>error.includes('plaintext or demo passwords')),'Valid activation placeholder must pass the real preflight password check');
  const payload = {name:'Hash Regression Company',taxNumber:'1000000001',createAdminUser:true,adminUsername:'hash-company-admin',email:'company-admin@example.test'};
  for(const adminPassword of [undefined, null, '', '123', 123, {}, ['secret'], 'x'.repeat(73), 'é'.repeat(40), ' '.repeat(12)])await create({...payload,adminPassword},400);
  await create({...payload,createAdminUser:'false',adminPassword:'LongValidPassword-123'},400);
  const secret = '  FirmaGuvenliSifre-123  ';
  const created = await create({...payload,adminPassword:secret});
  const user = storage.getState().users.find(u=>u.username===payload.adminUsername)!;
  assert(user);assert.match(user.passwordHash,/^\$2[aby]\$10\$[./A-Za-z0-9]{53}$/);assert(bcrypt.compareSync(secret,user.passwordHash));assert(!bcrypt.compareSync(secret.trim(),user.passwordHash),'Password was silently trimmed');
  assert(!JSON.stringify(created).includes(secret));assert(!JSON.stringify(created).includes(user.passwordHash));
  assert(!fs.readFileSync(process.env.DATABASE_PATH!,'utf8').includes(secret));
  assert(!productionReadinessErrors().some(error=>error.includes('plaintext or demo passwords')));
  const userCount=storage.getState().users.length;
  await create({name:'No Admin Fixture',taxNumber:'1000000002',createAdminUser:false});assert.equal(storage.getState().users.length,userCount,'Disabled admin creation added a user');
  const login = await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:payload.adminUsername,password:secret})});assert.equal(login.status,200,'New company admin could not log in with the exact password');checks++;
  console.log(`Company admin credentials: ${checks} HTTP checks; explicit bcrypt passwords, no default/empty secret, unguessable activation placeholder and production preflight regression PASS.`);
}finally {server.close();}
