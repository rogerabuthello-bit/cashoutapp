import Papa from 'papaparse';

export interface CSVLineItem {
  user_closed: string;
  register_email: string;
  check_closed_at: string;
  subtotal_cents: number;
  tax_cents: number;
  amex_cents: number;
  visa_cents: number;
  mc_cents: number;
  debit_cents: number;
  gratuity_cents: number;
  party_code?: string;
}

export function parsePOSCSV(csvString: string): CSVLineItem[] {
  const { data } = Papa.parse(csvString, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
    transform: (value) => value.trim()
  });

  const parseMoney = (val: string): number => {
    const n = parseFloat((val || '').replace(/[$,]/g, ''));
    return isNaN(n) ? 0 : Math.round(n * 100);
  };

  return (data as any[]).map(row => ({
    user_closed: (row['User Closed'] || row['user_closed'] || '').trim(),
    register_email: (row['Register Email'] || row['register_email'] || '').trim(),
    check_closed_at: row['Check Closed At'] || row['check_closed_at'] || '',
    subtotal_cents:  parseMoney(row['Subtotal']  || row['subtotal']  || '0'),
    tax_cents:       parseMoney(row['Tax']        || row['tax']        || '0'),
    amex_cents:      parseMoney(row['AMEX']       || row['amex']       || '0'),
    visa_cents:      parseMoney(row['VISA']       || row['visa']       || '0'),
    mc_cents:        parseMoney(row['MC']          || row['mc']          || '0'),
    debit_cents:     parseMoney(row['Debit']      || row['debit']      || '0'),
    gratuity_cents:  parseMoney(row['Gratuity']   || row['gratuity']   || '0'),
    party_code: row['Party Code'] || row['party_code'],
  }));
}

export function summarizeByServer(items: CSVLineItem[], barCutoffHour: number = 16) {
  const summary: Record<string, any> = {};

  items.forEach(item => {
    if (!summary[item.user_closed]) {
      summary[item.user_closed] = {
        gross_cents: 0,
        cards_cents: 0,
        gratuity_cents: 0,
        house_tips_cents: 0,
        bar_am_tips_cents: 0,
        bar_pm_tips_cents: 0,
        items: []
      };
    }
    
    summary[item.user_closed].gross_cents += item.subtotal_cents + item.tax_cents;
    summary[item.user_closed].cards_cents += item.amex_cents + item.visa_cents + item.mc_cents + item.debit_cents;
    summary[item.user_closed].gratuity_cents += item.gratuity_cents;

    // AM/PM Split logic for Bar users.
    // NOTE: Detection uses name substring 'bar'. For precision, match against
    // a register_email allowlist or a dedicated bartender role flag in the tenant settings.
    const closedDate = new Date(item.check_closed_at);
    const hour = isNaN(closedDate.getTime()) ? 20 : closedDate.getHours(); // default PM if unparseable

    if (item.user_closed.toLowerCase().includes('bar')) {
      if (hour < barCutoffHour) {
        summary[item.user_closed].bar_am_tips_cents += item.gratuity_cents;
      } else {
        summary[item.user_closed].bar_pm_tips_cents += item.gratuity_cents;
      }
    } else {
      summary[item.user_closed].house_tips_cents += item.gratuity_cents;
    }

    summary[item.user_closed].items.push(item);
  });

  return summary;
}
