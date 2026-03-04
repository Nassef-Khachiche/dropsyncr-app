const MAILBOX_PATTERN = /(brievenbus|letterbox|mailbox)/i;

const MANUAL_REVIEW_ROUTE = 'HANDMATIG CONTROLEREN';

const OWN_NL_DEFAULT = {
  contract: 'WG PostNL - NEDERLAND',
  service: 'PostNL Brievenbuspakketje 0-2kg',
};

const OWN_BE_DEFAULT = {
  contract: 'PostNL BE WG',
  service: 'PostNL België Standaard 0-23kg',
};

const VVB_MAILBOX_DEFAULT = {
  contract: 'Bol.com',
  service: 'VVB - PostNL Brievenbus',
};

const VVB_PACKAGE_DEFAULT = {
  contract: 'Bol.com',
  service: 'VVB - PostNL Pakket',
};

const normalizeCountryCode = (value) => String(value || '').trim().toUpperCase();

const normalizeString = (value) => String(value || '').trim();

const normalizeComparable = (value) => normalizeString(value).toLowerCase();

const toBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;

  const normalized = normalizeComparable(value);
  return ['1', 'true', 'yes', 'ja', 'y'].includes(normalized);
};

const firstNonEmpty = (...values) => {
  for (const value of values) {
    const normalized = normalizeString(value);
    if (normalized) return normalized;
  }
  return null;
};

const parseShippingAssignment = (value) => {
  const normalized = normalizeString(value);
  if (!normalized) return null;

  try {
    if (normalized.startsWith('{')) {
      const parsed = JSON.parse(normalized);
      const contract = normalizeString(parsed?.contract);
      const service = normalizeString(parsed?.service);
      if (contract && service) {
        return { contract, service };
      }
    }
  } catch (error) {
    // Fallback to plain-text parsing below.
  }

  const separators = ['|', '::', '=>'];
  for (const separator of separators) {
    if (!normalized.includes(separator)) continue;

    const [contractPart, ...serviceParts] = normalized.split(separator);
    const contract = normalizeString(contractPart);
    const service = normalizeString(serviceParts.join(separator));

    if (contract && service) {
      return { contract, service };
    }
  }

  return null;
};

const formatShippingMethod = (contract, service) => {
  const normalizedContract = normalizeString(contract);
  const normalizedService = normalizeString(service);

  if (!normalizedContract || !normalizedService) return MANUAL_REVIEW_ROUTE;
  return `${normalizedContract} | ${normalizedService}`;
};

const matchStoreName = (ruleName, storeName) => {
  const normalizedRuleName = normalizeComparable(ruleName);
  const normalizedStoreName = normalizeComparable(storeName);

  if (!normalizedRuleName || !normalizedStoreName) return false;
  if (normalizedRuleName === '*') return true;

  if (normalizedRuleName.startsWith('store:')) {
    return normalizeComparable(normalizedRuleName.replace(/^store:/, '')) === normalizedStoreName;
  }

  return normalizedRuleName === normalizedStoreName;
};

const findStoreException = async ({ prisma, installationId, storeName, countryCode }) => {
  const normalizedStoreName = normalizeString(storeName);
  const normalizedCountryCode = normalizeCountryCode(countryCode);

  if (!normalizedStoreName || !normalizedCountryCode) return null;

  const rules = await prisma.automationRule.findMany({
    where: {
      installationId,
      active: true,
      countryCode: {
        in: [normalizedCountryCode, '*', 'ALL'],
      },
    },
    orderBy: [
      { priority: 'asc' },
      { createdAt: 'asc' },
    ],
    select: {
      id: true,
      name: true,
      carrierType: true,
    },
  });

  for (const rule of rules) {
    if (!matchStoreName(rule.name, normalizedStoreName)) continue;

    const parsedAssignment = parseShippingAssignment(rule.carrierType);
    if (!parsedAssignment) continue;

    return {
      ...parsedAssignment,
      source: 'store-exception',
      ruleId: rule.id,
    };
  }

  return null;
};

export const normalizeBolShippingMethod = (value) => {
  const normalized = normalizeComparable(value).toUpperCase();

  if (!normalized) return null;
  if (normalized === 'VVB' || normalized === 'FBB') return 'VVB';
  if (normalized === 'OWN' || normalized === 'FBR') return 'OWN';

  return null;
};

