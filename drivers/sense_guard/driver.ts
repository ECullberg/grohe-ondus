import { OAuth2Driver } from 'homey-oauth2app';
import OndusClient, { APPLIANCE_TYPE_SENSE_GUARD } from '../../lib/OndusClient';

module.exports = class SenseGuardDriver extends OAuth2Driver {
  async onOAuth2Init() {
    this.log('Sense Guard driver initialized');

    // Flow actions
    this.homey.flow
      .getActionCard('open_water')
      .registerRunListener(async (args: any) => args.device.openValve());

    this.homey.flow
      .getActionCard('close_water')
      .registerRunListener(async (args: any) => args.device.closeValve());

    this.homey.flow
      .getActionCard('request_measurement_now')
      .registerRunListener(async (args: any) => args.device.requestPoll());

    // Flow conditions (Sense Guard only)
    this.homey.flow
      .getConditionCard('valve_is_open')
      .registerRunListener(async (args: any) => args.device.isValveOpen());
  }

  async onPairListDevices({ oAuth2Client }: { oAuth2Client: OndusClient }) {
    const devices: any[] = [];
    this.log('Fetching locations...');
    const locations = await oAuth2Client.getLocations();
    this.log(`Got ${locations.length} locations`);

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
