/**
 * Affiliate links voor leveranciers-URLs.
 *
 * Alleen Amazon wordt omgezet. De URL wordt genormaliseerd naar de kale
 * /dp/{ASIN}-vorm, zodat elke variant die de inkoper plakt (zoekresultaat,
 * mobiele link, met review-parameters) altijd dezelfde link oplevert.
 *
 * Tags kunnen via environment variables worden overschreven.
 */

const getAmazonAffiliateConfig = () => ({
  tag: String(process.env.AMAZON_TAG || '').trim(),
  ascSubTag: String(process.env.AMAZON_ASCSUBTAG || '').trim(),
});

const extractAmazonTld = (url) => {
  const match = String(url).match(/https?:\/\/[^/]*amazon\.([a-z.]+)\//i);
  return match ? match[1] : 'com';
};

const extractAsin = (url) => {
  let match = String(url).match(/\/(?:dp|gp\/product|gp\/aw\/d|gp\/offer-listing)\/([A-Z0-9]{10})/i);
  if (!match) match = String(url).match(/\/([A-Z0-9]{10})(?:[/?]|$)/i);
  return match ? match[1].toUpperCase() : '';
};

export const isAmazonUrl = (url) => String(url || '').toLowerCase().includes('amazon.');

const isAlreadyTagged = (url) => {
  const { tag } = getAmazonAffiliateConfig();
  if (!tag) return false;
  return new RegExp(`[?&]tag=${tag}(&|$)`, 'i').test(String(url || ''));
};

export const buildAmazonAffiliateLink = (url) => {
  const { tag, ascSubTag } = getAmazonAffiliateConfig();
  if (!tag || !ascSubTag) return String(url || '').trim();
  const asin = extractAsin(url);
  if (!asin) return String(url || '').trim();
  const tld = extractAmazonTld(url);
  return `https://www.amazon.${tld}/dp/${asin}`
    + `?tag=${encodeURIComponent(tag)}`
    + `&ascsubtag=${encodeURIComponent(ascSubTag)}`
    + `&sub_id_1=${encodeURIComponent(ascSubTag)}`;
};

/**
 * Zet een geplakte URL om naar de op te slaan leverancierslink.
 * Niet-Amazon URLs worden ongewijzigd bewaard.
 */
export const toAffiliateUrl = (url) => {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';
  if (!isAmazonUrl(trimmed)) return trimmed;
  if (isAlreadyTagged(trimmed)) return trimmed;
  return buildAmazonAffiliateLink(trimmed);
};