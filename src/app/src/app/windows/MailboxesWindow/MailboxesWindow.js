const { app, ipcMain, shell } = require('electron')
const appWindowManager = require('../../appWindowManager')
const WaveboxWindow = require('../WaveboxWindow')
const ContentWindow = require('../ContentWindow')
const ContentPopupWindow = require('../ContentPopupWindow')
const path = require('path')
const url = require('url')
const MailboxesSessionManager = require('./MailboxesSessionManager')
const settingStore = require('../../stores/settingStore')
const userStore = require('../../stores/userStore')
const mailboxStore = require('../../stores/mailboxStore')
const CoreService = require('../../../shared/Models/Accounts/CoreService')
const CoreMailbox = require('../../../shared/Models/Accounts/CoreMailbox')
const ClassTools = require('../../ClassTools')
const Utils = require('../../Utils')
const CRExtensionUISubscriber = require('../../Extensions/Chrome/CRExtensionUISubscriber')
const {
  AuthGoogle,
  AuthMicrosoft,
  AuthSlack,
  AuthTrello,
  AuthWavebox
} = require('../../AuthProviders')
const querystring = require('querystring')
const electron = require('electron')
const {
  WB_MAILBOXES_WINDOW_REQUEST_GRACEFUL_RELOAD,
  WB_MAILBOXES_WINDOW_ACCEPT_GRACEFUL_RELOAD,
  WB_MAILBOXES_WINDOW_TOGGLE_SIDEBAR,
  WB_MAILBOXES_WINDOW_TOGGLE_APP_MENU,
  WB_MAILBOXES_WINDOW_DOWNLOAD_COMPLETE,
  WB_MAILBOXES_WINDOW_OPEN_MAILTO_LINK,
  WB_MAILBOXES_WINDOW_SWITCH_MAILBOX,
  WB_MAILBOXES_WINDOW_SWITCH_SERVICE,
  WB_WINDOW_NAVIGATE_WEBVIEW_BACK,
  WB_WINDOW_NAVIGATE_WEBVIEW_FORWARD,
  WB_MAILBOXES_WINDOW_SHOW_SETTINGS,
  WB_MAILBOXES_WINDOW_SHOW_SUPPORT_CENTER,
  WB_MAILBOXES_WINDOW_SHOW_NEWS,
  WB_MAILBOXES_WINDOW_ADD_ACCOUNT,
  WB_MAILBOXES_WINDOW_MAILBOX_WEBVIEW_ATTACHED,
  WB_MAILBOXES_WINDOW_EXTENSION_WEBVIEW_ATTACHED,
  WB_MAILBOXES_WINDOW_FETCH_OPEN_WINDOW_COUNT,
  WB_NEW_WINDOW,

  WB_USER_CHECK_FOR_UPDATE,
  WB_SQUIRREL_UPDATE_DOWNLOADED,
  WB_SQUIRREL_UPDATE_ERROR,
  WB_SQUIRREL_UPDATE_AVAILABLE,
  WB_SQUIRREL_UPDATE_NOT_AVAILABLE,
  WB_SQUIRREL_UPDATE_CHECK_START,
  WB_SQUIRREL_UPDATE_DISABLED
} = require('../../../shared/ipcEvents')
const {
  WAVEBOX_CAPTURE_URL_PREFIX,
  WAVEBOX_CAPTURE_URL_HOSTNAME
} = require('../../../shared/constants')
const {
  WAVEBOX_HOSTED_EXTENSION_PROTOCOL
} = require('../../../shared/extensionApis')
const {
  TraySettings: { SUPPORTS_TRAY_MINIMIZE_CONFIG }
} = require('../../../shared/Models/Settings')

const MAILBOXES_DIR = path.resolve(path.join(__dirname, '/../../../../scenes/mailboxes'))
const ALLOWED_URLS = [
  'file://' + path.join(MAILBOXES_DIR, 'mailboxes.html'),
  'file://' + path.join(MAILBOXES_DIR, 'offline.html')
]
const MIN_WINDOW_WIDTH = 400
const MIN_WINDOW_HEIGHT = 300

