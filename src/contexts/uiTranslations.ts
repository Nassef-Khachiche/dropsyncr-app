import type { LanguageCode } from './LanguageContext';

interface PhraseEntry {
  en: string;
  nl: string;
  de: string;
}

const phrases: PhraseEntry[] = [
  { en: 'Welcome to Dropsyncr', nl: 'Welcome to Dropsyncr', de: 'Willkommen bei Dropsyncr' },
  { en: 'Sign in to your account to continue', nl: 'Meld je aan om verder te gaan', de: 'Melde dich an, um fortzufahren' },
  { en: 'Password', nl: 'Wachtwoord', de: 'Passwort' },
  { en: 'Enter your password', nl: 'Voer je wachtwoord in', de: 'Gib dein Passwort ein' },
  { en: 'Signing in...', nl: 'Aanmelden...', de: 'Anmeldung...' },
  { en: 'Sign In', nl: 'Inloggen', de: 'Anmelden' },

  { en: 'Orders', nl: 'Bestellingen', de: 'Bestellungen' },
  { en: 'Manage and process all your open orders', nl: 'Beheer en verwerk al je openstaande orders', de: 'Verwalte und bearbeite alle offenen Bestellungen' },
  { en: 'Delete selected', nl: 'Verwijder geselecteerd', de: 'Ausgewählte löschen' },
  { en: 'Export', nl: 'Exporteren', de: 'Exportieren' },
  { en: 'Search by order number, customer or tracking...', nl: 'Zoek op ordernummer, klant of tracking...', de: 'Suche nach Bestellnummer, Kunde oder Tracking...' },
  { en: 'All stores', nl: 'Alle stores', de: 'Alle Stores' },
  { en: 'All statuses', nl: 'Alle statussen', de: 'Alle Status' },
  { en: 'Pending', nl: 'Openstaand', de: 'Offen' },
  { en: 'Shipped', nl: 'Verzonden', de: 'Versendet' },
  { en: 'Order number', nl: 'Ordernummer', de: 'Bestellnummer' },
  { en: 'Customer name', nl: 'Klantnaam', de: 'Kundenname' },
  { en: 'Store name', nl: 'Store naam', de: 'Store-Name' },
  { en: 'Item count', nl: 'Aantal items', de: 'Artikelanzahl' },
  { en: 'Latest delivery date', nl: 'Uiterste leverdatum', de: 'Spätestes Lieferdatum' },
  { en: 'Supplier tracking number', nl: 'Trackingnummer leverancier', de: 'Lieferanten-Trackingnummer' },
  { en: 'Status', nl: 'Status', de: 'Status' },
  { en: 'Actions', nl: 'Acties', de: 'Aktionen' },
  { en: 'No orders found', nl: 'Geen orders gevonden', de: 'Keine Bestellungen gefunden' },
  { en: 'Generate label', nl: 'Label genereren', de: 'Label erstellen' },
  { en: 'Recipient', nl: 'Ontvanger', de: 'Empfänger' },
  { en: 'Address', nl: 'Adres', de: 'Adresse' },
  { en: 'Order date', nl: 'Besteldatum', de: 'Bestelldatum' },
  { en: 'Drop-off date', nl: 'Inleverdatum', de: 'Abgabedatum' },
  { en: 'Platform', nl: 'Platform', de: 'Plattform' },
  { en: 'Order status', nl: 'Orderstatus', de: 'Bestellstatus' },
  { en: 'Order value', nl: 'Orderwaarde', de: 'Bestellwert' },
  { en: 'Shipment status', nl: 'Zendingstatus', de: 'Sendungsstatus' },
  { en: 'Amount ordered', nl: 'Aantal besteld', de: 'Bestellte Menge' },
  { en: 'Price', nl: 'Prijs', de: 'Preis' },
  { en: 'Weight', nl: 'Gewicht', de: 'Gewicht' },
  { en: 'orders found', nl: 'orders gevonden', de: 'Bestellungen gefunden' },
  { en: 'Open', nl: 'Openstaand', de: 'Offen' },
  { en: 'Label preview', nl: 'Label preview', de: 'Label-Vorschau' },
  { en: 'Open PDF', nl: 'Open PDF', de: 'PDF öffnen' },
  { en: 'Contract', nl: 'Contract', de: 'Vertrag' },
  { en: 'Loading contracts...', nl: 'Contracten laden...', de: 'Verträge werden geladen...' },
  { en: 'No active contracts', nl: 'Geen actieve contracten', de: 'Keine aktiven Verträge' },
  { en: 'Carrier tracking', nl: 'Carrier tracking', de: 'Carrier-Tracking' },
  { en: 'Tracking URL', nl: 'Tracking URL', de: 'Tracking-URL' },
  { en: 'Close', nl: 'Sluiten', de: 'Schließen' },

  { en: 'Labels Printen', nl: 'Labels Printen', de: 'Labels drucken' },
  { en: 'Scan packages and generate shipping labels', nl: 'Scan pakketten en genereer verzendlabels', de: 'Pakete scannen und Versandlabels erstellen' },
  { en: 'Select an installation first in the top-right to generate labels', nl: 'Selecteer eerst een installatie rechtsboven om labels te genereren', de: 'Wähle oben rechts zuerst eine Installation, um Labels zu erstellen' },
  { en: 'Barcode Scanner', nl: 'Barcode Scanner', de: 'Barcode-Scanner' },
  { en: 'Scan the tracking barcode on the incoming package. The system automatically finds the matching customer order and directly generates a shipping label.', nl: 'Scan de tracking barcode op het binnengekomen pakket. Het systeem zoekt automatisch de bijbehorende klantorder en genereert direct een verzendlabel.', de: 'Scanne den Tracking-Barcode auf dem eingehenden Paket. Das System findet automatisch die passende Kundenbestellung und erstellt direkt ein Versandlabel.' },
  { en: 'Scan barcode or enter tracking code...', nl: 'Scan barcode of voer tracking code in...', de: 'Barcode scannen oder Tracking-Code eingeben...' },
  { en: 'Scan', nl: 'Scan', de: 'Scannen' },
  { en: 'Scanned', nl: 'Gescand', de: 'Gescannt' },
  { en: 'Labels ready', nl: 'Labels Klaar', de: 'Labels bereit' },
  { en: 'Selected', nl: 'Geselecteerd', de: 'Ausgewählt' },
  { en: 'Scanned Packages', nl: 'Gescande Pakketten', de: 'Gescannte Pakete' },

  { en: 'Tracking', nl: 'Tracking', de: 'Sendungsverfolgung' },
  { en: 'Total Trackings', nl: 'Totaal Trackings', de: 'Tracking gesamt' },
  { en: 'Linked', nl: 'Gekoppeld', de: 'Verknüpft' },
  { en: 'Waiting for link', nl: 'Wacht op Koppeling', de: 'Wartet auf Verknüpfung' },
  { en: 'Email Import', nl: 'Email Import', de: 'E-Mail-Import' },
  { en: 'Automatic email parsing is only available with backend integration. This feature scans your inbox for supplier tracking emails.', nl: 'Automatische email parsing is alleen beschikbaar met backend integratie. Deze functie scant je inbox voor tracking emails van leveranciers.', de: 'Automatisches E-Mail-Parsing ist nur mit Backend-Integration verfügbar. Diese Funktion scannt dein Postfach nach Tracking-E-Mails von Lieferanten.' },
  { en: 'Scan Inbox for Trackings', nl: 'Scan Inbox voor Trackings', de: 'Posteingang nach Trackings scannen' },
  { en: 'Requires Supabase backend configuration', nl: 'Vereist Supabase backend configuratie', de: 'Erfordert Supabase-Backend-Konfiguration' },
  { en: 'Manually Add', nl: 'Handmatig Toevoegen', de: 'Manuell hinzufügen' },
  { en: 'Single Tracking Code', nl: 'Enkele Tracking Code', de: 'Einzelner Tracking-Code' },
  { en: 'Add', nl: 'Add', de: 'Hinzufügen' },
  { en: 'Bulk Import (one per line)', nl: 'Bulk Import (één per regel)', de: 'Massenimport (einer pro Zeile)' },
  { en: 'Bulk Add', nl: 'Bulk Toevoegen', de: 'Massenhaft hinzufügen' },
  { en: 'WeGrow Tracking Refresh', nl: 'WeGrow Tracking Refresh', de: 'WeGrow-Tracking aktualisieren' },
  { en: 'Carrier ID', nl: 'Carrier ID', de: 'Carrier-ID' },
  { en: 'Shipment ID', nl: 'Shipment ID', de: 'Sendungs-ID' },
  { en: 'Refresh...', nl: 'Verversen...', de: 'Aktualisieren...' },
  { en: 'Refresh WeGrow Status', nl: 'Ververs WeGrow Status', de: 'WeGrow-Status aktualisieren' },
  { en: 'Tracking Codes Overview', nl: 'Tracking Codes Overzicht', de: 'Tracking-Code-Übersicht' },
  { en: 'Supplier', nl: 'Leverancier', de: 'Lieferant' },
  { en: 'Customer', nl: 'Klant', de: 'Kunde' },
  { en: 'Date', nl: 'Datum', de: 'Datum' },
  { en: 'Source', nl: 'Bron', de: 'Quelle' },
  { en: 'Manual', nl: 'Handmatig', de: 'Manuell' },
  { en: 'Waiting for order', nl: 'Wacht op Order', de: 'Wartet auf Bestellung' },
  { en: 'Link', nl: 'Koppel', de: 'Verknüpfen' },

  { en: 'Integrations', nl: 'Integraties', de: 'Integrationen' },
  { en: 'Connect your favorite sales channels and marketplaces', nl: 'Koppel je favoriete verkoopkanalen en marketplaces', de: 'Verbinde deine bevorzugten Verkaufskanäle und Marktplätze' },
  { en: 'Connected Stores', nl: 'Gekoppelde Stores', de: 'Verbundene Stores' },
  { en: 'Filter by store', nl: 'Filter op store', de: 'Nach Store filtern' },
  { en: 'Store:', nl: 'Store:', de: 'Store:' },
  { en: 'Connected', nl: 'Gekoppeld', de: 'Verbunden' },
  { en: 'Settings', nl: 'Instellingen', de: 'Einstellungen' },
  { en: 'Disconnect', nl: 'Ontkoppelen', de: 'Trennen' },
  { en: 'Sync Orders', nl: 'Sync Orders', de: 'Bestellungen synchronisieren' },
  { en: 'Available Integrations', nl: 'Beschikbare Integraties', de: 'Verfügbare Integrationen' },
  { en: 'You can add multiple accounts per platform', nl: 'Je kunt meerdere accounts per platform toevoegen', de: 'Du kannst mehrere Konten pro Plattform hinzufügen' },
  { en: 'Add New', nl: 'Nieuw Toevoegen', de: 'Neu hinzufügen' },
  { en: 'Multi-channel sales', nl: 'Multi-channel verkopen', de: 'Multichannel-Verkauf' },
  { en: 'Automatic sync', nl: 'Automatische sync', de: 'Automatische Synchronisierung' },
  { en: 'Real-time updates', nl: 'Real-time updates', de: 'Echtzeit-Updates' },
  { en: 'Central dashboard', nl: 'Centraal dashboard', de: 'Zentrales Dashboard' },
  { en: 'How to connect?', nl: 'Hoe koppel je?', de: 'Wie verbindest du?' },
  { en: 'Shop name', nl: 'Shopnaam', de: 'Shopname' },
  { en: 'e.g. My Webshop', nl: 'Bijv. Mijn Webshop', de: 'z. B. Mein Webshop' },
  { en: 'Client ID', nl: 'Client ID', de: 'Client-ID' },
  { en: 'Client Secret', nl: 'Client Secret', de: 'Client-Secret' },
  { en: 'API Key', nl: 'API Key', de: 'API-Schlüssel' },
  { en: 'API Secret', nl: 'API Secret', de: 'API-Secret' },
  { en: 'Process orders in shop', nl: 'Verwerk bestellingen in shop', de: 'Bestellungen im Shop verarbeiten' },
  { en: 'Active', nl: 'Actief', de: 'Aktiv' },
  { en: 'Save changes', nl: 'Wijzigingen Opslaan', de: 'Änderungen speichern' },
  { en: 'Connect', nl: 'Koppelen', de: 'Verbinden' },

  { en: 'Carriers', nl: 'Vervoerders', de: 'Versanddienstleister' },
  { en: 'Manage your shipping contracts and carrier integrations', nl: 'Beheer je verzendcontracten en vervoerdersintegraties', de: 'Verwalte deine Versandverträge und Carrier-Integrationen' },
  { en: 'Add Contract', nl: 'Contract Toevoegen', de: 'Vertrag hinzufügen' },
  { en: 'Active Contracts', nl: 'Actieve Contracten', de: 'Aktive Verträge' },
  { en: 'Inactive', nl: 'Inactief', de: 'Inaktiv' },
  { en: 'No contracts yet', nl: 'Nog geen contracten', de: 'Noch keine Verträge' },
  { en: 'Add your first shipping contract to print labels', nl: 'Voeg je eerste verzendcontract toe om labels te kunnen printen', de: 'Füge deinen ersten Versandvertrag hinzu, um Labels zu drucken' },
  { en: 'Supported Carriers', nl: 'Ondersteunde Vervoerders', de: 'Unterstützte Versanddienstleister' },
  { en: 'Carrier', nl: 'Vervoerder', de: 'Versanddienstleister' },
  { en: 'Select a carrier...', nl: 'Selecteer een vervoerder...', de: 'Versanddienstleister auswählen...' },
  { en: 'Save', nl: 'Opslaan', de: 'Speichern' },

  { en: 'Administrative', nl: 'Administratief', de: 'Verwaltung' },
  { en: 'Manage administrators and installations', nl: 'Beheer administrators en installaties', de: 'Administratoren und Installationen verwalten' },
  { en: 'Administrators', nl: 'Administrators', de: 'Administratoren' },
  { en: 'Installations', nl: 'Installaties', de: 'Installationen' },

  { en: 'New Administrator', nl: 'Nieuwe Administrator', de: 'Neuer Administrator' },
  { en: 'Search by email or name...', nl: 'Zoek op email of naam...', de: 'Nach E-Mail oder Name suchen...' },
  { en: 'Name', nl: 'Naam', de: 'Name' },
  { en: 'Role', nl: 'Rol', de: 'Rolle' },
  { en: 'No users found', nl: 'Geen gebruikers gevonden', de: 'Keine Benutzer gefunden' },
  { en: 'Global Admin', nl: 'Global Admin', de: 'Globaler Admin' },
  { en: 'User', nl: 'Gebruiker', de: 'Benutzer' },
  { en: 'Edit Administrator', nl: 'Bewerk Administrator', de: 'Administrator bearbeiten' },
  { en: 'Cancel', nl: 'Annuleren', de: 'Abbrechen' },
  { en: 'Update', nl: 'Bijwerken', de: 'Aktualisieren' },
  { en: 'Create', nl: 'Aanmaken', de: 'Erstellen' },

  { en: 'New Installation', nl: 'Nieuwe Installatie', de: 'Neue Installation' },
  { en: 'Search installations...', nl: 'Zoek installaties...', de: 'Installationen suchen...' },
  { en: 'Type', nl: 'Type', de: 'Typ' },
  { en: 'All types', nl: 'Alle types', de: 'Alle Typen' },
  { en: 'Own stores', nl: 'Eigen stores', de: 'Eigene Stores' },
  { en: 'Country', nl: 'Land', de: 'Land' },
  { en: 'Users', nl: 'Gebruikers', de: 'Benutzer' },
  { en: 'Statistics', nl: 'Statistieken', de: 'Statistiken' },
  { en: 'No installations found', nl: 'Geen installaties gevonden', de: 'Keine Installationen gefunden' },

  { en: 'Automation Rules', nl: 'Automatiserings Regels', de: 'Automatisierungsregeln' },
  { en: 'Set which carrier is used for which country in orders', nl: 'Stel in welk land welke vervoerder gebruikt wordt voor orders', de: 'Lege fest, welcher Versanddienstleister für welches Land verwendet wird' },
  { en: 'New rule', nl: 'Nieuwe regel', de: 'Neue Regel' },
  { en: 'Total rules', nl: 'Totaal regels', de: 'Regeln gesamt' },
  { en: 'Active rules', nl: 'Actieve regels', de: 'Aktive Regeln' },
  { en: 'Context', nl: 'Context', de: 'Kontext' },
  { en: 'All installations', nl: 'Alle installaties', de: 'Alle Installationen' },
  { en: 'Selected installation', nl: 'Geselecteerde installatie', de: 'Ausgewählte Installation' },
  { en: 'Rule overview', nl: 'Regeloverzicht', de: 'Regelübersicht' },
  { en: 'Order is executed from top to bottom', nl: 'Volgorde wordt van boven naar beneden uitgevoerd', de: 'Reihenfolge wird von oben nach unten ausgeführt' },
  { en: 'Rule', nl: 'Regel', de: 'Regel' },
  { en: 'If country', nl: 'Als land', de: 'Wenn Land' },
  { en: 'Use carrier', nl: 'Gebruik vervoerder', de: 'Verwende Versanddienstleister' },
  { en: 'Priority', nl: 'Prioriteit', de: 'Priorität' },
  { en: 'No rules created yet', nl: 'Nog geen regels aangemaakt', de: 'Noch keine Regeln erstellt' },
  { en: 'Edit rule', nl: 'Regel bewerken', de: 'Regel bearbeiten' },
  { en: 'Rule name', nl: 'Regelnaam', de: 'Regelname' },
  { en: 'Country (code or name)', nl: 'Land (code of naam)', de: 'Land (Code oder Name)' },
  { en: 'Carrier', nl: 'Vervoerder', de: 'Versanddienstleister' },
  { en: 'Rule active', nl: 'Regel actief', de: 'Regel aktiv' },
];

