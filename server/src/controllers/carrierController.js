import prisma from '../config/database.js';
import fetch from 'node-fetch';

export const getCarriers = async (req, res) => {
  try {
    const { installationId } = req.query;

    // Verify access
    if (!req.user.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: {
          userId: req.user.id,
          installationId: parseInt(installationId),
        },
      });
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this installation' });
      }
    }

    const carriers = await prisma.carrier.findMany({
      where: {
        installationId: parseInt(installationId),
      },
      orderBy: { createdAt: 'desc' },
    });

    // Parse credentials JSON
    const carriersWithParsedCredentials = carriers.map((carrier) => ({
      ...carrier,
      credentials: JSON.parse(carrier.credentials || '{}'),
    }));

    res.json(carriersWithParsedCredentials);
  } catch (error) {
    console.error('Get carriers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createCarrier = async (req, res) => {
  try {
    const { installationId, carrierType, contractName, active, credentials } = req.body;

    // Verify access
    if (!req.user.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: {
          userId: req.user.id,
          installationId: parseInt(installationId),
        },
      });
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this installation' });
      }
    }

    const carrier = await prisma.carrier.create({
      data: {
        installationId: parseInt(installationId),
        carrierType,
        contractName,
        active: active !== undefined ? active : true,
        credentials: JSON.stringify(credentials || {}),
      },
    });

    res.status(201).json({
      ...carrier,
      credentials: JSON.parse(carrier.credentials),
    });
  } catch (error) {
    console.error('Create carrier error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateCarrier = async (req, res) => {
  try {
    const { id } = req.params;
    const { contractName, active, credentials } = req.body;

    const updateData = {};
    if (contractName !== undefined) updateData.contractName = contractName;
    if (active !== undefined) updateData.active = active;
    if (credentials !== undefined) updateData.credentials = JSON.stringify(credentials);

    const carrier = await prisma.carrier.update({
      where: { id: parseInt(id) },
      data: updateData,
    });

    res.json({
      ...carrier,
      credentials: JSON.parse(carrier.credentials),
    });
  } catch (error) {
    console.error('Update carrier error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Carrier not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteCarrier = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.carrier.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: 'Carrier deleted successfully' });
  } catch (error) {
    console.error('Delete carrier error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Carrier not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const testCarrierConnection = async (req, res) => {
  try {
    const { id } = req.params;

    const carrier = await prisma.carrier.findUnique({
      where: { id: parseInt(id) },
    });

    if (!carrier) {
      return res.status(404).json({ error: 'Carrier not found' });
    }

    // Verify access
    if (!req.user.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: {
          userId: req.user.id,
          installationId: carrier.installationId,
        },
      });
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this installation' });
      }
    }

    const credentials = JSON.parse(carrier.credentials || '{}');

    if (carrier.carrierType === 'dhl') {
      const hasRequired = !!credentials.userId && !!credentials.accountNumber && !!credentials.apiKey;
      return res.json({
        success: hasRequired,
        message: hasRequired ? 'DHL verbinding succesvol getest' : 'DHL credentials zijn incompleet',
      });
    }

    if (carrier.carrierType === 'dpd') {
      const hasDelisId = !!(credentials.delisId || credentials.username);
      const hasRequired = hasDelisId && !!credentials.password && !!credentials.depotNumber;
      return res.json({
        success: hasRequired,
        message: hasRequired ? 'DPD verbinding succesvol getest' : 'DPD credentials zijn incompleet',
      });
    }

    if (carrier.carrierType === 'wegrow') {
      const hasRequired = !!credentials.apiKey && !!credentials.serviceCode;
      return res.json({
        success: hasRequired,
        message: hasRequired ? 'WeGrow verbinding succesvol getest' : 'WeGrow credentials zijn incompleet',
      });
    }

    return res.json({
      success: false,
      message: 'Carrier type wordt momenteel niet ondersteund',
    });
  } catch (error) {
    console.error('Test carrier error:', error);
    res.status(500).json({ success: false, error: 'Failed to test carrier' });
  }
};

export const generateCarrierLabels = async (req, res) => {
  try {
    const { id } = req.params;
    const { packages = [], shippingMethod } = req.body;

    const carrier = await prisma.carrier.findUnique({
      where: { id: parseInt(id) },
    });

    if (!carrier) {
      return res.status(404).json({ error: 'Carrier not found' });
    }

    if (!carrier.active) {
      return res.status(400).json({ error: 'Carrier contract is inactive' });
    }

    // Verify access
    if (!req.user.isGlobalAdmin) {
      const hasAccess = await prisma.userInstallation.findFirst({
        where: {
          userId: req.user.id,
          installationId: carrier.installationId,
        },
      });
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this installation' });
      }
    }

    if (!['dhl', 'dpd', 'wegrow'].includes(carrier.carrierType)) {
      return res.status(400).json({ error: 'Carrier type not supported for labels' });
    }

    const parseAddress = (address = '') => {
      const parts = String(address).split(',').map(p => p.trim()).filter(Boolean);
      let street = parts.length > 1 ? parts.slice(0, -1).join(', ') : parts[0] || '';
      let zipCode = '';
      let city = '';

      const last = parts[parts.length - 1] || '';
      const match = last.match(/(\d{4}\s?[A-Z]{2})\s+(.+)/i);
      if (match) {
        zipCode = match[1].replace(/\s+/g, '');
        city = match[2].trim();
      }

      return { street, zipCode, city };
    };

    const escapeXml = (value) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

    const isTruthy = (value) => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return value !== 0;
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        return ['1', 'true', 'yes', 'on', 'sandbox'].includes(normalized);
      }
      return false;
    };

    const DPD_SANDBOX_DEFAULT_ENDPOINT = 'https://wsshippertest.dpd.nl/services/ShipmentService/V3_5';
    const DPD_PRODUCTION_DEFAULT_ENDPOINT = 'https://wsshipper.dpd.nl/services/ShipmentService/V3_5';

    const normalizeDpdShipmentEndpoint = (value, fallback) => {
      const raw = String(value || '').trim();
      const normalizedFallback = String(fallback || '').trim();
      const endpoint = raw || normalizedFallback;

      if (!endpoint) {
        return '';
      }

      const withoutTrailingSlash = endpoint.replace(/\/+$/, '');
      if (/\/soap\/ShipmentServiceV35$/i.test(withoutTrailingSlash)) {
        return withoutTrailingSlash.replace(/\/soap\/ShipmentServiceV35$/i, '/services/ShipmentService/V3_5');
      }

      return withoutTrailingSlash;
    };

    const getDpdShipmentEndpoint = (credentials) => {
      const isSandbox = isTruthy(credentials?.sandbox) || String(credentials?.environment || '').toLowerCase() === 'sandbox';
      const sandboxEndpoint = normalizeDpdShipmentEndpoint(process.env.DPD_SHIPMENT_URL_SANDBOX, DPD_SANDBOX_DEFAULT_ENDPOINT);
      const productionEndpoint = normalizeDpdShipmentEndpoint(process.env.DPD_SHIPMENT_URL, DPD_PRODUCTION_DEFAULT_ENDPOINT);
      if (credentials?.endpointUrl) {
        return normalizeDpdShipmentEndpoint(credentials.endpointUrl, isSandbox ? sandboxEndpoint : productionEndpoint);
      }
      return isSandbox ? sandboxEndpoint : productionEndpoint;
    };

    const getDpdEndpointCandidates = (credentials) => {
      if (credentials?.endpointUrl) {
        return [getDpdShipmentEndpoint(credentials)];
      }

      const sandboxEndpoint = normalizeDpdShipmentEndpoint(process.env.DPD_SHIPMENT_URL_SANDBOX, DPD_SANDBOX_DEFAULT_ENDPOINT);
      const productionEndpoint = normalizeDpdShipmentEndpoint(process.env.DPD_SHIPMENT_URL, DPD_PRODUCTION_DEFAULT_ENDPOINT);
      const primary = getDpdShipmentEndpoint(credentials);
      const fallback = primary === sandboxEndpoint ? productionEndpoint : sandboxEndpoint;

      return [primary, fallback].filter((value, index, arr) => arr.indexOf(value) === index);
    };

    const extractSoapFault = (soapResponse = '') => {
      const candidates = [
        /<(?:\w+:)?faultstring>([\s\S]*?)<\/(?:\w+:)?faultstring>/i,
        /<(?:\w+:)?errorMessage>([\s\S]*?)<\/(?:\w+:)?errorMessage>/i,
        /<(?:\w+:)?message>([\s\S]*?)<\/(?:\w+:)?message>/i,
        /<(?:\w+:)?Text>([\s\S]*?)<\/(?:\w+:)?Text>/i,
      ];

      let message = null;
      for (const regex of candidates) {
        const match = soapResponse.match(regex)?.[1];
        if (match) {
          message = match;
          break;
        }
      }

      if (!message && /<(?:\w+:)?Fault\b/i.test(soapResponse)) {
        message = 'SOAP Fault returned by DPD';
      }

      return message ? message.replace(/\s+/g, ' ').trim() : null;
    };

    const buildDpdSoapEnvelope = (credentials, pkg) => {
      const delisId = credentials.delisId || credentials.username || '';
      const authToken = credentials.authToken || credentials.password || '';
      const sendingDepot = credentials.depotNumber || '';

      const recipientName = pkg.customerName || 'Recipient';
      const recipientCountry = pkg.country || 'NL';
      const address = parseAddress(pkg.address || '');
      const zipCode = pkg.zipCode || address.zipCode || '0000AA';
      const city = pkg.city || address.city || 'Unknown';
      const street = pkg.street || address.street || pkg.address || 'Unknown';

      const reference1 = pkg.reference1 || pkg.orderNumber || pkg.id || 'Order';
      const reference2 = pkg.reference2 || pkg.trackingCode || '';
      const weight = String(pkg.weight || 500);
      const volume = String(pkg.volume || '000000000');

      const senderName1 = credentials.senderName1 || credentials.contractName || carrier.contractName || 'Dropsyncr';
      const senderName2 = credentials.senderName2 || '';
      const senderStreet = credentials.senderStreet || '';
      const senderStreet2 = credentials.senderStreet2 || '';
      const senderCountry = credentials.senderCountry || 'NL';
      const senderZipCode = credentials.senderZipCode || '';
      const senderCity = credentials.senderCity || '';
      const senderPhone = credentials.senderPhone || '';
      const senderEmail = credentials.senderEmail || '';

      return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="http://dpd.com/common/service/types/Authentication/2.0" xmlns:ns1="http://dpd.com/common/service/types/ShipmentService/3.5">
  <soapenv:Header>
    <ns:authentication>
      <delisId>${escapeXml(delisId)}</delisId>
      <authToken>${escapeXml(authToken)}</authToken>
      <messageLanguage>nl_NL</messageLanguage>
    </ns:authentication>
  </soapenv:Header>
  <soapenv:Body>
    <ns1:storeOrders>
      <printOptions>
        <printerLanguage>PDF</printerLanguage>
        <paperFormat>A6</paperFormat>
      </printOptions>
      <order>
        <generalShipmentData>
          <sendingDepot>${escapeXml(sendingDepot)}</sendingDepot>
          <product>B2B</product>
          <sender>
            <name1>${escapeXml(senderName1)}</name1>
            <name2>${escapeXml(senderName2)}</name2>
            <street>${escapeXml(senderStreet)}</street>
            <street2>${escapeXml(senderStreet2)}</street2>
            <country>${escapeXml(senderCountry)}</country>
            <zipCode>${escapeXml(senderZipCode)}</zipCode>
            <city>${escapeXml(senderCity)}</city>
            <phone>${escapeXml(senderPhone)}</phone>
            <email>${escapeXml(senderEmail)}</email>
          </sender>
          <recipient>
            <name1>${escapeXml(recipientName)}</name1>
            <name2>${escapeXml(pkg.companyName || '')}</name2>
            <street>${escapeXml(street)}</street>
            <street2>${escapeXml(pkg.street2 || '')}</street2>
            <country>${escapeXml(recipientCountry)}</country>
            <zipCode>${escapeXml(zipCode)}</zipCode>
            <city>${escapeXml(city)}</city>
            <contact>${escapeXml(pkg.contact || recipientName)}</contact>
            <phone>${escapeXml(pkg.phone || '')}</phone>
            <email>${escapeXml(pkg.email || '')}</email>
          </recipient>
        </generalShipmentData>
        <parcels>
          <customerReferenceNumber1>${escapeXml(reference1)}</customerReferenceNumber1>
          <customerReferenceNumber2>${escapeXml(reference2)}</customerReferenceNumber2>
          <volume>${escapeXml(volume)}</volume>
          <weight>${escapeXml(weight)}</weight>
        </parcels>
        <productAndServiceData>
          <orderType>consignment</orderType>
        </productAndServiceData>
      </order>
    </ns1:storeOrders>
  </soapenv:Body>
</soapenv:Envelope>`;
    };

    const extractLabelBase64 = (soapResponse) => {
      const tags = [
        'labelData',
        'parcelLabel',
        'label',
        'pdfData',
        'labelPdf',
      ];
      for (const tag of tags) {
        const match = soapResponse.match(new RegExp(`<${tag}>([A-Za-z0-9+/=\r\n]+)</${tag}>`));
        if (match?.[1]) {
          return match[1].replace(/\s+/g, '');
        }
      }
      return null;
    };

    const getWeGrowBaseUrl = (credentials) => {
      const sandboxDefault = process.env.WEGROW_SANDBOX_URL || 'https://api-sandbox.wegrow.eu';
      const productionDefault = process.env.WEGROW_PRODUCTION_URL || 'https://api.wegrow.eu';
      const useSandbox = credentials.sandbox === true || credentials.environment === 'sandbox';

      if (credentials.baseUrl) {
        return credentials.baseUrl;
      }

      if (process.env.WEGROW_BASE_URL) {
        return process.env.WEGROW_BASE_URL;
      }

      return useSandbox ? sandboxDefault : productionDefault;
    };

    const getLabelMimeType = (format = 'pdf') => {
      const normalized = String(format).toLowerCase();
      if (normalized === 'pdf') return 'application/pdf';
      if (normalized === 'png') return 'image/png';
      return 'application/octet-stream';
    };

    if (carrier.carrierType === 'dpd') {
      const credentials = JSON.parse(carrier.credentials || '{}');
      const endpointCandidates = getDpdEndpointCandidates(credentials);
      const delisId = credentials.delisId || credentials.username;
      const authToken = credentials.authToken || credentials.password;
      const depotNumber = credentials.depotNumber;
      const senderName1 = credentials.senderName1;
      const senderStreet = credentials.senderStreet;
      const senderZipCode = credentials.senderZipCode;
      const senderCity = credentials.senderCity;
      const senderCountry = credentials.senderCountry || 'NL';

      if (!delisId || !authToken || !depotNumber) {
        return res.status(400).json({
          error: 'DPD credentials zijn incompleet',
          details: 'Vereist: Delis ID, auth token/password en depotnummer.',
        });
      }

      const missingSenderFields = [];
      if (!senderName1) missingSenderFields.push('senderName1');
      if (!senderStreet) missingSenderFields.push('senderStreet');
      if (!senderZipCode) missingSenderFields.push('senderZipCode');
      if (!senderCity) missingSenderFields.push('senderCity');
      if (!senderCountry) missingSenderFields.push('senderCountry');

      if (missingSenderFields.length > 0) {
        return res.status(400).json({
          error: 'DPD afzenderprofiel is incompleet',
          details: `Ontbrekende velden: ${missingSenderFields.join(', ')}. Vul deze in via Vervoerders > DPD contractinstellingen.`,
        });
      }

      const labels = [];
      for (let index = 0; index < (packages || []).length; index += 1) {
        const pkg = packages[index];
        const soapBody = buildDpdSoapEnvelope(credentials, pkg);
        let response = null;
        let responseText = '';
        let usedEndpoint = endpointCandidates[0];

        for (const endpoint of endpointCandidates) {
          usedEndpoint = endpoint;
          const candidateResponse = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'text/xml; charset=utf-8',
              SOAPAction: 'http://dpd.com/common/service/types/ShipmentService/3.5/storeOrders',
            },
            body: soapBody,
          });

          const candidateText = await candidateResponse.text();

          if (candidateResponse.status === 404 && endpointCandidates.length > 1) {
            console.warn('DPD endpoint returned 404, trying fallback endpoint', {
              endpoint,
              packageId: pkg.id || index,
            });
            response = candidateResponse;
            responseText = candidateText;
            continue;
          }

          response = candidateResponse;
          responseText = candidateText;
          break;
        }

        if (!response) {
          return res.status(502).json({
            error: 'Failed to generate DPD label',
            details: 'DPD endpoint kon niet worden bereikt.',
          });
        }

        if (!response.ok) {
          const soapFault = extractSoapFault(responseText);
          console.error('DPD label request failed:', response.status, usedEndpoint, responseText);
          const safeBodyPreview = (responseText || '').replace(/\s+/g, ' ').trim().slice(0, 600);
          const fallbackDetails = safeBodyPreview
            ? `DPD HTTP ${response.status} (${usedEndpoint}): ${safeBodyPreview}`
            : `DPD endpoint ${usedEndpoint} returned HTTP ${response.status} without response body`;
          return res.status(502).json({
            error: 'Failed to generate DPD label',
            details: soapFault || fallbackDetails,
          });
        }

        const soapFault = extractSoapFault(responseText);
        if (soapFault) {
          return res.status(502).json({
            error: 'Failed to generate DPD label',
            details: soapFault,
          });
        }

        const labelBase64 = extractLabelBase64(responseText);
        if (!labelBase64) {
          console.error('DPD label response missing label data', responseText);
          return res.status(502).json({
            error: 'DPD label response did not include a PDF',
            details: responseText?.slice(0, 2000),
          });
        }

        labels.push({
          packageId: pkg.id || index,
          carrierType: carrier.carrierType,
          shippingMethod: shippingMethod || null,
          trackingCode: pkg.trackingCode || pkg.orderNumber || `${carrier.carrierType.toUpperCase()}-${Date.now()}-${index}`,
          labelUrl: `data:application/pdf;base64,${labelBase64}`,
        });
      }

      return res.json({ success: true, labels });
    }

    if (carrier.carrierType === 'wegrow') {
      const credentials = JSON.parse(carrier.credentials || '{}');
      const apiKey = credentials.apiKey || process.env.WEGROW_API_KEY;
      const serviceCode = credentials.serviceCode || shippingMethod;

      if (!apiKey) {
        return res.status(400).json({ error: 'WeGrow API key ontbreekt' });
      }

      if (!serviceCode) {
        return res.status(400).json({ error: 'WeGrow service code ontbreekt' });
      }

      const baseUrl = getWeGrowBaseUrl(credentials).replace(/\/+$/, '');
      const apiVersion = credentials.apiVersion || 'v1';

      const senderName = credentials.senderName || 'Dropsyncr Warehouse';
      const senderStreet = credentials.senderStreet || 'Warehouse Street 1';
      const senderPostalCode = credentials.senderPostalCode || '1012AB';
      const senderCity = credentials.senderCity || 'Amsterdam';
      const senderCountry = credentials.senderCountry || 'NL';
      const senderEmail = credentials.senderEmail || 'operations@dropsyncr.local';
      const senderPhone = credentials.senderPhone || '+31000000000';

      const labels = [];
      for (let index = 0; index < (packages || []).length; index += 1) {
        const pkg = packages[index] || {};
        const address = parseAddress(pkg.address || '');
        const recipientName = pkg.customerName || 'Recipient';
        const destinationStreet = pkg.street || address.street || pkg.address || 'Unknown';
        const destinationPostalCode = pkg.zipCode || address.zipCode || pkg.postalCode || '0000AA';
        const destinationCity = pkg.city || address.city || 'Unknown';
        const destinationCountry = pkg.country || 'NL';

        const weightValue = Number(pkg.weightKg ?? pkg.weight ?? 1);
        const payload = {
          label_format: credentials.labelFormat || 'pdf',
          service: {
            code: serviceCode,
          },
          shipment: {
            references: {
              order_reference: String(pkg.orderNumber || pkg.id || `ORD-${Date.now()}-${index}`),
              receiver_reference: pkg.reference2 ? String(pkg.reference2) : null,
            },
            addresses: {
              origin: {
                address: {
                  name: senderName,
                  street: senderStreet,
                  postal_code: senderPostalCode,
                  city: senderCity,
                  iso_country: senderCountry,
                },
                contact: {
                  name: senderName,
                  email: senderEmail,
                  mobile: senderPhone,
                },
              },
              destination: {
                address: {
                  name: recipientName,
                  street: destinationStreet,
                  postal_code: destinationPostalCode,
                  city: destinationCity,
                  iso_country: destinationCountry,
                },
                contact: {
                  name: recipientName,
                  email: pkg.email || null,
                  mobile: pkg.phone || null,
                },
              },
            },
            parcels: [
              {
                uuid_ref: String(pkg.id || `parcel-${Date.now()}-${index}`),
                weight: {
                  value: Number.isFinite(weightValue) && weightValue > 0 ? weightValue : 1,
                  unit: credentials.weightUnit || 'kg',
                },
                package_type: pkg.packageType || 'box',
                goods_description: pkg.goodsDescription || 'General goods',
              },
            ],
          },
          tracking_event_tags: {
            installation_id: String(carrier.installationId),
            carrier_id: String(carrier.id),
          },
        };

        const response = await fetch(`${baseUrl}/shipments/labels`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-key': apiKey,
            'x-version': apiVersion,
          },
          body: JSON.stringify(payload),
        });

        const responseData = await response.json().catch(() => ({}));
        if (!response.ok) {
          return res.status(502).json({
            error: 'Failed to generate WeGrow label',
            details: responseData?.detail || responseData?.error || 'Unknown WeGrow error',
          });
        }

        const shippingLabels = responseData?.labels?.shipping_labels || [];
        const paperlessLabel = responseData?.labels?.paperless_digital_label;
        const firstLabel = shippingLabels[0] || paperlessLabel;

        if (!firstLabel?.base64_label) {
          return res.status(502).json({
            error: 'WeGrow label response did not include a label',
          });
        }

        const format = firstLabel.format || payload.label_format || 'pdf';
        const mimeType = getLabelMimeType(format);

        labels.push({
          packageId: pkg.id || index,
          carrierType: carrier.carrierType,
          shippingMethod: shippingMethod || serviceCode,
          trackingCode: firstLabel.carrier_tracking_id || `${carrier.carrierType.toUpperCase()}-${Date.now()}-${index}`,
          labelUrl: `data:${mimeType};base64,${firstLabel.base64_label}`,
          trackingUrl: firstLabel.carrier_tracking_url || null,
          shipmentId: responseData?.id || null,
        });
      }

      return res.json({ success: true, labels });
    }

    const labels = (packages || []).map((pkg, index) => {
      const timestamp = Date.now();
      const trackingCode = `${carrier.carrierType.toUpperCase()}-${timestamp}-${index}`;
      return {
        packageId: pkg.id || index,
        carrierType: carrier.carrierType,
        shippingMethod: shippingMethod || null,
        trackingCode,
        labelUrl: null,
      };
    });

    res.json({ success: true, labels });
  } catch (error) {
    console.error('Generate carrier labels error:', error);
    res.status(500).json({ error: 'Failed to generate labels' });
  }
};