class MailboxesWindow extends WaveboxWindow {
  /* ****************************************************************************/
  // Lifecycle
  /* ****************************************************************************/

  constructor () {
    super('mailbox_window_state')
    this.authGoogle = new AuthGoogle()
    this.authTrello = new AuthTrello()
    this.authSlack = new AuthSlack()
    this.authMicrosoft = new AuthMicrosoft()
    this.authWavebox = new AuthWavebox()
    this.sessionManager = new MailboxesSessionManager(this)
    this.attachedMailboxes = new Map()
    this.attachedExtensions = new Map()
    this.provisionalTargetUrls = new Map()
    this.gracefulReloadTimeout = null

    ClassTools.autobindFunctions(this, [
      'handleAppWebContentsCreated',
      'handleMailboxesWebViewAttached',
      'handleExtensionWebViewAttached',
      'handleOpenNewWindow',
      'handleFetchOpenWindowCount',
      'handleAcceptGracefulReload'
    ])
  }

  /**
  * Generates the url for the window
  * @return a fully qualified url to give to the window object
  */
  generateWindowUrl () {
    const params = querystring.stringify({
      clientId: userStore.clientId,
      clientToken: userStore.clientToken
    })
    return `file://${path.join(MAILBOXES_DIR, 'mailboxes.html')}?${params}`
  }

  /* ****************************************************************************/
  // Window lifecycle
  /* ****************************************************************************/

  /**
  * Starts the app
  * @param hidden=false: true to start hidden
  * @return this
  */
  create (hidden = false) {
    const screenSize = electron.screen.getPrimaryDisplay().workAreaSize
    super.create(this.generateWindowUrl(), {
      show: false,
      minWidth: MIN_WINDOW_WIDTH,
      minHeight: MIN_WINDOW_HEIGHT,
      width: Math.min(Math.max(screenSize.width, MIN_WINDOW_WIDTH), 1200),
      height: Math.min(Math.max(screenSize.height, MIN_WINDOW_HEIGHT), 1000),
      fullscreenable: true,
      titleBarStyle: process.platform === 'darwin' && settingStore.ui.showTitlebar === false ? 'hidden' : 'default',
      frame: settingStore.ui.showTitlebar,
      title: 'Wavebox',
      backgroundColor: '#f2f2f2',
      webPreferences: {
        nodeIntegration: true,
        backgroundThrottling: false,
        plugins: true
      }
    })
    this.window.once('ready-to-show', () => {
      if (!hidden) { this.show() }
    })

    // Bind window behaviour events
    if (SUPPORTS_TRAY_MINIMIZE_CONFIG) {
      // Preventing default on minimize has little effect. The window saver doesn't take note of minimized state
      // though so we can query this to see what the last state was and re-apply that on restore
      this.window.on('minimize', (evt) => {
        if (settingStore.tray.show && settingStore.tray.hideWhenMinimized) {
          evt.preventDefault()
          this.window.hide()
        }
      })
    }

    // Bind event listeners
    app.on('web-contents-created', this.handleAppWebContentsCreated)
    ipcMain.on(WB_MAILBOXES_WINDOW_MAILBOX_WEBVIEW_ATTACHED, this.handleMailboxesWebViewAttached)
    ipcMain.on(WB_MAILBOXES_WINDOW_EXTENSION_WEBVIEW_ATTACHED, this.handleExtensionWebViewAttached)
    ipcMain.on(WB_NEW_WINDOW, this.handleOpenNewWindow)
    ipcMain.on(WB_MAILBOXES_WINDOW_FETCH_OPEN_WINDOW_COUNT, this.handleFetchOpenWindowCount)
    ipcMain.on(WB_MAILBOXES_WINDOW_ACCEPT_GRACEFUL_RELOAD, this.handleAcceptGracefulReload)

    // We're locking on to our window. This stops file drags redirecting the page
    this.window.webContents.on('will-navigate', (evt, url) => {
      const match = ALLOWED_URLS.findIndex((allowed) => allowed.indexOf(url) === 0)
      if (!match) {
        evt.preventDefault()
      }
    })

    // remove built in listener so we can handle this on our own
    this.window.webContents.removeAllListeners('devtools-reload-page')
    this.window.webContents.on('devtools-reload-page', () => this.reload())

    CRExtensionUISubscriber.subscribe(this.window.webContents)

    return this
  }

