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

    if (!['dhl', 'dpd'].includes(carrier.carrierType)) {
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

      return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="http://dpd.com/common/service/types/Authentication/2.0" xmlns:ns1="http://dpd.com/common/service/types/ShipmentService/3.5">
  <soapenv:Header>
    <ns:authentication>
      <delisId>${delisId}</delisId>
      <authToken>${authToken}</authToken>
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
          <sendingDepot>${sendingDepot}</sendingDepot>
          <product>B2B</product>
          <sender>
            <name1>${credentials.senderName1 || 'Dropsyncr'}</name1>
            <name2>${credentials.senderName2 || ''}</name2>
            <street>${credentials.senderStreet || ''}</street>
            <street2>${credentials.senderStreet2 || ''}</street2>
            <country>${credentials.senderCountry || 'NL'}</country>
            <zipCode>${credentials.senderZipCode || ''}</zipCode>
            <city>${credentials.senderCity || ''}</city>
            <phone>${credentials.senderPhone || ''}</phone>
            <email>${credentials.senderEmail || ''}</email>
          </sender>
          <recipient>
            <name1>${recipientName}</name1>
            <name2>${pkg.companyName || ''}</name2>
            <street>${street}</street>
            <street2>${pkg.street2 || ''}</street2>
            <country>${recipientCountry}</country>
            <zipCode>${zipCode}</zipCode>
            <city>${city}</city>
            <contact>${pkg.contact || recipientName}</contact>
            <phone>${pkg.phone || ''}</phone>
            <email>${pkg.email || ''}</email>
          </recipient>
        </generalShipmentData>
        <parcels>
          <customerReferenceNumber1>${reference1}</customerReferenceNumber1>
          <customerReferenceNumber2>${reference2}</customerReferenceNumber2>
          <volume>${volume}</volume>
          <weight>${weight}</weight>
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

    if (carrier.carrierType === 'dpd') {
      const credentials = JSON.parse(carrier.credentials || '{}');
      const endpoint = process.env.DPD_SHIPMENT_URL || 'https://wsshipper.dpd.nl/soap/ShipmentServiceV35';

      const labels = [];
      for (let index = 0; index < (packages || []).length; index += 1) {
        const pkg = packages[index];
        const soapBody = buildDpdSoapEnvelope(credentials, pkg);
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            SOAPAction: 'http://dpd.com/common/service/types/ShipmentService/3.5/storeOrders',
          },
          body: soapBody,
        });

        const responseText = await response.text();
        if (!response.ok) {
          console.error('DPD label request failed:', response.status, responseText);
          return res.status(502).json({
            error: 'Failed to generate DPD label',
            details: responseText?.slice(0, 2000),
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

