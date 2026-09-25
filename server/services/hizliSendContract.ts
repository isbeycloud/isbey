/** HTTP success alone is not document acceptance. Preserve every item for reconciliation. */
export function validateHizliSendResponse(data: any, expectedCount: number) {
  const results = Array.isArray(data) ? data : [];
  const complete = expectedCount > 0 && results.length === expectedCount;
  const success = complete && results.every(item => item?.IsSucceeded === true);
  return {
    success,
    data,
    requiresReconciliation: !success,
    message: success
      ? 'Entegratör belge isteğini kabul etti; GİB durumu ayrıca sorgulanmalıdır.'
      : 'Entegratör tüm belgeleri kabul ettiğini doğrulamadı. Yeniden göndermeden önce belge durumunu kontrol edin.',
  };
}