  /**
  * Handles destroy being called
  */
  destroy (evt) {
    clearTimeout(this.gracefulReloadTimeout)
    app.removeListener('web-contents-created', this.handleAppWebContentsCreated)
    ipcMain.removeListener(WB_MAILBOXES_WINDOW_MAILBOX_WEBVIEW_ATTACHED, this.handleMailboxesWebViewAttached)
    ipcMain.removeListener(WB_MAILBOXES_WINDOW_EXTENSION_WEBVIEW_ATTACHED, this.handleExtensionWebViewAttached)
    ipcMain.removeListener(WB_NEW_WINDOW, this.handleOpenNewWindow)
    ipcMain.removeListener(WB_MAILBOXES_WINDOW_FETCH_OPEN_WINDOW_COUNT, this.handleFetchOpenWindowCount)
    ipcMain.removeListener(WB_MAILBOXES_WINDOW_ACCEPT_GRACEFUL_RELOAD, this.handleAcceptGracefulReload)
    super.destroy(evt)
  }

  /* ****************************************************************************/
  // App Events
  /* ****************************************************************************/

  /**
  * Handles a new web contents being created
  * @param evt: the event that fired
  * @param contents: the webcontent that were created
  */
  handleAppWebContentsCreated (evt, contents) {
    if (contents.getType() === 'webview' && contents.hostWebContents === this.window.webContents) {
      contents.on('new-window', (evt, targetUrl, frameName, disposition, options, additionalFeatures) => {
        this.handleWebViewNewWindow(contents.id, evt, targetUrl, frameName, disposition, options, additionalFeatures)
      })
      contents.on('will-navigate', (evt, url) => {
        this.handleWebViewWillNavigate(contents.id, evt, url)
      })
      contents.on('update-target-url', (evt, url) => {
        this.handleWebViewUpdateTargetUrl(contents.id, evt, url)
      })
    }
  }

  /**
  * Handles a mailboes webview being attached
  * @param evt: the event that fired
  * @param data: the data that came with the event
  */
  handleMailboxesWebViewAttached (evt, data) {
    if (evt.sender === this.window.webContents) {
      this.attachedMailboxes.set(data.webContentsId, data)
    }
  }

  /**
  * Handles an extension webview being attached
  */
  handleExtensionWebViewAttached (evt, data) {
    if (evt.sender === this.window.webContents) {
      this.attachedExtensions.set(data.webContentsId, data)
    }
  }

  /**
  * Opens a new content window
  * @param evt: the event that fired
  * @param body: the arguments from the body
  */
  handleOpenNewWindow (evt, body) {
    if (evt.sender === this.window.webContents) {
      const contentWindow = new ContentWindow()
      contentWindow.ownerId = `${body.mailboxId}:${body.serviceType}`
      appWindowManager.addContentWindow(contentWindow)
      contentWindow.create(this.window, body.url, body.partition, body.windowPreferences, body.webPreferences)
    }
  }

  /**
  * Handles the webview accepting a graceful reload
  * @param evt: the event that fired
  * @param body: the arguments from the body
  */
  handleAcceptGracefulReload (evt, body) {
    if (evt.sender === this.window.webContents) {
      clearTimeout(this.gracefulReloadTimeout)
      this.window.loadURL(this.generateWindowUrl())
    }
  }

  /* ****************************************************************************/
  // Content window getters
  /* ****************************************************************************/