const normalizedLookup = new Map<string, PhraseEntry>();
for (const phrase of phrases) {
  normalizedLookup.set(phrase.en.toLowerCase(), phrase);
  normalizedLookup.set(phrase.nl.toLowerCase(), phrase);
  normalizedLookup.set(phrase.de.toLowerCase(), phrase);
}

const dynamicPatterns = [
  {
    matcher: /^(Gekoppelde Stores|Connected Stores|Verbundene Stores) \((\d+)\)$/i,
    render: (language: LanguageCode, count: string) => {
      if (language === 'nl') return `Gekoppelde Stores (${count})`;
      if (language === 'de') return `Verbundene Stores (${count})`;
      return `Connected Stores (${count})`;
    },
  },
  {
    matcher: /^(Actieve Contracten|Active Contracts|Aktive Verträge) \((\d+)\)$/i,
    render: (language: LanguageCode, count: string) => {
      if (language === 'nl') return `Actieve Contracten (${count})`;
      if (language === 'de') return `Aktive Verträge (${count})`;
      return `Active Contracts (${count})`;
    },
  },
  {
    matcher: /^(Gescande Pakketten|Scanned Packages|Gescannte Pakete) \((\d+)\)$/i,
    render: (language: LanguageCode, count: string) => {
      if (language === 'nl') return `Gescande Pakketten (${count})`;
      if (language === 'de') return `Gescannte Pakete (${count})`;
      return `Scanned Packages (${count})`;
    },
  },
  {
    matcher: /^(\d+) (orders gevonden|orders found|Bestellungen gefunden)$/i,
    render: (language: LanguageCode, count: string) => {
      if (language === 'nl') return `${count} orders gevonden`;
      if (language === 'de') return `${count} Bestellungen gefunden`;
      return `${count} orders found`;
    },
  },
];

export const translateUiText = (input: string, language: LanguageCode): string => {
  if (!input) return input;

  const trimmed = input.trim();
  if (!trimmed) return input;

  for (const pattern of dynamicPatterns) {
    const match = trimmed.match(pattern.matcher);
    if (match) {
      const translated = pattern.render(language, match[2] || match[1]);
      return input.replace(trimmed, translated);
    }
  }

  const phrase = normalizedLookup.get(trimmed.toLowerCase());
  if (!phrase) return input;

  const translated = phrase[language];
  return input.replace(trimmed, translated);
};
