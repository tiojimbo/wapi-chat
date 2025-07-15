const axios = require('axios');

const CLICKUP_CLIENT_ID = process.env.CLICKUP_CLIENT_ID;
const CLICKUP_CLIENT_SECRET = process.env.CLICKUP_CLIENT_SECRET;
const CLICKUP_REDIRECT_URI = process.env.CLICKUP_REDIRECT_URI;

class ClickUpService {
  static getAuthUrl(state = '') {
    const baseUrl = 'https://app.clickup.com/api';
    return `${baseUrl}/?client_id=${CLICKUP_CLIENT_ID}&redirect_uri=${encodeURIComponent(CLICKUP_REDIRECT_URI)}&state=${state}`;
  }

  static async getToken(code) {
    const url = 'https://api.clickup.com/api/v2/oauth/token';
    const response = await axios.post(url, {
      client_id: CLICKUP_CLIENT_ID,
      client_secret: CLICKUP_CLIENT_SECRET,
      code,
      redirect_uri: CLICKUP_REDIRECT_URI,
    });
    return response.data;
  }

  static async getUser(access_token) {
    const url = 'https://api.clickup.com/api/v2/user';
    const response = await axios.get(url, {
      headers: {
        Authorization: access_token,
      },
    });
    return response.data;
  }
}

module.exports = ClickUpService; 