  /**
  * Gets the list of open windows for the specified mailbox and service
  * @param evt: the event that fired
  * @param body: the message sent
  */
  handleFetchOpenWindowCount (evt, body) {
    if (evt.sender === this.window.webContents) {
      const ownerId = `${body.mailboxId}:${body.serviceType}`
      const count = appWindowManager.getContentWindowsWithOwnerId(ownerId).length
      if (body.response) {
        evt.sender.send(body.response, { count: count })
      } else {
        evt.returnValue = { count: count }
      }
    }
  }

  /* ****************************************************************************/
  // WebView Events
  /* ****************************************************************************/

  /**
  * Handles a new window being generated from a webview
  * @param webContentsId: the id of the webcontents
  * @param evt: the event that fired
  * @param targetUrl: the webview url
  * @param frameName: the name of the frame
  * @param disposition: the frame disposition
  * @param options: the browser window options
  * @param additionalFeatures: The non-standard features
  */
  handleWebViewNewWindow (webContentsId, evt, targetUrl, frameName, disposition, options, additionalFeatures) {
    evt.preventDefault()

    // Check for some urls to never handle
    const purl = url.parse(targetUrl, true)
    if (purl.hostname === WAVEBOX_CAPTURE_URL_HOSTNAME && purl.pathname.startsWith(WAVEBOX_CAPTURE_URL_PREFIX)) { return }

    // Handle other urls
    let openMode = CoreService.WINDOW_OPEN_MODES.EXTERNAL
    let ownerId = null
    let mailbox = null
    let service = null
    let provisionalTargetUrl

    // Grab the service and mailbox
    if (this.attachedMailboxes.has(webContentsId)) {
      const { mailboxId, serviceType } = this.attachedMailboxes.get(webContentsId)
      ownerId = `${mailboxId}:${serviceType}`
      mailbox = mailboxStore.getMailbox(mailboxId)
      service = mailboxStore.getService(mailboxId, serviceType)
    }

    if (service) {
      provisionalTargetUrl = this.provisionalTargetUrls.get(ownerId)
      openMode = service.getWindowOpenModeForUrl(
        targetUrl,
        purl,
        disposition,
        provisionalTargetUrl,
        provisionalTargetUrl ? url.parse(provisionalTargetUrl, true) : undefined
      )
    }

    if (openMode === CoreService.WINDOW_OPEN_MODES.POPUP_CONTENT) {
      evt.newGuest = this.openWindowWaveboxPopupContent(ownerId, targetUrl, options).window
    } else if (openMode === CoreService.WINDOW_OPEN_MODES.EXTERNAL) {
      this.openWindowExternal(targetUrl, mailbox)
    } else if (openMode === CoreService.WINDOW_OPEN_MODES.DEFAULT) {
      this.openWindowDefault(ownerId, mailbox, targetUrl, options)
    } else if (openMode === CoreService.WINDOW_OPEN_MODES.EXTERNAL_PROVSIONAL) {
      this.openWindowExternal(provisionalTargetUrl, mailbox)
    } else if (openMode === CoreService.WINDOW_OPEN_MODES.DEFAULT_PROVISIONAL) {
      this.openWindowDefault(ownerId, mailbox, provisionalTargetUrl, options)
    } else if (openMode === CoreService.WINDOW_OPEN_MODES.CONTENT) {
      this.openWindowWaveboxContent(ownerId, targetUrl, options)
    } else if (openMode === CoreService.WINDOW_OPEN_MODES.CONTENT_PROVSIONAL) {
      this.openWindowWaveboxContent(ownerId, provisionalTargetUrl, options)
    } else if (openMode === CoreService.WINDOW_OPEN_MODES.DOWNLOAD) {
      if ((options || {}).webContents) {
        options.webContents.downloadURL(targetUrl)
      }
    }
  }

