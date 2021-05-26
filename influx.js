const Influx = require('influx');
const config = require('./config');


// a custom schema
const client = new Influx.InfluxDB({
  ...config.influx,
  schema: [
    {
      measurement: 'cw_api_err',
      fields: {
        text: Influx.FieldType.STRING
      },
      tags: ['api', 'status']
    },
    {
      measurement: 'scheduled',
      fields: {
        benes: Influx.FieldType.INTEGER
      },
      tags: ['center_id', 'dose']
    }
  ]
})

module.exports = {
  inflxCwApi: (data) => {
    if (!data) return;
    const { text, api, status, dose } = data;      
    client.writePoints([{
      measurement: 'cw_api_err',
      fields: { text },
      tags: { api, status }
    }]).catch(err => {
      console.error(`Error saving data to InfluxDB! ${err.stack}`)
    })
  },

  inflxScheduled: (data) => {
    if (!data) return;
    const { dose, center_id, benes } = data;      
    client.writePoints([{
      measurement: 'scheduled',
      fields: { benes },
      tags: { center_id, dose }
    }]).catch(err => {
      console.error(`Error saving data to InfluxDB! ${err.stack}`)
    })
  }
}