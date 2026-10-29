import { UNIT_LABELS } from '../../../src/utils/unitDisplay';

const xmlText = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Owned templates only. Raw XML and provider templates are never rewritten. */
export const unitDisplayXslt = `<xsl:template name="unit-display">
<xsl:param name="raw"/>
<xsl:variable name="normalized" select="translate(normalize-space($raw), 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')"/>
<xsl:choose>
${Object.entries(UNIT_LABELS).map(([code, label]) => `<xsl:when test="$normalized='${xmlText(code)}'">${xmlText(label)}</xsl:when>`).join('\n')}
<xsl:otherwise><xsl:value-of select="$raw"/></xsl:otherwise>
</xsl:choose>
</xsl:template>`;