  /**
  * Handles the webview navigating
  * @param webContentsId: the id of the web contents
  * @param evt: the event that fired
  * @param targetUrl: the url we're navigating to
  */
  handleWebViewWillNavigate (webContentsId, evt, targetUrl) {
    // Extensions
    if (this.attachedExtensions.has(webContentsId)) {
      if (url.parse(targetUrl).protocol !== WAVEBOX_HOSTED_EXTENSION_PROTOCOL + ':') {
        evt.preventDefault()
        return
      }
    }

    // Navigation modes
    if (this.attachedMailboxes.has(webContentsId)) {
      const { mailboxId, serviceType } = this.attachedMailboxes.get(webContentsId)
      let navigateMode = CoreService.NAVIGATE_MODES.DEFAULT
      const mailbox = mailboxStore.getMailbox(mailboxId)
      const service = mailboxStore.getService(mailboxId, serviceType)
      if (service) {
        navigateMode = service.getNavigateModeForUrl(targetUrl, url.parse(targetUrl, true))
      }

      if (navigateMode === CoreService.NAVIGATE_MODES.SUPPRESS) {
        evt.preventDefault()
      } else if (navigateMode === CoreService.NAVIGATE_MODES.OPEN_EXTERNAL) {
        evt.preventDefault()
        this.openWindowExternal(targetUrl, mailbox)
      } else if (navigateMode === CoreService.NAVIGATE_MODES.OPEN_CONTENT) {
        evt.preventDefault()
        this.openWindowWaveboxContent(webContentsId, targetUrl, {
          webPreferences: {
            partition: 'persist:' + mailboxId
          }
        })
      }
    }
  }

  /**
  * Handles the target url of a webcontents updating
  * @param webContentsId: the id of the web contents
  * @param evt: the event that fired
  * @param targetUrl: the url we're pointing at
  */
  handleWebViewUpdateTargetUrl (webContentsId, evt, targetUrl) {
    if (this.attachedMailboxes.has(webContentsId)) {
      const { mailboxId, serviceType } = this.attachedMailboxes.get(webContentsId)
      const ownerId = `${mailboxId}:${serviceType}`
      this.provisionalTargetUrls.set(ownerId, targetUrl)
    }
  }

  /* ****************************************************************************/
  // Window opening
  /* ****************************************************************************/

  /**
  * Opens a window with the default behaviour
  * @param ownerId: the id of the owning window
  * @param mailbox: the mailbox that's attempting to open
  * @param targetUrl: the url to open
  * @param options: the config options for the window
  */
  openWindowDefault (ownerId, mailbox, targetUrl, options) {
    if (!mailbox) {
      this.openWindowExternal(targetUrl, mailbox)
    } else {
      if (mailbox.defaultWindowOpenMode === CoreMailbox.DEFAULT_WINDOW_OPEN_MODES.BROWSER) {
        this.openWindowExternal(targetUrl, mailbox)
      } else if (mailbox.defaultWindowOpenMode === CoreMailbox.DEFAULT_WINDOW_OPEN_MODES.WAVEBOX) {
        this.openWindowWaveboxContent(ownerId, targetUrl, options)
      }
    }
  }

  /**
  * Opens a wavebox popup content window
  * @param ownerId: the id of the owning window
  * @param targetUrl: the url to open
  * @param options: the config options for the window
  * @return the new contentwindow instance
  */
  openWindowWaveboxPopupContent (ownerId, targetUrl, options) {
    const contentWindow = new ContentPopupWindow()
    contentWindow.ownerId = ownerId
    appWindowManager.addContentWindow(contentWindow)
    contentWindow.create(targetUrl, options)
    return contentWindow
  }

  /**
  * Opens a wavebox content window
  * @param ownerId: the id of the owning window
  * @param targetUrl: the url to open
  * @param options: the config options for the window
  * @return the new  contentwindow instance
  */
  openWindowWaveboxContent (ownerId, targetUrl, options) {
    const contentWindow = new ContentWindow()
    contentWindow.ownerId = ownerId
    appWindowManager.addContentWindow(contentWindow)
    contentWindow.create(this.window, targetUrl, ((options || {}).webPreferences || {}).partition, options)
    return contentWindow
  }

