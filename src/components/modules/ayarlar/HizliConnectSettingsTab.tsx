import React, { useState, useEffect } from 'react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import {
  Zap,
  Key,
  Lock,
  ShieldCheck,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  Coins,
  Send,
  ExternalLink,
  Sliders,
  Check,
  Server,
  FileCode,
} from 'lucide-react';

export const HizliConnectSettingsTab: React.FC = () => {
  const { showToast } = useToast();

  // Form State
  const [apiKey, setApiKey] = useState(''); // FAZ 10: .env'den yüklenir
  // 2026-09-15: Sunucu apiKey'i maskeli döndürdüğü için "anahtar tanımlı mı"
  // bilgisi ayrı tutulur; kullanıcıya değer gösterilmez, yalnızca durum gösterilir.
  const [hasExistingApiKey, setHasExistingApiKey] = useState(false);
  const [secretKey, setSecretKey] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [hashedUsername, setHashedUsername] = useState('');
  const [hashedPassword, setHashedPassword] = useState('');
  const [isTestMode, setIsTestMode] = useState(true);
  const [senderUrn, setSenderUrn] = useState('urn:mail:defaultpk@hizlibilisimteknolojileri.net');
  const [autoGibCheck, setAutoGibCheck] = useState(true);

  // Status & Live Data
  // 2026-09-12 (uydurma temizliği): `isConnected` başlangıçta `true` ve HİÇBİR
  // yerde `setIsConnected` çağrılmıyordu — yani sayfa açılır açılmaz, hiçbir
  // bağlantı testi yapılmadan "✓ e-Connect Bağlantısı Aktif" yazıyordu. Bu
  // bilgi, gerçek bir test sonucu gelene kadar "bilinmiyor" (null) olmalı.
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [activeToken, setActiveToken] = useState(''); // FAZ 10: sahte token gösterimi kaldırıldı
  // 2026-09-12: Başlangıç değeri `{ total: 1000, remaining: 943 }` idi — panel
  // açılır açılmaz, hiçbir kontör sorgusu yapılmadan "943/1000 kalan" gösteriyordu.
  // Artık `null` başlar ve arayüz "—" gösterir; yalnız gerçek API yanıtı yazılır.
  const [creditBalance, setCreditBalance] = useState<{ total: number | null; remaining: number | null }>({ total: null, remaining: null });
  const [encrypting, setEncrypting] = useState(false);
  const [testing, setTesting] = useState(false);
  // 2026-09-12: config ucu yalnız platform yöneticisine açık. Yetkisiz istekte
  // sessiz boş ekran yerine açıklama göstermek için yükleme sonucu izlenir.
  const [configLoaded, setConfigLoaded] = useState<boolean | null>(null);
  const [canViewConfig, setCanViewConfig] = useState(true);

  // VKN Test Tool
  const [testVkn, setTestVkn] = useState('4810592817');
  const [vknChecking, setVknChecking] = useState(false);
  const [vknResult, setVknResult] = useState<any>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const res = await api.getHizliConfig();
      if (res.success && res.config) {
        // 2026-09-15: Sunucu `apiKey`'i artık maskeli ('••••••••') döndürür.
        // Maskeyi forma YAZMAK, kullanıcıya "anahtar bu" izlenimi verir ve
        // kaydetme sırasında maskeyi gerçek değer sanıp geri göndermeye yol
        // açar. Bu yüzden alan boş bırakılır; kullanıcı yeni anahtar girerse
        // güncellenir, girm ezse sunucudaki mevcut anahtar korunur.
        setApiKey('');
        setHasExistingApiKey(!!res.config.apiKey || !!res.config.hasApiKey);
        // 2026-09-12: Sunucu hash'leri artık '••••••••' olarak maskeler; bu
        // değer forma yazılırsa "gerçek hash" sanılabilir. Yalnız "tanımlı mı"
        // bilgisi alınır.
        if (res.config.hashedUsername) setHashedUsername('••••••••');
        if (res.config.hashedPassword) setHashedPassword('••••••••');
        setIsTestMode(res.config.isTestMode !== undefined ? res.config.isTestMode : true);
        if (res.config.senderUrn) setSenderUrn(res.config.senderUrn);
        setConfigLoaded(true);
        setCanViewConfig(true);
      } else {
        setConfigLoaded(false);
      }
      loadCredits();
    } catch (err: any) {
      // Yetki yok (403) ise ekran "bilinmiyor" durumuna düşer ve açıklama
      // gösterir; sessizce yutulmaz (CLAUDE.md: sessiz hata yasak).
      setConfigLoaded(false);
      setCanViewConfig(false);
      console.warn('Hızlı Bilişim config yüklenemedi (yetki gerekebilir):', err?.message || err);
      loadCredits();
    }
  };

  const loadCredits = async () => {
    try {
      const res = await api.getHizliCredits();
      if (res.success) {
        // 2026-09-12 (uydurma temizliği): `|| 1000` ve `: 943` fallback'leri
        // kaldırıldı. API kontör bilgisi döndürmediğinde panel 1.000 / 943 gibi
        // UYDURMA bakiyeler gösteriyordu (üstelik 943 sabiti "kullanılmış" izlenimi
        // veriyordu). Bilinmiyorsa `null` kalır; arayüz "—" gösterir.
        setCreditBalance({
          total: typeof res.totalCredits === 'number' ? res.totalCredits : null,
          remaining: typeof res.remainingCredits === 'number' ? res.remainingCredits : null,
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 1. UtilEncrypt: SecretKey ile Hash Üret
  const handleEncrypt = async () => {
    if (!secretKey || !username || !password) {
      showToast('Lütfen SecretKey, kullanıcı adı ve şifre alanlarını doldurun.', 'warning');
      return;
    }

    setEncrypting(true);
    try {
      const res = await api.encryptHizliCredentials({
        secretKey,
        username,
        password,
        isTest: isTestMode,
      });

      // 2026-09-12: Sunucu artık hash'leri döndürmez (güvenlik). Yalnız
      // "üretildi mi" bilgisi gelir; hash'ler sunucu tarafında kalır.
      if (res.success && res.hashesObtained) {
        setHashedUsername('••••••••');
        setHashedPassword('••••••••');
        showToast('SecretKey ile şifreleme başarılı! Hash\'ler sunucu tarafında tutuluyor.', 'success');
      } else {
        showToast(res.message || 'Şifreleme başarısız.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Şifreleme hatası.', 'error');
    } finally {
      setEncrypting(false);
    }
  };

  // 2. Login: Token Al & Test Et
  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const res = await api.testHizliConnection({
        apiKey,
        hashedUsername,
        hashedPassword,
        isTest: isTestMode,
      });

      if (res.success && res.token) {
        setActiveToken(res.token);
        setIsConnected(true);
        showToast(res.message || 'Hızlı Teknoloji e-Connect bağlantısı başarılı!', 'success');
        loadCredits();
      } else {
        setIsConnected(false);
        showToast(res.message || 'Bağlantı kurulamadı.', 'error');
      }
    } catch (err: any) {
      setIsConnected(false);
      showToast(err.message || 'Bağlantı testi sırasında hata oluştu.', 'error');
    } finally {
      setTesting(false);
    }
  };

  // 3. GİB Mükellef Sorgula
  const handleCheckVkn = async () => {
    if (!testVkn) {
      showToast('Lütfen sorgulamak için bir VKN/TCKN girin.', 'warning');
      return;
    }

    setVknChecking(true);
    setVknResult(null);
    try {
      const res = await api.checkGibUser(testVkn);
      if (res.success) {
        setVknResult(res);
        showToast(res.isEInvoiceUser ? 'Mükellef e-Fatura kayıtlıdır.' : 'Alıcı e-Arşiv faturaya tabidir.', 'info');
      }
    } catch (err: any) {
      showToast(err.message || 'Sorgulama başarısız.', 'error');
    } finally {
      setVknChecking(false);
    }
  };

  // 2026-09-12: `/efatura/hizli/config` artık yalnız platform yöneticisine
  // açık (credential uçları). Bu sekme hem Ayarlar (HIZLI_CONNECT) hem Yönetim
  // Paneli içinde render edildiğinden, yetkisiz kullanıcı 403 alır ve konsol
  // hatası oluşurdu. configLoaded=false iken kullanıcıya neden gösterildiği
  // açıkça yazılır (sessiz boş ekran yerine açıklama).
  if (configLoaded === false && !canViewConfig) {
    return (
      <div className="card-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <ShieldCheck size={18} style={{ color: '#b45309' }} />
          <h4 style={{ fontSize: '14px', fontWeight: 800, margin: 0 }}>
            Hızlı Bilişim entegratör ayarları yalnız platform yöneticisine açıktır
          </h4>
        </div>
        <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
          Bu ekran API anahtarı, SecretKey ve web servis şifresi gibi kimlik bilgilerini
          yönetir. Kimlik bilgileri süreç genelinde (tüm kiracılar için) tutulduğundan
          ve tek bir değişiklik tüm firmaların GİB gönderimini etkilediğinden bu yetki
          yalnız <strong>SUPER_ADMIN</strong> rolüne verilmiştir.
          Bağlantı durumu ve kontör bakiyesini bu ekrandan görmeye devam edebilirsiniz;
          ayar değiştirmek için sistem yöneticinizle iletişime geçin.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* ─── 1. Entegratör Durum & Bilgi Kartı ─── */}
      <div
        className="card-panel"
        style={{
          // 2026-09-13 (tasarım sadeleştirmesi): dekoratif gradyan yerine düz ikincil yüzey token'ı.
          background: 'var(--bg-surface-secondary)',
          padding: '16px 20px',
          border: '1px solid rgba(26,86,219,0.2)',
          borderRadius: '10px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                // 2026-09-13 (tasarım sadeleştirmesi): dekoratif gradyan yerine düz birincil token.
                background: 'var(--primary)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 10px rgba(2,132,199,0.3)',
              }}
            >
              <Zap size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                  Hızlı Bilişim Teknolojileri A.Ş. (e-Connect)
                </h3>
                <span className={`badge ${isConnected === true ? 'badge-success' : isConnected === false ? 'badge-danger' : 'badge-secondary'}`} style={{ fontSize: '10.5px' }}>
                  {isConnected === true
                    ? '✓ e-Connect Bağlantısı Aktif'
                    : isConnected === false
                      ? 'Bağlantı Yok'
                      : 'Bağlantı durumu bilinmiyor'}
                </span>
                <span className="badge badge-primary" style={{ fontSize: '10px' }}>
                  {isTestMode ? 'TEST / SANDBOX' : 'CANLI ORTAM'}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                GİB Onaylı Özel Entegratör REST API e-Fatura, e-Arşiv, e-İrsaliye ve e-Dönüşüm Doğrudan İletişim Servisi
              </div>
            </div>
          </div>

          {/* e-Kontör Bakiyesi Rozeti */}
          <div style={{
            background: 'var(--bg-surface)',
            border: '1.5px solid var(--border-color)',
            borderRadius: '8px',
            padding: '10px 16px',
            textAlign: 'right',
            minWidth: '200px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontWeight: 600 }}>e-Fatura Kontör Bakiyesi</span>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '10px', padding: '2px 8px', height: 'auto' }}
                onClick={loadCredits}
              >
                <RefreshCw size={10} />
              </button>
            </div>
            {/* 2026-09-12: Kontör bilinmiyorsa (null) "—" gösterilir; oran çubuğu
                yalnız her iki değer de gerçek sayıysa hesaplanır (sıfıra bölme ve
                uydurma yüzde üretilmez). */}
            {(() => {
              const rem = creditBalance.remaining;
              const tot = creditBalance.total;
              const hasValues = typeof rem === 'number' && typeof tot === 'number' && tot > 0;
              const pct = hasValues ? Math.round((rem / tot) * 100) : 0;
              return (
                <>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: !hasValues ? 'var(--text-muted)' : rem > 100 ? 'var(--success)' : '#f59e0b', fontFamily: 'var(--font-mono)', marginBottom: '6px' }}>
                    {typeof rem === 'number' ? rem.toLocaleString('tr-TR') : '—'}
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                      {' / '}{typeof tot === 'number' ? tot.toLocaleString('tr-TR') : '—'}
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${hasValues ? pct : 0}%`,
                      background: !hasValues ? 'var(--border-color)' : rem > 200 ? 'var(--success)' : rem > 50 ? '#f59e0b' : '#ef4444',
                      borderRadius: '3px',
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px', textAlign: 'right' }}>
                    {hasValues ? `${pct}% kalan` : 'Kontör bilgisi alınamadı'}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* ─── 2. İki Sütunlu Yapılandırma ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
        {/* Sol Sütun: Kimlik & Güvenlik Ayarları */}
        <div className="card-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-main)', margin: 0 }}>
            <Key size={16} color="var(--primary)" />
            <span>1. ApiKey ve Kimlik Doğrulama Bilgileri</span>
          </h4>

          {/* ApiKey */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label required">Entegratör ApiKey</label>
            <input
              type="text"
              className="form-input"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              // 2026-09-15: GÜVENLİK — sunucu artık anahtarı düz metin döndürmez.
              // Alan bilinçli olarak boş gelir; mevcut anahtar sunucuda korunur
              // (boş bırakılırsa değiştirilmez). Kullanıcıya değer gösterilmez.
              placeholder={hasExistingApiKey ? 'Tanımlı — değiştirmek için yeni anahtar girin' : 'API Key (.env\'den)'}
              style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}
            />
            <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
              {hasExistingApiKey
                ? 'Bir API anahtarı tanımlı. Güvenlik gereği değer gösterilmez; boş bırakırsanız mevcut anahtar korunur.'
                : 'Hızlı Teknoloji tarafından tahsis edilen kurum API anahtarınız.'}
            </span>
          </div>

          {/* Şifreleme Bölümü (UtilEncrypt) */}
          <div style={{
            background: 'var(--bg-surface-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Lock size={13} color="#f59e0b" />
                <span>UtilEncrypt Güvenli Şifreleme (Tek Seferlik)</span>
              </span>
              <span style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 600 }}>
                Localde şifre saklanmaz!
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
              <input
                type="password"
                className="form-input form-input-sm"
                placeholder="Secret Key (örn: 74c33ff3e0714713a65f9f800d4971ea)"
                value={secretKey}
                onChange={e => setSecretKey(e.target.value)}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <input
                  type="text"
                  className="form-input form-input-sm"
                  placeholder="Web Servis Kullanıcı Adı"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                />
                <input
                  type="password"
                  className="form-input form-input-sm"
                  placeholder="Web Servis Şifresi"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleEncrypt}
              disabled={encrypting}
              style={{ width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {encrypting ? <RefreshCw size={13} className="spin" /> : <Lock size={13} />}
              <span>SecretKey ile Şifrele ve Hash Üret (/UtilEncrypt)</span>
            </button>
          </div>

          {/* Hashed Bilgiler (Login için saklananlar) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '11px' }}>Hashed Username</label>
              <input
                type="text"
                className="form-input form-input-sm"
                value={hashedUsername}
                readOnly
                style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', background: 'var(--bg-surface-secondary)' }}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '11px' }}>Hashed Password</label>
              <input
                type="text"
                className="form-input form-input-sm"
                value={hashedPassword}
                readOnly
                style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', background: 'var(--bg-surface-secondary)' }}
              />
            </div>
          </div>

          {/* Bağlantı Testi Butonu */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleTestConnection}
              disabled={testing}
              style={{ flex: 1, justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {testing ? <RefreshCw size={14} className="spin" /> : <Zap size={14} />}
              <span>Bağlantıyı Test Et & Token Al (/RestApi/Login)</span>
            </button>
          </div>
        </div>

        {/* Sağ Sütun: GİB Mükellef Sorgulama & Tercihler */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* GİB Mükellef Canlı Sorgu Aracı */}
          <div className="card-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-main)', margin: 0 }}>
              <Search size={16} color="var(--primary)" />
              <span>2. Canlı GİB e-Fatura Mükellef Sorgulama</span>
            </h4>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>
              Herhangi bir müşteri/tedarikçinin VKN veya TCKN numarasını Hızlı Teknoloji üzerinden anında sorgulayın.
            </p>

            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className="form-input"
                placeholder="10 veya 11 haneli VKN / TCKN"
                value={testVkn}
                onChange={e => setTestVkn(e.target.value)}
                maxLength={11}
                style={{ fontFamily: 'var(--font-mono)' }}
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleCheckVkn}
                disabled={vknChecking}
                style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
              >
                {vknChecking ? <RefreshCw size={14} className="spin" /> : <Search size={14} />}
                <span>Sorgula</span>
              </button>
            </div>

            {/* Sorgu Sonucu */}
            {vknResult && (
              <div style={{
                background: vknResult.isEInvoiceUser ? 'rgba(22,163,74,0.08)' : 'rgba(2,132,199,0.08)',
                border: `1px solid ${vknResult.isEInvoiceUser ? 'var(--success)' : 'var(--primary)'}`,
                borderRadius: '8px',
                padding: '10px 12px',
                fontSize: '11.5px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: vknResult.isEInvoiceUser ? 'var(--success)' : 'var(--primary)' }}>
                  {vknResult.isEInvoiceUser ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <span>{vknResult.title}</span>
                </div>
                <div style={{ marginTop: '4px', color: 'var(--text-main)' }}>
                  {vknResult.message}
                </div>
                {vknResult.aliasPk && (
                  <div style={{ marginTop: '4px', fontSize: '10.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    PK: {vknResult.aliasPk}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Entegrasyon Tercihleri */}
          <div className="card-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-main)', margin: 0 }}>
              <Sliders size={16} color="var(--primary)" />
              <span>3. e-Dönüşüm Gönderim Tercihleri</span>
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isTestMode}
                  onChange={e => setIsTestMode(e.target.checked)}
                />
                <span>Test (Sandbox) Modunda Çalış (econnecttest.hizliteknoloji.com.tr)</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={autoGibCheck}
                  onChange={e => setAutoGibCheck(e.target.checked)}
                />
                <span>Fatura keserken müşteriyi otomatik GİB mükellef listesinden sorgula</span>
              </label>

              <div className="form-group" style={{ margin: 0, marginTop: '4px' }}>
                <label className="form-label" style={{ fontSize: '11px' }}>Gönderici Posta Kutusu (PK/GB URN)</label>
                <input
                  type="text"
                  className="form-input form-input-sm"
                  value={senderUrn}
                  onChange={e => setSenderUrn(e.target.value)}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}
                />
              </div>
            </div>
          </div>

          {/* Hızlı Bilişim XSLT Fatura Tasarımları İçe Aktarma */}
          {/* 2026-09-13 (tasarım sadeleştirmesi): dekoratif gradyan yerine düz ikincil yüzey token'ı. */}
          <div className="card-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', border: '1px solid rgba(234, 88, 12, 0.3)', background: 'var(--bg-surface-secondary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-main)', margin: 0 }}>
                <FileCode size={16} color="var(--warning)" />
                <span>4. Hızlı Bilişim Fatura Tasarımları (XSLT)</span>
              </h4>
              <span className="badge badge-success" style={{ fontSize: '10px' }}>Portal ile Uyumlu</span>
            </div>

            <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
              Hızlı Bilişim portalında tanımlı olan resmi <strong>e-Fatura</strong> ve <strong>e-Arşiv Fatura</strong> XSLT tasarımlarını İŞBEY sistemine şablon olarak içe aktarın.
            </p>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-warning"
                onClick={async () => {
                  try {
                    showToast('Hızlı Bilişim fatura tasarımları içe aktarılıyor...', 'info');
                    const res = await api.importHizliXslt('ALL', 'general');
                    if (res.success) {
                      showToast(res.message || 'Tüm tasarımlar başarıyla içe aktarıldı.', 'success');
                    }
                  } catch (err: any) {
                    showToast(err.message || 'Tasarımlar içe aktarılırken hata oluştu.', 'error');
                  }
                }}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '12px', padding: '8px 12px' }}
              >
                <FileCode size={14} />
                <span>Hızlı Bilişim Tasarımlarını İçe Aktar</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
