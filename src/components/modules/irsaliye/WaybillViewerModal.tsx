import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../../services/api';
import type { Waybill } from '../../../types';
import { Modal } from '../../common/Modal';
import { downloadDocumentXml, renderDocumentVisual } from '../../../utils/documentVisual';

export const WaybillViewerModal: React.FC<{ waybill: Waybill | null; onClose: () => void }> = ({ waybill, onClose }) => {
  const [html, setHtml] = useState('');
  const [xml, setXml] = useState('');
  const [previewNote, setPreviewNote] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const waybillId = waybill?.id;
  useEffect(() => {
    setHtml(''); setXml(''); setError(''); setPreviewNote('');
    if (!waybillId) return;
    let cancelled = false;
    setLoading(true);
    api.getErpWaybillVisual(waybillId).then(response => {
      if (cancelled) return;
      setHtml(renderDocumentVisual(response));
      setXml(response.xml);
      setPreviewNote(response.xmlSource === 'erp' ? 'ERP kaydından önizleme' : '');
    }).catch(err => { if (!cancelled) setError(err.message || 'İrsaliye görünümü yüklenemedi.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [waybillId, retry]);
  return <Modal isOpen={!!waybill} onClose={onClose} title={`İrsaliye — ${waybill?.waybillNo || ''}`} size="large">
    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
      <button className="btn btn-secondary" disabled={!xml || loading} onClick={() => downloadDocumentXml(xml, waybill!.waybillNo)}>UBL XML</button>
      <button className="btn btn-secondary" disabled={!html || loading} onClick={() => frame.current?.contentWindow?.print()}>Yazdır</button>
    </div>
    {previewNote && <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>{previewNote}</p>}
    {loading ? <p role="status">İrsaliye XSLT ile hazırlanıyor...</p> : error ? <div role="alert"><p>{error}</p>
      <button className="btn btn-secondary" onClick={() => setRetry(value => value + 1)}>Yeniden dene</button></div>
      : html ? <iframe ref={frame} title="İrsaliye XSLT Önizleme" srcDoc={html} sandbox="allow-same-origin allow-modals"
        style={{ width: '100%', height: '70vh', border: 0, background: '#fff' }} /> : null}
  </Modal>;
};
