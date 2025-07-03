const https = require('https');
const { flagEmojis, defaultLocalGeo, defaultUnknownGeo } = require('../config/constants');

async function getGeolocation(ip) {
  return new Promise((resolve) => {
    // Clean IPv6-mapped IPv4 addresses (::ffff:1.2.3.4 -> 1.2.3.4)
    let cleanIP = ip;
    if (ip.startsWith('::ffff:')) {
      cleanIP = ip.substring(7);
    }
    
    // Skip geolocation for localhost/private IPs
    if (isLocalIP(cleanIP)) {
      resolve(defaultLocalGeo);
      return;
    }

    const options = {
      hostname: 'ipapi.co',
      port: 443,
      path: `/${cleanIP}/json/`,
      method: 'GET',
      headers: {
        'User-Agent': 'MovieNight/1.0'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const geoData = JSON.parse(data);
          resolve({
            country: geoData.country_name || 'Unknown',
            city: geoData.city || 'Unknown', 
            countryCode: geoData.country_code || 'XX',
            flag: flagEmojis[geoData.country_code] || '🌍'
          });
        } catch (e) {
          resolve(defaultUnknownGeo);
        }
      });
    });

    req.on('error', (error) => {
      resolve(defaultUnknownGeo);
    });

    req.setTimeout(3000, () => {
      req.destroy();
      resolve(defaultUnknownGeo);
    });

    req.end();
  });
}

function isLocalIP(ip) {
  return ip === '127.0.0.1' || 
         ip === '::1' || 
         ip.startsWith('192.168.') || 
         ip.startsWith('10.') || 
         ip.startsWith('172.');
}

function cleanIPAddress(clientIP) {
  // Take first IP if multiple (comma-separated)
  return clientIP.split(',')[0].trim();
}

module.exports = {
  getGeolocation,
  isLocalIP,
  cleanIPAddress
};