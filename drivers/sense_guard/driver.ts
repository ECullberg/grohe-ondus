import { OAuth2Driver } from 'homey-oauth2app';
import OndusClient, { APPLIANCE_TYPE_SENSE_GUARD } from '../../lib/OndusClient';

module.exports = class SenseGuardDriver extends OAuth2Driver {
  async onOAuth2Init() {
    this.log('Sense Guard driver initialized');
  }

  async onPairListDevices({ oAuth2Client }: { oAuth2Client: OndusClient }) {
    const devices: any[] = [];
    const locations = await oAuth2Client.getLocations();

    for (const loc of locations) {
      const rooms = await oAuth2Client.getRooms(loc.id);
      for (const room of rooms) {
        const appliances = await oAuth2Client.getAppliances(loc.id, room.id);
        for (const app of appliances) {
          if (app.type !== APPLIANCE_TYPE_SENSE_GUARD) continue;
          const appId = app.appliance_id ?? app.id;
          devices.push({
            name: app.name || `Sense Guard (${room.name})`,
            data: { id: appId },
            store: {
              locationId: loc.id,
              roomId: room.id,
              applianceId: appId,
              applianceType: app.type,
            },
          });
        }
      }
    }

    return devices;
  }
};
