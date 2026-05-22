export type NotificationSeverity = 'info' | 'warning' | 'critical';

export interface NotificationEntry {
  sv: string;
  en: string;
  severity: NotificationSeverity;
}

// Keys are "category,type" matching NOTIFICATION_TYPES in gkreitz/homeassistant-grohe_sense/sensor.py
export const NOTIFICATION_TYPES: Record<string, NotificationEntry> = {
  // Category 10 – info
  '10,60':  { sv: 'Firmware-uppdatering tillgänglig',                          en: 'Firmware update available',                        severity: 'info'     },
  '10,460': { sv: 'Firmware-uppdatering tillgänglig',                          en: 'Firmware update available',                        severity: 'info'     },

  // Category 20 – warnings
  '20,11':  { sv: 'Lågt batteri',                                               en: 'Battery low',                                      severity: 'warning'  },
  '20,12':  { sv: 'Batteri slut',                                               en: 'Battery empty',                                    severity: 'warning'  },
  '20,20':  { sv: 'Under temperaturgräns',                                      en: 'Below temperature threshold',                      severity: 'warning'  },
  '20,21':  { sv: 'Över temperaturgräns',                                       en: 'Above temperature threshold',                      severity: 'warning'  },
  '20,30':  { sv: 'Under luftfuktighetsgräns',                                  en: 'Below humidity threshold',                         severity: 'warning'  },
  '20,31':  { sv: 'Över luftfuktighetsgräns',                                   en: 'Above humidity threshold',                         severity: 'warning'  },
  '20,40':  { sv: 'Frostvarning',                                               en: 'Frost warning',                                    severity: 'warning'  },
  '20,80':  { sv: 'WiFi-anslutning förlorad',                                   en: 'Lost wifi',                                        severity: 'warning'  },
  '20,320': { sv: 'Ovanlig vattenförbrukning (vatten avstängt)',                 en: 'Unusual water consumption (water shut off)',        severity: 'warning'  },
  '20,321': { sv: 'Ovanlig vattenförbrukning (vatten EJ avstängt)',              en: 'Unusual water consumption (water not shut off)',    severity: 'warning'  },
  '20,330': { sv: 'Mikroläckage upptäckt',                                      en: 'Micro leakage detected',                           severity: 'warning'  },
  '20,340': { sv: 'Frostvarning',                                               en: 'Frost warning',                                    severity: 'warning'  },
  '20,380': { sv: 'WiFi-anslutning förlorad',                                   en: 'Lost wifi',                                        severity: 'warning'  },

  // Category 30 – critical
  '30,0':   { sv: 'Översvämning',                                               en: 'Flooding',                                         severity: 'critical' },
  '30,310': { sv: 'Rörbrott',                                                   en: 'Pipe break',                                       severity: 'critical' },
  '30,400': { sv: 'Maxvolym uppnådd',                                           en: 'Maximum volume reached',                           severity: 'critical' },
  '30,430': { sv: 'Vatten upptäckt av Sense (vatten avstängt)',                  en: 'Sense detected water (water shut off)',             severity: 'critical' },
  '30,431': { sv: 'Vatten upptäckt av Sense (vatten EJ avstängt)',               en: 'Sense detected water (water not shut off)',         severity: 'critical' },
};

export function getNotification(category: number, type: number): NotificationEntry | undefined {
  return NOTIFICATION_TYPES[`${category},${type}`];
}
