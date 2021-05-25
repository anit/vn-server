const Influx = require('influx');
const config = require('./config');

// a custom schema
const client = new Influx.InfluxDB({
  ...config.influx,
  schema: [
    {
      measurement: 'slots_captured',
      fields: {
        center: Influx.FieldType.STRING,
        available1: Influx.FieldType.INTEGER,
        available2: Influx.FieldType.INTEGER,
        vaccine: Influx.FieldType.STRING,
      },
      tags: ['district', 'pincode', 'minAge']
    },
    {
      measurement: 'members_count',
      fields: {
        count: Influx.FieldType.INTEGER
      },
      tags: ['channel']
    }
  ]
})

module.exports = {
  inflxSlotsCaptured: (data) => {
    if (!data || !data.length) return;

    client.writePoints(data.map(x => {
      const { pincode, center, available1, available2, vaccine, district } = x;      

      return {
        measurement: 'slots_captured',
        fields: { center, available1, available2, vaccine },
        tags: { district, pincode, minAge: x.minAge || 18 }
      } 
    })).catch(err => {
      console.error(`Error saving data to InfluxDB! ${err.stack}`)
    })
  },

  inflxMemCount: (data) => {
    const filteredData = data.filter(x => !!x.count);

    client.writePoints(filteredData.map(x => {
      const { channel, count } = x;
      return {
        measurement: 'members_count',
        fields: { count: count },
        tags: { channel }
     } 
    })).catch(err => {
      console.error(`Error saving memcount to InfluxDB! ${err.stack}`)
    })
  }
}