  /**
  * Opens links in an external window
  * @param targetUrl: the url to open
  * @param mailbox=undefined: the mailbox to take the settings from if available
  */
  openWindowExternal (targetUrl, mailbox = undefined) {
    // shell.openExternal(targetUrl, {
    //   activate: !settingStore.os.openLinksInBackground
    // })
    Utils.openExternal(targetUrl)
  }

  /* ****************************************************************************/
  // Mailbox Actions
  /* ****************************************************************************/

  /**
  * Reloads the webview
  * @return this
  */
  reload () {
    clearTimeout(this.gracefulReloadTimeout)
    this.window.webContents.send(WB_MAILBOXES_WINDOW_REQUEST_GRACEFUL_RELOAD, {})
    this.gracefulReloadTimeout = setTimeout(() => {
      this.window.loadURL(this.generateWindowUrl())
    }, 750)
    return this
  }

  /**
  * Launches the preferences modal
  * @return this
  */
  launchPreferences () {
    this.window.webContents.send(WB_MAILBOXES_WINDOW_SHOW_SETTINGS, { })
    return this
  }

  /**
  * Launches the support center
  * @return this
  */
  launchSupportCenter () {
    this.window.webContents.send(WB_MAILBOXES_WINDOW_SHOW_SUPPORT_CENTER, {})
    return this
  }

  /**
  * Launches the whats new/news window
  * @return this
  */
  launchWhatsNew () {
    this.window.webContents.send(WB_MAILBOXES_WINDOW_SHOW_NEWS, {})
    return this
  }

  /**
  * Starts the account process
  * @return this
  */
  addAccount () {
    this.window.webContents.send(WB_MAILBOXES_WINDOW_ADD_ACCOUNT, { })
    return this
  }

  /**
  * Toggles the sidebar
  * @return this
  */
  toggleSidebar () {
    this.window.webContents.send(WB_MAILBOXES_WINDOW_TOGGLE_SIDEBAR, { })
    return this
  }

  /**
  * Toggles the app menu
  * @return this
  */
  toggleAppMenu () {
    this.window.webContents.send(WB_MAILBOXES_WINDOW_TOGGLE_APP_MENU, { })
    return this
  }

  /**
  * Tells the frame a download is complete
  * @param path: the path of the saved file
  * @param filename: the name of the file
  * @return this
  */
  downloadCompleted (path, filename) {
    this.window.webContents.send(WB_MAILBOXES_WINDOW_DOWNLOAD_COMPLETE, {
      path: path,
      filename: filename
    })
    return this
  }

  /**
  * Opens a mailto link
  * @param mailtoLink: the link to open
  * @return this
  */
  openMailtoLink (mailtoLink) {
    this.window.webContents.send(WB_MAILBOXES_WINDOW_OPEN_MAILTO_LINK, { mailtoLink: mailtoLink })
    return this
  }

  /* ****************************************************************************/
  // Mailbox Actions: Switching Mailbox
  /* ****************************************************************************/

  /**
  * Switches mailbox
  * @param mailboxId: the id of the mailbox to switch to
  * @param serviceType=undefined: the type of service to also switch to if desired
  * @return this
  */
  switchMailbox (mailboxId, serviceType = undefined) {
    this.show().focus()
    this.window.webContents.send(WB_MAILBOXES_WINDOW_SWITCH_MAILBOX, {
      mailboxId: mailboxId,
      serviceType: serviceType
    })
    return this
  }

  /**
  * Switches to the previous mailbox
  * @param allowCycling=false: set to true to allow cycling at end/beginning
  * @return this
  */
  switchPrevMailbox (allowCycling = false) {
    this.show().focus()
    this.window.webContents.send(WB_MAILBOXES_WINDOW_SWITCH_MAILBOX, { prev: true, allowCycling: allowCycling })
    return this
  }