export const inferBolShippingMethodFromOrderData = (orderData = {}) => {
  const orderItem = Array.isArray(orderData.orderItems) ? orderData.orderItems[0] : null;

  const candidate = firstNonEmpty(
    orderData.shippingMethod,
    orderData.bolShippingMethod,
    orderData.fulfilmentMethod,
    orderData.fulfillmentMethod,
    orderData.deliveryMethod,
    orderData.logisticMethod,
    orderData.shipping?.method,
    orderData.orderPayload?.shippingMethod,
    orderData.orderPayload?.fulfilmentMethod,
    orderData.orderPayload?.fulfillmentMethod,
    orderData.orderPayload?.deliveryMethod,
    orderData.bolOrder?.shippingMethod,
    orderData.bolOrder?.fulfilmentMethod,
    orderData.bolOrder?.fulfillmentMethod,
    orderData.bolOrder?.deliveryMethod,
    orderItem?.shippingMethod,
    orderItem?.fulfilmentMethod,
    orderItem?.fulfillmentMethod,
    orderItem?.deliveryMethod
  );

  return normalizeBolShippingMethod(candidate);
};

export const inferIsMailboxFromOrderData = (orderData = {}) => {
  const orderItems = Array.isArray(orderData.orderItems) ? orderData.orderItems : [];

  const explicitBooleanCandidate = [
    orderData.isBrievenbus,
    orderData.isMailbox,
    orderData.isLetterbox,
    orderData.mailbox,
    orderData.letterbox,
    orderData.orderPayload?.isBrievenbus,
    orderData.orderPayload?.isMailbox,
    orderData.orderPayload?.mailbox,
    ...orderItems.flatMap((item) => [item?.isBrievenbus, item?.isMailbox, item?.mailbox]),
  ].find((value) => value !== undefined && value !== null);

  if (explicitBooleanCandidate !== undefined && explicitBooleanCandidate !== null) {
    return toBoolean(explicitBooleanCandidate);
  }

  const textualCandidates = [
    orderData.shippingProfile,
    orderData.shippingOption,
    orderData.shippingDescription,
    orderData.deliveryMethod,
    orderData.orderPayload?.shippingProfile,
    orderData.orderPayload?.shippingOption,
    orderData.orderPayload?.shippingDescription,
    ...orderItems.flatMap((item) => [
      item?.shippingProfile,
      item?.shippingOption,
      item?.deliveryMethod,
      item?.offer?.deliveryMethod,
      item?.offer?.shippingMethod,
    ]),
  ].filter(Boolean);

  return textualCandidates.some((value) => MAILBOX_PATTERN.test(String(value)));
};

export const resolveShippingAutomationForOrder = async ({
  prisma,
  installationId,
  storeName,
  country,
  bolShippingMethod,
  isBrievenbus,
}) => {
  const shippingMethod = normalizeBolShippingMethod(bolShippingMethod);
  const receiverCountry = normalizeCountryCode(country);
  const mailboxOrder = toBoolean(isBrievenbus);

  if (shippingMethod === 'VVB' && mailboxOrder) {
    return {
      route: 'AUTO',
      shippingMethod,
      contract: VVB_MAILBOX_DEFAULT.contract,
      service: VVB_MAILBOX_DEFAULT.service,
      shippingAssignment: formatShippingMethod(VVB_MAILBOX_DEFAULT.contract, VVB_MAILBOX_DEFAULT.service),
    };
  }

  if (shippingMethod === 'VVB') {
    return {
      route: 'AUTO',
      shippingMethod,
      contract: VVB_PACKAGE_DEFAULT.contract,
      service: VVB_PACKAGE_DEFAULT.service,
      shippingAssignment: formatShippingMethod(VVB_PACKAGE_DEFAULT.contract, VVB_PACKAGE_DEFAULT.service),
    };
  }

  if (shippingMethod === 'OWN') {
    const storeException = await findStoreException({
      prisma,
      installationId,
      storeName,
      countryCode: receiverCountry,
    });

    if (storeException) {
      return {
        route: 'AUTO',
        shippingMethod,
        contract: storeException.contract,
        service: storeException.service,
        source: storeException.source,
        ruleId: storeException.ruleId,
        shippingAssignment: formatShippingMethod(storeException.contract, storeException.service),
      };
    }

    if (receiverCountry === 'BE') {
      return {
        route: 'AUTO',
        shippingMethod,
        contract: OWN_BE_DEFAULT.contract,
        service: OWN_BE_DEFAULT.service,
        shippingAssignment: formatShippingMethod(OWN_BE_DEFAULT.contract, OWN_BE_DEFAULT.service),
      };
    }

    if (receiverCountry === 'NL') {
      return {
        route: 'AUTO',
        shippingMethod,
        contract: OWN_NL_DEFAULT.contract,
        service: OWN_NL_DEFAULT.service,
        note: 'Pakket handmatig aanpassen naar juiste pakketlabel indien nodig.',
        shippingAssignment: formatShippingMethod(OWN_NL_DEFAULT.contract, OWN_NL_DEFAULT.service),
      };
    }
  }

  return {
    route: 'HANDMATIG_CONTROLEREN',
    shippingMethod: shippingMethod || null,
    contract: null,
    service: null,
    shippingAssignment: MANUAL_REVIEW_ROUTE,
  };
};

export { MANUAL_REVIEW_ROUTE };
