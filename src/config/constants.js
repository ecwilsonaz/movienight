// Country code to flag emoji mapping
const flagEmojis = {
  'US': '🇺🇸', 'CA': '🇨🇦', 'GB': '🇬🇧', 'FR': '🇫🇷', 'DE': '🇩🇪', 'IT': '🇮🇹', 'ES': '🇪🇸',
  'AU': '🇦🇺', 'JP': '🇯🇵', 'CN': '🇨🇳', 'IN': '🇮🇳', 'BR': '🇧🇷', 'MX': '🇲🇽', 'RU': '🇷🇺',
  'KR': '🇰🇷', 'NL': '🇳🇱', 'SE': '🇸🇪', 'NO': '🇳🇴', 'DK': '🇩🇰', 'FI': '🇫🇮', 'CH': '🇨🇭',
  'AT': '🇦🇹', 'BE': '🇧🇪', 'IE': '🇮🇪', 'PT': '🇵🇹', 'GR': '🇬🇷', 'PL': '🇵🇱', 'CZ': '🇨🇿',
  'HU': '🇭🇺', 'RO': '🇷🇴', 'BG': '🇧🇬', 'HR': '🇭🇷', 'SI': '🇸🇮', 'SK': '🇸🇰', 'LT': '🇱🇹',
  'LV': '🇱🇻', 'EE': '🇪🇪', 'TR': '🇹🇷', 'IL': '🇮🇱', 'SA': '🇸🇦', 'AE': '🇦🇪', 'EG': '🇪🇬',
  'ZA': '🇿🇦', 'NG': '🇳🇬', 'KE': '🇰🇪', 'MA': '🇲🇦', 'TN': '🇹🇳', 'AR': '🇦🇷', 'CL': '🇨🇱',
  'CO': '🇨🇴', 'PE': '🇵🇪', 'VE': '🇻🇪', 'UY': '🇺🇾', 'EC': '🇪🇨', 'BO': '🇧🇴', 'PY': '🇵🇾',
  'TH': '🇹🇭', 'VN': '🇻🇳', 'MY': '🇲🇾', 'SG': '🇸🇬', 'ID': '🇮🇩', 'PH': '🇵🇭', 'TW': '🇹🇼',
  'HK': '🇭🇰', 'NZ': '🇳🇿', 'PK': '🇵🇰', 'BD': '🇧🇩', 'LK': '🇱🇰', 'MM': '🇲🇲', 'KH': '🇰🇭',
  'LA': '🇱🇦', 'NP': '🇳🇵', 'BT': '🇧🇹', 'MN': '🇲🇳', 'KZ': '🇰🇿', 'UZ': '🇺🇿', 'KG': '🇰🇬',
  'TJ': '🇹🇯', 'TM': '🇹🇲', 'AF': '🇦🇫', 'IQ': '🇮🇶', 'IR': '🇮🇷', 'SY': '🇸🇾', 'LB': '🇱🇧',
  'JO': '🇯🇴', 'PS': '🇵🇸', 'KW': '🇰🇼', 'QA': '🇶🇦', 'BH': '🇧🇭', 'OM': '🇴🇲', 'YE': '🇾🇪'
};

// Network quality indicators
const networkQualityEmojis = {
  'excellent': '🟢',
  'good': '🟡', 
  'fair': '🟠',
  'poor': '🔴'
};

// Default network quality thresholds
const networkQualityThresholds = {
  desktop: {
    excellent: 50,
    good: 150,
    fair: 300
  },
  mobile: {
    excellent: 80,
    good: 200,
    fair: 400
  }
};

// Default geolocation for localhost/private IPs
const defaultLocalGeo = {
  country: 'Local',
  city: 'Localhost',
  countryCode: 'LOCAL',
  flag: '🏠'
};

// Default geolocation for unknown/error cases
const defaultUnknownGeo = {
  country: 'Unknown',
  city: 'Unknown',
  countryCode: 'XX',
  flag: '🌍'
};

module.exports = {
  flagEmojis,
  networkQualityEmojis,
  networkQualityThresholds,
  defaultLocalGeo,
  defaultUnknownGeo
};