  /**
  * Switches to the next mailbox
  * @param allowCycling=false: set to true to allow cycling at end/beginning
  * @return this
  */
  switchNextMailbox (allowCycling = false) {
    this.show().focus()
    this.window.webContents.send(WB_MAILBOXES_WINDOW_SWITCH_MAILBOX, { next: true, allowCycling: allowCycling })
    return this
  }

  /* ****************************************************************************/
  // Mailbox Actions: Switching Services
  /* ****************************************************************************/

  /**
  * Switches to a service at the given index. This call will fail silently if there is no
  * service at the given index
  * @param index: the index you want to switch to
  * @return this
  */
  switchToServiceAtIndex (index) {
    this.show().focus()
    this.window.webContents.send(WB_MAILBOXES_WINDOW_SWITCH_SERVICE, { index: index })
    return this
  }

  /**
  * Switches to the previous service
  * @param allowCycling=false: set to true to allow cycling at end/beginning
  * @return this
  */
  switchPrevService (allowCycling = false) {
    this.show().focus()
    this.window.webContents.send(WB_MAILBOXES_WINDOW_SWITCH_SERVICE, { prev: true, allowCycling: allowCycling })
    return this
  }

  /**
  * Switches to the next service
  * @param allowCycling=false: set to true to allow cycling at end/beginning
  * @return this
  */
  switchNextService (allowCycling = false) {
    this.show().focus()
    this.window.webContents.send(WB_MAILBOXES_WINDOW_SWITCH_SERVICE, { next: true, allowCycling: allowCycling })
    return this
  }

  /* ****************************************************************************/
  // Mailbox Actions: Navigation
  /* ****************************************************************************/

  /**
  * Tells the active mailbox to navigate back
  * @return this
  */
  navigateBack () {
    this.window.webContents.send(WB_WINDOW_NAVIGATE_WEBVIEW_BACK, { })
    return this
  }

  /**
  * Tells the active mailbox to navigate back
  * @return this
  */
  navigateForward () {
    this.window.webContents.send(WB_WINDOW_NAVIGATE_WEBVIEW_FORWARD, { })
    return this
  }

  /* ****************************************************************************/
  // Mailbox Actions: Update
  /* ****************************************************************************/

  /**
  * Checks for updates and keeps the UI up to date with progress
  */
  userCheckForUpdate () {
    this.window.webContents.send(WB_USER_CHECK_FOR_UPDATE, {})
  }

  /* ****************************************************************************/
  // Mailbox Actions: Squirrel
  /* ****************************************************************************/

  /**
  * Indicates that the squirrel update service downloaded an update
  */
  squirrelUpdateDownloaded () {
    this.window.webContents.send(WB_SQUIRREL_UPDATE_DOWNLOADED, { })
  }

  /**
  * Indicates that the squirrel update failed to check or fetch updates
  */
  squirrelUpdateError () {
    this.window.webContents.send(WB_SQUIRREL_UPDATE_ERROR, { })
  }

  /**
  * Indicates that the squirrel update is available
  */
  squirrelUpdateAvailable () {
    this.window.webContents.send(WB_SQUIRREL_UPDATE_AVAILABLE, { })
  }

  /**
  * Indicates that the squirrel update is not available
  */
  squirrelUpdateNotAvailable () {
    this.window.webContents.send(WB_SQUIRREL_UPDATE_NOT_AVAILABLE, { })
  }

  /**
  * Indicates that squirrel is checking for updates
  */
  squirrelCheckingForUpdate () {
    this.window.webContents.send(WB_SQUIRREL_UPDATE_CHECK_START, { })
  }

  /**
  * Indicates that squirrel updates have been disabled
  */
  squirrelUpdateDisabled () {
    this.window.webContents.send(WB_SQUIRREL_UPDATE_DISABLED, { })
  }
}

module.exports = MailboxesWindow
