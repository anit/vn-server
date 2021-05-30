const Influx = require('influx');
const config = require('./config');


// a custom schema
const client = new Influx.InfluxDB({
  ...config.influx,
  schema: [
    {
      measurement: 'cw_api_err',
      fields: {
        text: Influx.FieldType.STRING,
        mobile: Influx.FieldType.STRING
      },
      tags: ['api', 'status']
    },
    {
      measurement: 'scheduled',
      fields: {
        benes: Influx.FieldType.INTEGER
      },
      tags: ['center_id', 'dose']
    },
    {
      measurement: 'scheduled_time',
      fields: {
        timeTaken: Influx.FieldType.INTEGER
      },
      tags: ['center']
    }
  ]
})

module.exports = {
  inflxCwApi: (data) => {
    if (!data) return;
    const { text, api, status, mobile } = data;      
    client.writePoints([{
      measurement: 'cw_api_err',
      fields: { text, mobile: mobile || 'NA' },
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
    }])
    .then(w => console.log('Successfully Wrote A Schedule.........', data))
    .catch(err => {
      console.error(`Error saving data to InfluxDB! ${err.stack}`)
    })
  },

  inflxScheduledTime: (data) => {
    if (!data) return;
    const { center, timeTaken } = data;      
    client.writePoints([{
      measurement: 'scheduled_time',
      fields: { timeTaken },
      tags: { center }
    }])
    .then(w => console.log('Successfully Wrote A Schedule Time.........', data))
    .catch(err => {
      console.error(`Error saving data to InfluxDB! ${err.stack}`)
    })
  }
}