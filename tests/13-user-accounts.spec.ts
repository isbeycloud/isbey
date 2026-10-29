import {test,expect} from './fixtures/adminSession';

test('account manager saves contact details, preserves failed form and shows true mail readiness',async({page,request,adminSession})=>{
 const headers={Authorization:`Bearer ${adminSession.token}`};const beforeRes=await request.get('/api/user-accounts/me',{headers});expect(beforeRes.status()).toBe(200);const before=await beforeRes.json();
 await page.addInitScript(token=>localStorage.setItem('isbey_token',token),adminSession.token);await page.goto('/');
 await page.locator('aside').getByRole('button',{name:'Kullanıcı Hesapları',exact:true}).click();
 const panel=page.getByTestId('user-accounts-panel');await panel.getByRole('row').filter({hasText:'@'+before.user.username}).getByRole('button',{name:'Hesabı Aç',exact:true}).click();
 await panel.getByLabel('Telefon',{exact:true}).fill('5554443322');await panel.getByLabel('İşlem için kendi mevcut şifreniz',{exact:true}).fill('admin123');
 await page.route('**/api/user-accounts/*/profile',route=>route.fulfill({status:503,json:{success:false,message:'Geçici hesap kayıt hatası'}}),{times:1});
 await panel.getByRole('button',{name:'Bilgileri Kaydet',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('Geçici hesap kayıt hatası');await expect(panel.getByLabel('Telefon',{exact:true})).toHaveValue('5554443322');
 await panel.getByRole('button',{name:'Bilgileri Kaydet',exact:true}).click();await expect(panel.getByRole('status')).toContainText('İletişim bilgileri kaydedildi');
 await panel.getByRole('button',{name:'Şifre E-postası',exact:true}).click();await expect(panel.getByRole('button',{name:'Şifre Bağlantısını E-postala',exact:true})).toBeDisabled();await expect(panel).toContainText('E-posta sunucusu yapılandırılmamış');
 await page.reload();await page.locator('aside').getByRole('button',{name:'Kullanıcı Hesapları',exact:true}).click();await page.getByRole('row').filter({hasText:'@'+before.user.username}).getByRole('button',{name:'Hesabı Aç',exact:true}).click();await expect(page.getByLabel('Telefon',{exact:true})).toHaveValue('5554443322');
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Kullanıcı menüsü',exact:true}).click();await page.getByRole('button',{name:'Hesabım ve Şifrem',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Kullanıcı Hesabı',exact:true});await expect(dialog.getByLabel('Telefon',{exact:true})).toHaveValue('5554443322');const save=dialog.getByRole('button',{name:'Bilgileri Kaydet',exact:true});await save.scrollIntoViewIfNeeded();
 expect(await save.evaluate(el=>{const b=el.getBoundingClientRect();return [b.left+5,b.left+b.width/2,b.right-5].every(x=>el.contains(document.elementFromPoint(x,b.top+b.height/2)));})).toBe(true);
 await page.screenshot({path:'.verify-tmp/user-account-mobile.png',fullPage:true});await dialog.getByRole('button',{name:'Geri',exact:true}).click();
 const fresh=await (await request.get('/api/user-accounts/me',{headers})).json();const restore=await request.put(`/api/user-accounts/${before.user.id}/profile`,{headers,data:{fullName:before.user.fullName,email:before.user.email,phone:before.user.phone,department:before.user.department,branch:before.user.branch,actingPassword:'admin123',expectedRevision:fresh.user.revision,requestId:crypto.randomUUID()}});expect(restore.status()).toBe(200);
});

test('account list read failure is visible and can be retried',async({page,adminSession})=>{
 await page.addInitScript(token=>localStorage.setItem('isbey_token',token),adminSession.token);await page.route('**/api/user-accounts',route=>route.fulfill({status:503,json:{success:false,message:'Hesap listesi alınamadı'}}),{times:1});await page.goto('/');await page.locator('aside').getByRole('button',{name:'Kullanıcı Hesapları',exact:true}).click();const panel=page.getByTestId('user-accounts-panel');await expect(panel.getByRole('alert')).toContainText('Hesap listesi alınamadı');await panel.getByRole('button',{name:'Tekrar Dene',exact:true}).click();await expect(panel.getByRole('alert')).toHaveCount(0);
});

test('account dialog keeps keyboard focus inside while loading and after the form arrives',async({page,adminSession})=>{
 await page.addInitScript(token=>localStorage.setItem('isbey_token',token),adminSession.token);
 let release!:()=>void;
 const pending=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/user-accounts/me',async route=>{await pending;await route.continue();});
 try {
  await page.goto('/');await page.getByRole('button',{name:'Kullanıcı menüsü',exact:true}).click();await page.getByRole('button',{name:'Hesabım ve Şifrem',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Kullanıcı Hesabı',exact:true});
  await expect(dialog.getByRole('status')).toContainText('yükleniyor');
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button',{name:'Hesap penceresini kapat',exact:true})).toBeFocused();
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true);
  release();
  await expect(dialog.getByLabel('Telefon',{exact:true})).toBeVisible();
  await dialog.focus();await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button',{name:'Bilgileri Kaydet',exact:true})).toBeFocused();
  await page.keyboard.press('Tab');await expect(dialog.getByRole('button',{name:'Geri',exact:true})).toBeFocused();
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
 } finally {release();}
});
