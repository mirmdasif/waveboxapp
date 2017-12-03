const open = require('open')
class Utils {
  static openExternal(url) {
    open(url, 'chromium-browser')
  }
}

module.exports = Utils
