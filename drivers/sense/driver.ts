import { OAuth2Driver } from 'homey-oauth2app';
import OndusClient, { APPLIANCE_TYPE_SENSE, APPLIANCE_TYPE_SENSE_PLUS } from '../../lib/OndusClient';

module.exports = class SenseDriver extends OAuth2Driver {
  async onOAuth2Init() {
    this.log('Sense driver initialized');
  }

  async onPairListDevices({ oAuth2Client }: { oAuth2Client: OndusClient }) {
    const devices: any[] = [];
    const locations = await oAuth2Client.getLocations();

    for (const loc of locations) {
      const rooms = await oAuth2Client.getRooms(loc.id);
      for (const room of rooms) {
        let appliances: any[];
        try {
          appliances = await oAuth2Client.getAppliances(loc.id, room.id);
        } catch (err: any) {
          this.log(`Skipping room ${room.id} (${room.name ?? '?'}): ${err.message}`);
          continue;
        }
        for (const app of appliances) {
          if (app.type !== APPLIANCE_TYPE_SENSE && app.type !== APPLIANCE_TYPE_SENSE_PLUS) continue;
          const appId = app.appliance_id ?? app.id;
          devices.push({
            name: app.name || `Sense (${room.name})`,
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
