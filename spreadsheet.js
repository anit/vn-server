const { google } = require('googleapis');
const config = require('./config');

const sheets = google.sheets({version: "v4", auth: config.googleSheetsApiKey});


async function getSpreadSheetValues (spreadsheetId) {
  return new Promise((resolve, reject) => {
    sheets.spreadsheets.get({ spreadsheetId: spreadsheetId }, (err, res) => {
      if (err) return reject(err);
      sheets.spreadsheets.values.batchGet(
        {
          spreadsheetId: spreadsheetId,
          ranges: res.data.sheets.map(e => e.properties.title)
        },
        (err, res) => {
          if (err) return reject(err);
  
          resolve(res.data);
        }
      );
    });
  
  })
}

async function getDistricts() {
  const response = await getSpreadSheetValues(config.spreadsheetId);
  const values = response.valueRanges[0].values;
  values.splice(0,1);
  return values.map(x => ({
    id: x[0],
    district: x[1],
    chan18: x[2],
    chan45: x[3],
    chan18_2: x[4]
  })).filter(dis => (dis.chan18 || dis.chan45) && dis.id && dis.district);
}
module.exports = {
  getSpreadSheetValues,
  getDistricts
}